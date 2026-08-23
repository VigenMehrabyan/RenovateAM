import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppException } from '@common/errors/app.exception';
import { ErrorCode } from '@common/errors/error-codes';
import { FileKind, UserRole } from '@db/enums';
import type { RequestFile } from '@db';
import { FilesRepository } from './files.repository';
import { STORAGE_PROVIDER, type StorageProvider } from './storage/storage.provider';
import type { FileMeta, FilesPublicService } from './public';

/** Максимальный размер файла — 25 МБ (US-3). */
export const MAX_FILE_SIZE = 25 * 1024 * 1024;
/** Не больше 10 файлов на заявку (US-3). */
export const MAX_FILES_PER_REQUEST = 10;
/** Подписанные ссылки живут 15 минут (US-3). */
export const SIGNED_URL_TTL_SECONDS = 15 * 60;

/** Белый список форматов: PDF, JPG, PNG, DWG (US-3). */
export const ALLOWED_MIME: Record<string, string[]> = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/vnd.dwg': ['dwg'],
  'application/acad': ['dwg'],
};

@Injectable()
export class FilesService implements FilesPublicService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly repository: FilesRepository,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /**
   * Фаза 1: валидация и выдача подписанной ссылки.
   * Запись в БД создаётся сразу, но без uploaded_at — для системы файла
   * ещё не существует.
   */
  async createUploadUrl(params: {
    userId: string;
    requestId?: string;
    kind: FileKind;
    originalName: string;
    mime: string;
    size: number;
  }) {
    this.assertMimeAllowed(params.mime, params.originalName);
    if (params.size > MAX_FILE_SIZE) {
      throw new AppException(413, ErrorCode.FILE_TOO_LARGE, 'File exceeds 25 MB limit');
    }
    if (params.size <= 0) {
      throw new AppException(422, ErrorCode.VALIDATION_FAILED, 'File size must be positive', {
        details: [{ field: 'size', code: 'INVALID' }],
      });
    }

    if (params.requestId) {
      const owned = await this.repository.requestBelongsToUserFiles(
        params.requestId,
        params.userId,
      );
      if (!owned) {
        // Привязка к чужой заявке невозможна: проверяем через собственные данные,
        // а окончательную привязку делает requests при создании заявки.
        throw new AppException(403, ErrorCode.FORBIDDEN, 'Request does not belong to the user');
      }
    }

    const scope = params.requestId ?? params.userId;
    const count = params.requestId
      ? await this.repository.countUploadedByRequest(params.requestId)
      : await this.repository.countDraftsByUser(params.userId);
    if (count >= MAX_FILES_PER_REQUEST) {
      throw new AppException(
        409,
        ErrorCode.FILE_LIMIT_REACHED,
        'No more than 10 files per request',
      );
    }

    const fileId = randomUUID();
    const extension = extensionOf(params.originalName);
    // Ключ строит сервер: имя клиента в путь не попадает.
    const storageKey = `requests/${scope}/${params.kind.toLowerCase()}/${fileId}${extension ? `.${extension}` : ''}`;

    await this.repository.create({
      id: fileId,
      userId: params.userId,
      requestId: params.requestId ?? null,
      kind: params.kind,
      originalName: params.originalName,
      storageKey,
      mime: params.mime,
      size: params.size,
    });

    const { url, requiredHeaders } = await this.storage.createUploadUrl({
      key: storageKey,
      mime: params.mime,
      size: params.size,
      expiresInSeconds: SIGNED_URL_TTL_SECONDS,
    });

    return {
      fileId,
      uploadUrl: url,
      expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
      requiredHeaders,
    };
  }

  /**
   * Фаза 2: подтверждение загрузки. Реальные размер и тип берутся из
   * хранилища (HEAD), а не со слов клиента.
   */
  async confirmUpload(fileId: string, userId: string): Promise<FileMeta> {
    const file = await this.getOwnFile(fileId, userId);
    if (file.uploadedAt) return toMeta(file);

    const object = await this.storage.head(file.storageKey);
    if (!object) {
      throw new AppException(409, ErrorCode.UPLOAD_NOT_FOUND, 'Object was not uploaded');
    }
    if (object.size > MAX_FILE_SIZE) {
      await this.storage.delete(file.storageKey);
      await this.repository.delete(file.id);
      throw new AppException(413, ErrorCode.FILE_TOO_LARGE, 'Uploaded file exceeds 25 MB limit');
    }
    if (object.contentType && !ALLOWED_MIME[object.contentType]) {
      await this.storage.delete(file.storageKey);
      await this.repository.delete(file.id);
      throw new AppException(415, ErrorCode.UNSUPPORTED_MEDIA_TYPE, 'Unsupported file type');
    }

    const updated = await this.repository.markUploaded(file.id, object.size, new Date());
    this.logger.log(`event=file_uploaded file=${file.id} size=${object.size}`);
    return toMeta(updated);
  }

  /** Ссылка на скачивание. Владелец — свои файлы, сметчик и админ — любые. */
  async createDownloadUrl(fileId: string, actor: { id: string; role: UserRole }) {
    const file = await this.repository.findById(fileId);
    if (!file) throw new AppException(404, ErrorCode.NOT_FOUND, 'File not found');

    const isStaff = actor.role === UserRole.ESTIMATOR || actor.role === UserRole.ADMIN;
    if (!isStaff && file.userId !== actor.id) {
      throw new AppException(403, ErrorCode.FORBIDDEN, 'File belongs to another user');
    }

    const url = await this.storage.createDownloadUrl({
      key: file.storageKey,
      expiresInSeconds: SIGNED_URL_TTL_SECONDS,
    });
    return {
      url,
      expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
    };
  }

  /** Удаление возможно только до привязки файла к отправленной заявке. */
  async deleteFile(fileId: string, userId: string): Promise<void> {
    const file = await this.getOwnFile(fileId, userId);
    if (file.requestId) {
      throw new AppException(409, ErrorCode.FORBIDDEN, 'File is attached to a submitted request');
    }
    await this.storage.delete(file.storageKey);
    await this.repository.delete(file.id);
  }

  async listOwnDrafts(userId: string): Promise<FileMeta[]> {
    return (await this.repository.listDrafts(userId)).map(toMeta);
  }

  // --- публичный интерфейс модуля -----------------------------------------

  async listByRequest(requestId: string): Promise<FileMeta[]> {
    return (await this.repository.listByRequest(requestId)).map(toMeta);
  }

  async countByRequest(requestId: string): Promise<number> {
    return this.repository.countUploadedByRequest(requestId);
  }

  async attachToRequest(fileIds: string[], requestId: string, userId: string): Promise<FileMeta[]> {
    if (fileIds.length === 0) return [];
    if (fileIds.length > MAX_FILES_PER_REQUEST) {
      throw new AppException(
        409,
        ErrorCode.FILE_LIMIT_REACHED,
        'No more than 10 files per request',
      );
    }
    await this.repository.attachToRequest(fileIds, requestId, userId);
    return this.listByRequest(requestId);
  }

  async putObject(key: string, body: Buffer, mime: string): Promise<void> {
    await this.storage.put(key, body, mime);
  }

  async createDownloadUrlForKey(key: string): Promise<{ url: string; expiresAt: string }> {
    const url = await this.storage.createDownloadUrl({
      key,
      expiresInSeconds: SIGNED_URL_TTL_SECONDS,
    });
    return {
      url,
      expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
    };
  }

  // --- внутреннее ----------------------------------------------------------

  private async getOwnFile(fileId: string, userId: string): Promise<RequestFile> {
    const file = await this.repository.findById(fileId);
    if (!file) throw new AppException(404, ErrorCode.NOT_FOUND, 'File not found');
    if (file.userId !== userId) {
      throw new AppException(403, ErrorCode.FORBIDDEN, 'File belongs to another user');
    }
    return file;
  }

  private assertMimeAllowed(mime: string, originalName: string): void {
    const extensions = ALLOWED_MIME[mime];
    if (!extensions) {
      throw new AppException(
        415,
        ErrorCode.UNSUPPORTED_MEDIA_TYPE,
        'Unsupported format. Upload PDF, JPG, PNG or DWG',
      );
    }
    const extension = extensionOf(originalName);
    if (!extension || !extensions.includes(extension)) {
      throw new AppException(
        415,
        ErrorCode.UNSUPPORTED_MEDIA_TYPE,
        'File extension does not match its declared type',
      );
    }
  }
}

function extensionOf(name: string): string | null {
  const parts = name.toLowerCase().split('.');
  return parts.length > 1 ? (parts[parts.length - 1] ?? null) : null;
}

function toMeta(file: RequestFile): FileMeta {
  return {
    id: file.id,
    requestId: file.requestId,
    kind: file.kind,
    originalName: file.originalName,
    mime: file.mime,
    size: file.size,
    uploadedAt: file.uploadedAt ? file.uploadedAt.toISOString() : null,
  };
}
