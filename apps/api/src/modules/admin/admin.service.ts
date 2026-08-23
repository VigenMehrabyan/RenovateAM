import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppException } from '@common/errors/app.exception';
import { ErrorCode } from '@common/errors/error-codes';
import { RequestStatus, UserRole } from '@db/enums';
import { AUTH_PUBLIC_SERVICE, type AuthPublicService, type PublicUser } from '@modules/auth/public';
import { FILES_PUBLIC_SERVICE, type FilesPublicService } from '@modules/files/public';
import { PRICING_PUBLIC_SERVICE, type PricingPublicService } from '@modules/pricing/public';
import {
  REQUESTS_PUBLIC_SERVICE,
  type RequestsPublicService,
  type RequestView,
} from '@modules/requests/public';
import { AdminRepository } from './admin.repository';

/** PDF-смета: единственный допустимый формат (US-5). */
const QUOTE_MIME = 'application/pdf';
const MAX_QUOTE_SIZE = 25 * 1024 * 1024;

export interface AdminQueueItem {
  id: string;
  number: number;
  status: RequestStatus;
  needsManual: boolean;
  createdAt: string;
  client: Pick<PublicUser, 'id' | 'fullName' | 'email' | 'phone' | 'address'> | null;
  estimateSummary: { amountMin: number; amountMax: number } | null;
  filesCount: number;
  duplicatePhoneCount: number;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly repository: AdminRepository,
    @Inject(REQUESTS_PUBLIC_SERVICE) private readonly requests: RequestsPublicService,
    @Inject(AUTH_PUBLIC_SERVICE) private readonly auth: AuthPublicService,
    @Inject(FILES_PUBLIC_SERVICE) private readonly files: FilesPublicService,
    @Inject(PRICING_PUBLIC_SERVICE) private readonly pricing: PricingPublicService,
  ) {}

  /** Очередь сметчика: фильтр по статусу, сортировка по дате, поиск дублей по телефону. */
  async listQueue(params: {
    status?: RequestStatus;
    phone?: string;
    page: number;
    pageSize: number;
    sortDirection: 'asc' | 'desc';
  }): Promise<{ items: AdminQueueItem[]; total: number; page: number; pageSize: number }> {
    const userIds = params.phone ? await this.auth.findUserIdsByPhone(params.phone) : undefined;
    if (userIds && userIds.length === 0) {
      return { items: [], total: 0, page: params.page, pageSize: params.pageSize };
    }

    const { items, total } = await this.requests.listForStaff({
      ...(params.status ? { status: params.status } : {}),
      ...(userIds ? { userIds } : {}),
      page: params.page,
      pageSize: params.pageSize,
      sortDirection: params.sortDirection,
    });

    const clients = await this.auth.getUsersByIds([...new Set(items.map((item) => item.userId))]);
    const byId = new Map(clients.map((client) => [client.id, client]));
    const duplicates = await this.countDuplicatesByPhone(clients);

    return {
      items: items.map((request) => {
        const client = byId.get(request.userId) ?? null;
        return {
          id: request.id,
          number: request.number,
          status: request.status,
          needsManual: request.needsManual,
          createdAt: request.createdAt,
          client: client
            ? {
                id: client.id,
                fullName: client.fullName,
                email: client.email,
                phone: client.phone,
                address: client.address,
              }
            : null,
          estimateSummary:
            request.estimate &&
            request.estimate.amountMin !== null &&
            request.estimate.amountMax !== null
              ? { amountMin: request.estimate.amountMin, amountMax: request.estimate.amountMax }
              : null,
          filesCount: request.files.length,
          duplicatePhoneCount: client ? (duplicates.get(client.phone) ?? 1) : 0,
        };
      }),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  /** Карточка заявки: параметры, контакты, файлы, смета и журнал на одном экране. */
  async getRequestCard(requestId: string) {
    const request = await this.requests.getById(requestId);
    if (!request) throw new AppException(404, ErrorCode.NOT_FOUND, 'Request not found');

    const [client, quote, statusLog] = await Promise.all([
      this.auth.getUserById(request.userId),
      this.repository.findCurrentQuote(requestId),
      this.requests.getStatusLog(requestId),
    ]);

    return {
      ...request,
      client,
      quote: quote
        ? {
            id: quote.id,
            totalAmount: quote.totalAmount,
            createdAt: quote.createdAt.toISOString(),
          }
        : null,
      statusLog,
    };
  }

  async changeStatus(params: {
    requestId: string;
    to: RequestStatus;
    actor: { id: string; role: UserRole };
    comment?: string;
  }): Promise<RequestView> {
    const quote = await this.repository.findCurrentQuote(params.requestId);
    return this.requests.transitionStatus({
      requestId: params.requestId,
      to: params.to,
      actor: params.actor,
      ...(params.comment !== undefined ? { comment: params.comment } : {}),
      hasCurrentQuote: quote !== null,
    });
  }

  /**
   * Загрузка сметы. Файл кладётся в хранилище через модуль files,
   * затем заявка переводится в QUOTE_READY — клиент получает письмо.
   */
  async uploadQuote(params: {
    requestId: string;
    actor: { id: string; role: UserRole };
    totalAmount: number;
    file: { buffer: Buffer; mimetype: string; size: number };
  }) {
    const request = await this.requests.getById(params.requestId);
    if (!request) throw new AppException(404, ErrorCode.NOT_FOUND, 'Request not found');

    if (params.file.mimetype !== QUOTE_MIME) {
      throw new AppException(415, ErrorCode.UNSUPPORTED_MEDIA_TYPE, 'Quote must be a PDF file');
    }
    if (params.file.size > MAX_QUOTE_SIZE) {
      throw new AppException(413, ErrorCode.FILE_TOO_LARGE, 'Quote file exceeds 25 MB limit');
    }
    if (!Number.isInteger(params.totalAmount) || params.totalAmount <= 0) {
      throw new AppException(
        422,
        ErrorCode.VALIDATION_FAILED,
        'totalAmount must be a positive integer',
        {
          details: [{ field: 'totalAmount', code: 'INVALID' }],
        },
      );
    }

    const quoteId = randomUUID();
    const fileKey = `quotes/${params.requestId}/${quoteId}.pdf`;
    await this.files.putObject(fileKey, params.file.buffer, QUOTE_MIME);

    const quote = await this.repository.createQuote({
      id: quoteId,
      requestId: params.requestId,
      authorId: params.actor.id,
      fileKey,
      totalAmount: params.totalAmount,
    });

    if (request.status !== RequestStatus.QUOTE_READY) {
      await this.requests.transitionStatus({
        requestId: params.requestId,
        to: RequestStatus.QUOTE_READY,
        actor: params.actor,
        hasCurrentQuote: true,
      });
    }

    // Отклонение автооценки от финальной сметы — метрика качества коэффициентов.
    const base = request.estimate?.amountBase ?? null;
    const deviation = base ? ((params.totalAmount - base) / base) * 100 : null;
    this.logger.log(
      `event=quote_uploaded request=${params.requestId} total=${params.totalAmount} deviationPct=${
        deviation === null ? '-' : deviation.toFixed(1)
      }`,
    );

    return {
      id: quote.id,
      totalAmount: quote.totalAmount,
      createdAt: quote.createdAt.toISOString(),
      isCurrent: quote.isCurrent,
    };
  }

  /** Ссылка на скачивание сметы: сотруднику — любую, клиенту — только свою. */
  async getQuoteDownloadUrl(requestId: string, actor: { id: string; role: UserRole }) {
    const isStaff = actor.role === UserRole.ESTIMATOR || actor.role === UserRole.ADMIN;
    if (!isStaff && !(await this.requests.isOwnedBy(requestId, actor.id))) {
      throw new AppException(403, ErrorCode.FORBIDDEN, 'Request belongs to another user');
    }
    const quote = await this.repository.findCurrentQuote(requestId);
    if (!quote) throw new AppException(404, ErrorCode.NOT_FOUND, 'Quote not found');
    return this.files.createDownloadUrlForKey(quote.fileKey);
  }

  async createRateVersion(rates: Record<string, number>, actorId: string, note?: string) {
    return this.pricing.createRateVersion(rates, actorId, note);
  }

  async listUsers(page: number, pageSize: number) {
    return this.auth.listUsers(page, pageSize);
  }

  async listRateVersions() {
    return { items: await this.pricing.listRateVersions() };
  }

  private async countDuplicatesByPhone(clients: PublicUser[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    for (const phone of new Set(clients.map((client) => client.phone))) {
      result.set(phone, (await this.auth.findUserIdsByPhone(phone)).length);
    }
    return result;
  }
}
