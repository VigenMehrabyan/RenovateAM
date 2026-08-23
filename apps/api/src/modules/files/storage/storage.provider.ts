/** DI-токен провайдера хранилища. */
export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

/** Метаданные объекта в хранилище. */
export interface StoredObject {
  size: number;
  contentType: string | null;
}

/**
 * Провайдер объектного хранилища. За интерфейсом стоит либо Cloudflare R2,
 * либо реализация в памяти для тестов и локальной разработки.
 */
export interface StorageProvider {
  /** Подписанная ссылка на загрузку с зафиксированными типом и размером. */
  createUploadUrl(params: {
    key: string;
    mime: string;
    size: number;
    expiresInSeconds: number;
  }): Promise<{ url: string; requiredHeaders: Record<string, string> }>;

  /** Подписанная ссылка на чтение. */
  createDownloadUrl(params: { key: string; expiresInSeconds: number }): Promise<string>;

  /** Метаданные объекта; null, если объекта нет (загрузка не состоялась). */
  head(key: string): Promise<StoredObject | null>;

  put(key: string, body: Buffer, contentType: string): Promise<void>;

  delete(key: string): Promise<void>;
}
