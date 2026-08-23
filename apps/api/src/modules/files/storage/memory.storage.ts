import { Injectable } from '@nestjs/common';
import type { StorageProvider, StoredObject } from './storage.provider';

/**
 * Хранилище в памяти. Используется при STORAGE_DRIVER=memory — в тестах
 * и при локальной разработке без доступа к R2.
 *
 * Подписанная ссылка на загрузку имитируется: тест «загружает» файл
 * вызовом completeUpload(), как это сделал бы браузер через PUT в R2.
 */
@Injectable()
export class MemoryStorage implements StorageProvider {
  private readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  async createUploadUrl(params: {
    key: string;
    mime: string;
    size: number;
    expiresInSeconds: number;
  }): Promise<{ url: string; requiredHeaders: Record<string, string> }> {
    return Promise.resolve({
      url: `memory://upload/${encodeURIComponent(params.key)}?expires=${params.expiresInSeconds}`,
      requiredHeaders: {
        'Content-Type': params.mime,
        'Content-Length': String(params.size),
      },
    });
  }

  async createDownloadUrl(params: { key: string; expiresInSeconds: number }): Promise<string> {
    return Promise.resolve(
      `memory://download/${encodeURIComponent(params.key)}?expires=${params.expiresInSeconds}`,
    );
  }

  async head(key: string): Promise<StoredObject | null> {
    const object = this.objects.get(key);
    return Promise.resolve(
      object ? { size: object.body.byteLength, contentType: object.contentType } : null,
    );
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body, contentType });
    return Promise.resolve();
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }

  /** Имитация загрузки браузером по подписанной ссылке (только для тестов). */
  completeUpload(key: string, body: Buffer, contentType: string): void {
    this.objects.set(key, { body, contentType });
  }

  clear(): void {
    this.objects.clear();
  }
}
