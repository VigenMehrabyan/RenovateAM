import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppException } from '@common/errors/app.exception';
import { ErrorCode } from '@common/errors/error-codes';
import { DecisionResult, RejectionReason, RequestStatus, UserRole } from '@db/enums';
import { AUTH_PUBLIC_SERVICE, type AuthPublicService } from '@modules/auth/public';
import { FILES_PUBLIC_SERVICE, type FilesPublicService } from '@modules/files/public';
import {
  NOTIFICATIONS_PUBLIC_SERVICE,
  type NotificationsPublicService,
} from '@modules/notifications/public';
import { PRICING_PUBLIC_SERVICE, type PricingPublicService } from '@modules/pricing/public';
import type { CreateRequestDto } from './dto/create-request.dto';
import type { DecisionDto } from './dto/decision.dto';
import { RequestsRepository, type RequestWithDecision } from './requests.repository';
import { ACTIVE_STATUSES, checkTransition, isStaffRole, TERMINAL_STATUSES } from './status-machine';
import type {
  RequestsPublicService,
  RequestView,
  StatusLogView,
  TransitionCommand,
} from './public';

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
  ) {}

  // --- создание ------------------------------------------------------------

  async create(userId: string, dto: CreateRequestDto): Promise<RequestView> {
    if (await this.hasActiveRequest(userId)) {
      throw new AppException(
        409,
        ErrorCode.ACTIVE_REQUEST_EXISTS,
        'Client already has an active request',
      );
    }

    let needsManual = true;
    let quickEstimateId: string | null = null;

    if (dto.quickEstimateId) {
      const estimate = await this.pricing.getQuickEstimate(dto.quickEstimateId);
      if (!estimate) {
        throw new AppException(404, ErrorCode.NOT_FOUND, 'Quick estimate not found');
      }
      // Расчёт действует 30 дней; протухший требует пересчёта (MVP §7).
      if (new Date(estimate.expiresAt).getTime() < Date.now()) {
        throw new AppException(410, ErrorCode.ESTIMATE_EXPIRED, 'Quick estimate expired');
      }
      needsManual = estimate.needsManual;
      quickEstimateId = estimate.id;
    }

    const created = await this.repository
      .createWithLog({
        userId,
        quickEstimateId,
        status: RequestStatus.NEW,
        needsManual,
        comment: dto.comment ?? null,
      })
      .catch((error: unknown) => {
        // Гонка двух параллельных отправок ловится уникальным индексом.
        if (isUniqueViolation(error)) {
          throw new AppException(
            409,
            ErrorCode.ACTIVE_REQUEST_EXISTS,
            'Client already has an active request',
          );
        }
        throw error;
      });

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

  /** Чтение с проверкой доступа: свои заявки — клиенту, любые — сотруднику. */
  async getForActor(
    requestId: string,
    actor: { id: string; role: UserRole },
  ): Promise<RequestView> {
    const request = await this.repository.findById(requestId);
    if (!request) throw new AppException(404, ErrorCode.NOT_FOUND, 'Request not found');
    if (!isStaffRole(actor.role) && request.userId !== actor.id) {
      throw new AppException(403, ErrorCode.FORBIDDEN, 'Request belongs to another user');
    }
    return this.toView(request);
  }

  async listOwn(userId: string): Promise<RequestView[]> {
    const requests = await this.repository.listByUser(userId);
    return Promise.all(requests.map((request) => this.toView(request)));
  }

  async hasActiveRequest(userId: string): Promise<boolean> {
    return (await this.repository.countActiveByUser(userId, ACTIVE_STATUSES)) > 0;
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
    return { items: await Promise.all(items.map((item) => this.toView(item))), total };
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

    // Смету нельзя объявить готовой, пока её нет. Признак приходит от
    // владельца таблицы quotes — модуль requests её не читает.
    if (command.to === RequestStatus.QUOTE_READY && command.hasCurrentQuote === false) {
      throw new AppException(
        409,
        ErrorCode.INVALID_STATUS_TRANSITION,
        'Request has no current quote',
      );
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

  private async toView(request: RequestWithDecision): Promise<RequestView> {
    const [estimate, files] = await Promise.all([
      request.quickEstimateId ? this.pricing.getQuickEstimate(request.quickEstimateId) : null,
      this.files.listByRequest(request.id),
    ]);

    return {
      id: request.id,
      number: request.number,
      userId: request.userId,
      status: request.status,
      needsManual: request.needsManual,
      comment: request.comment,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
      estimate,
      files,
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

/** Нарушение уникального индекса PostgreSQL. */
function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  return code === 'P2002' || code === '23505';
}
