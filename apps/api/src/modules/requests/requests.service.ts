import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIG, type AppConfig } from '@config';
import { AppException } from '@common/errors/app.exception';
import { ErrorCode } from '@common/errors/error-codes';
import { DecisionResult, Locale, RejectionReason, RequestStatus, UserRole } from '@db/enums';
import type { Comment, Quote } from '@db';
import { AUTH_PUBLIC_SERVICE, type AuthPublicService } from '@modules/auth/public';
import {
  FILES_PUBLIC_SERVICE,
  type FileMeta,
  type FilesPublicService,
} from '@modules/files/public';
import {
  NOTIFICATIONS_PUBLIC_SERVICE,
  type NotificationsPublicService,
} from '@modules/notifications/public';
import { PRICING_PUBLIC_SERVICE, type PricingPublicService } from '@modules/pricing/public';
import type { CreateCommentDto } from './dto/create-comment.dto';
import type { CreateRequestDto } from './dto/create-request.dto';
import type { DecisionDto } from './dto/decision.dto';
import { RequestsRepository, type RequestWithDecision } from './requests.repository';
import {
  CLIENT_ATTENTION_STATUSES,
  checkTransition,
  isStaffRole,
  TERMINAL_STATUSES,
} from './status-machine';
import type {
  CommentView,
  RequestDetailView,
  RequestFileView,
  RequestQuoteView,
  RequestQuoteWithKey,
  RequestsPublicService,
  RequestView,
  StatusLogView,
  TransitionCommand,
} from './public';

/**
 * Антидубль вместо снятого инварианта «одна активная заявка».
 *
 * Заявок у клиента может быть сколько угодно одновременно, но три штуки за час
 * — это уже не «второй объект», а промах по кнопке или перезагрузка страницы
 * с повторной отправкой. Порог выбран выше правдоподобного ручного сценария
 * (посчитал и отправил два-три объекта подряд) и ниже любого случайного
 * дребезга.
 */
export const MAX_REQUESTS_PER_WINDOW = 3;

/** Длина окна антидубля — один час. */
export const REQUEST_WINDOW_MS = 60 * 60 * 1000;

@Injectable()
export class RequestsService implements RequestsPublicService {
  private readonly logger = new Logger(RequestsService.name);

  constructor(
    private readonly repository: RequestsRepository,
    @Inject(PRICING_PUBLIC_SERVICE) private readonly pricing: PricingPublicService,
    @Inject(FILES_PUBLIC_SERVICE) private readonly files: FilesPublicService,
    @Inject(AUTH_PUBLIC_SERVICE) private readonly auth: AuthPublicService,
    @Inject(NOTIFICATIONS_PUBLIC_SERVICE)
    private readonly notifications: NotificationsPublicService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  // --- создание ------------------------------------------------------------

  async create(userId: string, dto: CreateRequestDto): Promise<RequestView> {
    let needsManual = true;
    let quickEstimateId: string | null = null;

    if (dto.quickEstimateId) {
      const estimate = await this.pricing.getQuickEstimate(dto.quickEstimateId, userId);
      if (!estimate) {
        throw new AppException(404, ErrorCode.NOT_FOUND, 'Quick estimate not found');
      }
      // Расчёт действует 30 дней; протухший требует пересчёта (MVP §7).
      if (new Date(estimate.expiresAt).getTime() < Date.now()) {
        throw new AppException(410, ErrorCode.ESTIMATE_EXPIRED, 'Quick estimate expired');
      }
      needsManual = estimate.needsManualReview;
      quickEstimateId = estimate.id;
    }

    const created = await this.repository.createWithLogWithinLimit(
      {
        userId,
        quickEstimateId,
        status: RequestStatus.NEW,
        address: dto.address.trim(),
        needsManual,
        comment: dto.comment ?? null,
      },
      {
        maxPerWindow: MAX_REQUESTS_PER_WINDOW,
        windowStart: new Date(Date.now() - REQUEST_WINDOW_MS),
      },
    );

    if (!created) {
      throw new AppException(
        429,
        ErrorCode.REQUEST_LIMIT_REACHED,
        `No more than ${MAX_REQUESTS_PER_WINDOW} requests per hour`,
      );
    }

    if (dto.fileIds && dto.fileIds.length > 0) {
      await this.files.attachToRequest(dto.fileIds, created.id, userId);
    }

    const user = await this.auth.getUserById(userId);
    if (user) {
      await this.notifications.send({
        type: 'REQUEST_SUBMITTED',
        to: user.email,
        locale: user.locale,
        requestNumber: created.number,
      });
    }

    this.logger.log(
      `event=request_submitted request=${created.id} needsManual=${needsManual} files=${dto.fileIds?.length ?? 0}`,
    );
    return this.toView(created);
  }

  // --- чтение --------------------------------------------------------------

  async getById(requestId: string): Promise<RequestView | null> {
    const request = await this.repository.findById(requestId);
    return request ? this.toView(request) : null;
  }

  async getDetailById(requestId: string): Promise<RequestDetailView | null> {
    const request = await this.repository.findById(requestId);
    if (!request) return null;
    return this.toDetailView(request);
  }

  /** Чтение с проверкой доступа: свои заявки — клиенту, любые — сотруднику. */
  async getForActor(
    requestId: string,
    actor: { id: string; role: UserRole },
  ): Promise<RequestDetailView> {
    const request = await this.repository.findById(requestId);
    if (!request) throw new AppException(404, ErrorCode.NOT_FOUND, 'Request not found');
    if (!isStaffRole(actor.role) && request.userId !== actor.id) {
      throw new AppException(403, ErrorCode.FORBIDDEN, 'Request belongs to another user');
    }
    return this.toDetailView(request);
  }

  /**
   * Список заявок клиента. Сначала те, где ход за клиентом (смета готова,
   * нужны данные), дальше — по дате последнего изменения: кабинет открывают,
   * чтобы увидеть, что требуется сделать.
   */
  async listOwn(userId: string): Promise<RequestView[]> {
    const requests = await this.repository.listByUser(userId);
    const ordered = [
      ...requests.filter((request) => CLIENT_ATTENTION_STATUSES.includes(request.status)),
      ...requests.filter((request) => !CLIENT_ATTENTION_STATUSES.includes(request.status)),
    ];
    return this.toViews(ordered);
  }

  async isOwnedBy(requestId: string, userId: string): Promise<boolean> {
    const request = await this.repository.findById(requestId);
    return request !== null && request.userId === userId;
  }

  async listForStaff(params: {
    status?: RequestStatus;
    userIds?: string[];
    page: number;
    pageSize: number;
    sortDirection: 'asc' | 'desc';
  }): Promise<{ items: RequestView[]; total: number }> {
    const { items, total } = await this.repository.list({
      ...(params.status ? { status: params.status } : {}),
      ...(params.userIds ? { userIds: params.userIds } : {}),
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      sortDirection: params.sortDirection,
    });
    return { items: await this.toViews(items), total };
  }

  async getStatusLog(requestId: string): Promise<StatusLogView[]> {
    const entries = await this.repository.listStatusLog(requestId);
    return entries.map((entry) => ({
      id: entry.id,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      actorId: entry.actorId,
      comment: entry.comment,
      createdAt: entry.createdAt.toISOString(),
    }));
  }

  // --- обсуждение ----------------------------------------------------------

  /**
   * Новое сообщение в обсуждении заявки.
   *
   * Обсуждение существует ради одного: чтобы сметчик спросил, а клиент дослал
   * недостающее, не поднимая трубку. Поэтому писать может и клиент в своей
   * заявке, и сотрудник в любой, а право проверяется здесь, на каждом запросе,
   * а не скрытием кнопки в интерфейсе.
   *
   * Правки и удаления нет: переписка о деньгах — документ. Опечатка
   * исправляется следующим сообщением.
   */
  async addComment(
    requestId: string,
    actor: { id: string; role: UserRole },
    dto: CreateCommentDto,
  ): Promise<CommentView> {
    const request = await this.repository.findById(requestId);
    if (!request) throw new AppException(404, ErrorCode.NOT_FOUND, 'Request not found');
    if (!isStaffRole(actor.role) && request.userId !== actor.id) {
      throw new AppException(403, ErrorCode.FORBIDDEN, 'Request belongs to another user');
    }
    // Лента отклонённой заявки остаётся читаемой, но дописывать в неё нечего:
    // решение необратимо, обсуждать больше нечего.
    if (request.status === RequestStatus.REJECTED) {
      throw new AppException(
        409,
        ErrorCode.DISCUSSION_CLOSED,
        'Discussion is read-only for a rejected request',
      );
    }

    const text = dto.text.trim();
    const fileIds = dto.fileIds ?? [];
    if (text.length === 0 && fileIds.length === 0) {
      throw new AppException(422, ErrorCode.VALIDATION_FAILED, 'Message must carry text or files', {
        details: [{ field: 'text', code: 'REQUIRED' }],
      });
    }

    // Вложения привязываются к заявке ДО создания сообщения: файл, о котором
    // сообщение говорит, обязан уже лежать в заявке, а не появиться позже.
    const attachedIds = await this.attachCommentFiles(fileIds, request.id, actor.id);

    const comment = await this.repository.createComment({
      requestId: request.id,
      authorId: actor.id,
      // Роль пишется в саму запись: учётную запись могут отключить или
      // перевести, а лента обязана остаться читаемой.
      authorRole: actor.role,
      text,
      fileIds: attachedIds,
    });

    const author = await this.auth.getUserById(actor.id);
    await this.notifyComment(request, comment, author?.email ?? null);
    this.logger.log(
      `event=request_comment_added request=${request.id} role=${actor.role} files=${attachedIds.length}`,
    );

    const files = (await this.files.listByRequest(request.id)).filter((file) =>
      attachedIds.includes(file.id),
    );
    return {
      id: comment.id,
      author: { id: actor.id, name: author?.fullName ?? null, role: comment.authorRole },
      text: comment.text,
      createdAt: comment.createdAt.toISOString(),
      files,
    };
  }

  /**
   * Привязка вложений к заявке через модуль files: второго пути загрузки нет,
   * работает та же двухфазная схема с подписанными ссылками.
   *
   * Возвращает только те файлы, которые действительно оказались в заявке:
   * чужие и неподтверждённые модуль files молча отсеивает.
   */
  private async attachCommentFiles(
    fileIds: string[],
    requestId: string,
    userId: string,
  ): Promise<string[]> {
    if (fileIds.length === 0) return [];
    const files = await this.files.attachToRequest(fileIds, requestId, userId);
    return files.filter((file) => fileIds.includes(file.id)).map((file) => file.id);
  }

  /**
   * Письмо на каждое новое сообщение — требование заказчика. Исключение
   * ровно одно: автору его собственного сообщения письма не уходит.
   *
   * Написал сотрудник — пишем клиенту; написал клиент — на общий ящик
   * `MANAGER_EMAIL` (роли «менеджер» в системе нет, ARCHITECTURE §11, вопрос 7).
   */
  private async notifyComment(
    request: RequestWithDecision,
    comment: Comment,
    authorEmail: string | null,
  ): Promise<void> {
    const byStaff = isStaffRole(comment.authorRole);
    const owner = await this.auth.getUserById(request.userId);
    const to = byStaff ? (owner?.email ?? null) : this.config.mail.managerEmail || null;
    if (!to) {
      this.logger.warn(`сообщение по заявке ${request.id}: некому отправить письмо`);
      return;
    }
    if (authorEmail && to.toLowerCase() === authorEmail.toLowerCase()) return;

    await this.notifications.send({
      type: 'REQUEST_COMMENT',
      to,
      // У общего ящика профиля нет — язык компании по умолчанию.
      locale: byStaff ? (owner?.locale ?? Locale.RU) : Locale.RU,
      requestNumber: request.number,
      byStaff,
      comment: comment.text,
    });
  }

  /** Лента заявки. Метаданные вложений берутся из уже собранного списка файлов. */
  private async buildComments(requestId: string, files: RequestFileView[]): Promise<CommentView[]> {
    const [rows, links] = await Promise.all([
      this.repository.listComments(requestId),
      this.repository.listCommentFileLinks([requestId]),
    ]);
    if (rows.length === 0) return [];

    const authorIds = [
      ...new Set(rows.map((row) => row.authorId).filter((id): id is string => id !== null)),
    ];
    const authors = new Map(
      (await this.auth.getUsersByIds(authorIds)).map((user) => [user.id, user]),
    );
    const metaByFileId = new Map(files.map((file) => [file.id, file]));
    const filesByComment = new Map<string, FileMeta[]>();
    for (const link of links) {
      const meta = metaByFileId.get(link.fileId);
      if (!meta) continue;
      const bucket = filesByComment.get(link.commentId) ?? [];
      bucket.push(meta);
      filesByComment.set(link.commentId, bucket);
    }

    return rows.map((row) => ({
      id: row.id,
      author: {
        id: row.authorId,
        name: row.authorId ? (authors.get(row.authorId)?.fullName ?? null) : null,
        // Роль — из самой записи, а не из профиля: она могла смениться.
        role: row.authorRole,
      },
      text: row.text,
      createdAt: row.createdAt.toISOString(),
      files: filesByComment.get(row.id) ?? [],
    }));
  }

  // --- смета ---------------------------------------------------------------

  async registerQuote(params: {
    requestId: string;
    authorId: string;
    fileKey: string;
    totalAmount: number;
  }): Promise<RequestQuoteView> {
    const quote = await this.repository.createQuote({
      requestId: params.requestId,
      authorId: params.authorId,
      fileKey: params.fileKey,
      totalAmount: params.totalAmount,
    });
    return toQuoteView(quote);
  }

  async getCurrentQuote(requestId: string): Promise<RequestQuoteWithKey | null> {
    const quote = await this.repository.findCurrentQuote(requestId);
    return quote ? { ...toQuoteView(quote), fileKey: quote.fileKey } : null;
  }

  /**
   * Подписанная ссылка на смету для владельца заявки.
   *
   * Клиенту нужен собственный маршрут: `/admin/...` закрыт ролевым гвардом,
   * а `/files/:id/download-url` знает только о файлах клиента — смета лежит
   * в таблице quotes, и по её идентификатору тот эндпоинт отвечал 404.
   */
  async getQuoteDownloadUrl(
    requestId: string,
    actor: { id: string; role: UserRole },
  ): Promise<{ url: string; expiresAt: string }> {
    const request = await this.repository.findById(requestId);
    if (!request) throw new AppException(404, ErrorCode.NOT_FOUND, 'Request not found');
    if (!isStaffRole(actor.role) && request.userId !== actor.id) {
      throw new AppException(403, ErrorCode.FORBIDDEN, 'Request belongs to another user');
    }
    const quote = await this.repository.findCurrentQuote(requestId);
    if (!quote) throw new AppException(404, ErrorCode.NOT_FOUND, 'Quote not found');
    return this.files.createDownloadUrlForKey(quote.fileKey);
  }

  // --- переходы ------------------------------------------------------------

  /**
   * Единственная точка смены статуса. Смена статуса и запись в журнал
   * идут одной транзакцией, уведомление уходит ПОСЛЕ её коммита.
   */
  async transitionStatus(command: TransitionCommand): Promise<RequestView> {
    const request = await this.repository.findById(command.requestId);
    if (!request) throw new AppException(404, ErrorCode.NOT_FOUND, 'Request not found');

    const actorKind = isStaffRole(command.actor.role)
      ? ('STAFF' as const)
      : ('CLIENT_OWNER' as const);
    if (actorKind === 'CLIENT_OWNER' && request.userId !== command.actor.id) {
      throw new AppException(403, ErrorCode.FORBIDDEN, 'Request belongs to another user');
    }

    const check = checkTransition({
      from: request.status,
      to: command.to,
      actor: actorKind,
      comment: command.comment ?? null,
    });
    if (!check.allowed) {
      if (check.reason === 'COMMENT_REQUIRED') {
        throw new AppException(
          422,
          ErrorCode.COMMENT_REQUIRED,
          'Comment is required for NEEDS_INFO',
        );
      }
      if (check.reason === 'WRONG_ACTOR') {
        throw new AppException(
          403,
          ErrorCode.FORBIDDEN,
          'This transition is not allowed for the actor',
        );
      }
      throw new AppException(
        409,
        ErrorCode.INVALID_STATUS_TRANSITION,
        `Transition ${request.status} → ${command.to} is not allowed`,
      );
    }

    // Смету нельзя объявить готовой, пока её нет. Таблицей quotes владеет этот
    // же модуль, поэтому инвариант проверяется здесь, а не со слов вызывающего.
    if (command.to === RequestStatus.QUOTE_READY) {
      const quote = await this.repository.findCurrentQuote(request.id);
      if (!quote) {
        throw new AppException(
          409,
          ErrorCode.INVALID_STATUS_TRANSITION,
          'Request has no current quote',
        );
      }
    }

    const updated = await this.repository.transition({
      requestId: request.id,
      from: request.status,
      to: command.to,
      actorId: command.actor.id,
      comment: command.comment ?? null,
    });

    await this.notifyTransition(updated, command.to, command.comment ?? null);
    this.logger.log(
      `event=request_status_changed request=${request.id} from=${request.status} to=${command.to} actor=${command.actor.role}`,
    );
    return this.toView(updated);
  }

  /** Решение клиента по смете (US-6). Необратимо и единственно. */
  async decide(requestId: string, userId: string, dto: DecisionDto): Promise<RequestView> {
    const request = await this.repository.findById(requestId);
    if (!request) throw new AppException(404, ErrorCode.NOT_FOUND, 'Request not found');
    if (request.userId !== userId) {
      throw new AppException(403, ErrorCode.FORBIDDEN, 'Request belongs to another user');
    }
    if (request.decision || TERMINAL_STATUSES.includes(request.status)) {
      throw new AppException(409, ErrorCode.DECISION_ALREADY_MADE, 'Decision is already made');
    }

    const target =
      dto.result === DecisionResult.ACCEPTED ? RequestStatus.ACCEPTED : RequestStatus.REJECTED;
    const check = checkTransition({ from: request.status, to: target, actor: 'CLIENT_OWNER' });
    if (!check.allowed) {
      throw new AppException(
        409,
        ErrorCode.INVALID_STATUS_TRANSITION,
        `Transition ${request.status} → ${target} is not allowed`,
      );
    }

    if (dto.result === DecisionResult.REJECTED) {
      if (!dto.reason) {
        throw new AppException(422, ErrorCode.VALIDATION_FAILED, 'Rejection reason is required', {
          details: [{ field: 'reason', code: 'REQUIRED' }],
        });
      }
      if (dto.reason === RejectionReason.OTHER && !dto.comment?.trim()) {
        throw new AppException(422, ErrorCode.VALIDATION_FAILED, 'Comment is required for OTHER', {
          details: [{ field: 'comment', code: 'REQUIRED' }],
        });
      }
    }

    const updated = await this.repository.createDecision({
      requestId: request.id,
      from: request.status,
      to: target,
      actorId: userId,
      data: {
        requestId: request.id,
        result: dto.result,
        reason: dto.result === DecisionResult.REJECTED ? (dto.reason ?? null) : null,
        comment: dto.comment ?? null,
      },
    });

    await this.notifyDecision(updated, dto.result);
    this.logger.log(
      `event=decision_made request=${request.id} result=${dto.result} reason=${dto.reason ?? '-'}`,
    );
    return this.toView(updated);
  }

  // --- внутреннее ----------------------------------------------------------

  private async notifyTransition(
    request: RequestWithDecision,
    to: RequestStatus,
    comment: string | null,
  ): Promise<void> {
    const user = await this.auth.getUserById(request.userId);
    if (!user) return;

    if (to === RequestStatus.NEEDS_INFO) {
      await this.notifications.send({
        type: 'REQUEST_NEEDS_INFO',
        to: user.email,
        locale: user.locale,
        requestNumber: request.number,
        comment: comment ?? '',
      });
    } else if (to === RequestStatus.QUOTE_READY) {
      await this.notifications.send({
        type: 'QUOTE_READY',
        to: user.email,
        locale: user.locale,
        requestNumber: request.number,
      });
    }
  }

  /** Уведомление менеджера о решении клиента (US-6). */
  private async notifyDecision(
    request: RequestWithDecision,
    result: DecisionResult,
  ): Promise<void> {
    const user = await this.auth.getUserById(request.userId);
    if (!user) return;
    await this.notifications.send({
      type: 'DECISION_MADE',
      to: user.email,
      locale: user.locale,
      requestNumber: request.number,
      result,
    });
  }

  private async toDetailView(request: RequestWithDecision): Promise<RequestDetailView> {
    const view = await this.toView(request);
    const [statusLog, comments] = await Promise.all([
      this.getStatusLog(request.id),
      this.buildComments(request.id, view.files),
    ]);
    return { ...view, statusLog, comments };
  }

  private async toView(request: RequestWithDecision): Promise<RequestView> {
    const [quote, links] = await Promise.all([
      this.repository.findCurrentQuote(request.id),
      this.repository.listCommentFileLinks([request.id]),
    ]);
    return this.composeView(request, quote, new Set(links.map((link) => link.fileId)));
  }

  /** Список: сметы и вложения переписки читаются одним запросом на весь список. */
  private async toViews(requests: RequestWithDecision[]): Promise<RequestView[]> {
    const ids = requests.map((item) => item.id);
    const [quotes, links] = await Promise.all([
      this.repository.findCurrentQuotes(ids),
      this.repository.listCommentFileLinks(ids),
    ]);
    const byRequestId = new Map(quotes.map((quote) => [quote.requestId, quote]));
    const discussionFileIds = new Set(links.map((link) => link.fileId));
    return Promise.all(
      requests.map((request) =>
        this.composeView(request, byRequestId.get(request.id) ?? null, discussionFileIds),
      ),
    );
  }

  private async composeView(
    request: RequestWithDecision,
    quote: Quote | null,
    discussionFileIds: ReadonlySet<string>,
  ): Promise<RequestView> {
    const [estimate, files] = await Promise.all([
      request.quickEstimateId ? this.pricing.getQuickEstimate(request.quickEstimateId) : null,
      this.files.listByRequest(request.id),
    ]);

    return {
      id: request.id,
      number: request.number,
      userId: request.userId,
      status: request.status,
      address: request.address,
      needsManual: request.needsManual,
      comment: request.comment,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
      estimate,
      // Файл из переписки попадает в общий список файлов заявки с пометкой,
      // откуда он: искать вложение по ленте клиент не должен.
      files: files.map((file) => ({
        ...file,
        source: discussionFileIds.has(file.id) ? ('DISCUSSION' as const) : ('REQUEST' as const),
      })),
      quote: quote ? toQuoteView(quote) : null,
      decision: request.decision
        ? {
            result: request.decision.result,
            reason: request.decision.reason,
            comment: request.decision.comment,
            createdAt: request.decision.createdAt.toISOString(),
          }
        : null,
    };
  }
}

function toQuoteView(quote: Quote): RequestQuoteView {
  return {
    id: quote.id,
    totalAmount: quote.totalAmount,
    createdAt: quote.createdAt.toISOString(),
  };
}
