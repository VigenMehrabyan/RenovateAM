import type { FileKind } from '@db/enums';

/** DI-токен публичного сервиса модуля files. */
export const FILES_PUBLIC_SERVICE = 'FILES_PUBLIC_SERVICE';

/** Метаданные подтверждённого файла. */
export interface FileMeta {
  id: string;
  requestId: string | null;
  kind: FileKind;
  originalName: string;
  mime: string;
  size: number;
  uploadedAt: string | null;
}

export interface FilesPublicService {
  /** Файлы заявки — для карточки в кабинете и в админке. */
  listByRequest(requestId: string): Promise<FileMeta[]>;

  /** Количество подтверждённых файлов заявки. */
  countByRequest(requestId: string): Promise<number>;

  /**
   * Привязывает загруженные черновики к созданной заявке.
   * Возвращает привязанные файлы; чужие и неподтверждённые игнорируются.
   */
  attachToRequest(fileIds: string[], requestId: string, userId: string): Promise<FileMeta[]>;

  /** Загрузка серверного объекта (PDF-смета) в хранилище. */
  putObject(key: string, body: Buffer, mime: string): Promise<void>;

  /** Подписанная ссылка на чтение произвольного ключа, TTL 15 минут. */
  createDownloadUrlForKey(key: string): Promise<{ url: string; expiresAt: string }>;
}
