import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import type { StorageProvider, StoredObject } from './storage.provider';

/**
 * Cloudflare R2 через S3-совместимый API.
 *
 * Bucket приватный: публичного URL у объекта нет, читать и писать можно
 * только по подписанной ссылке. Ссылка на загрузку выпускается с
 * зафиксированными Content-Type и Content-Length — подменить тип или залить
 * файл больше лимита по ней нельзя.
 */
@Injectable()
export class S3Storage implements StorageProvider {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    options: { endpoint: string; region: string; accessKey: string; secretKey: string },
  ) {
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      credentials: { accessKeyId: options.accessKey, secretAccessKey: options.secretKey },
    });
  }

  async createUploadUrl(params: {
    key: string;
    mime: string;
    size: number;
    expiresInSeconds: number;
  }): Promise<{ url: string; requiredHeaders: Record<string, string> }> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      ContentType: params.mime,
      ContentLength: params.size,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: params.expiresInSeconds });
    return {
      url,
      requiredHeaders: {
        'Content-Type': params.mime,
        'Content-Length': String(params.size),
      },
    };
  }

  async createDownloadUrl(params: { key: string; expiresInSeconds: number }): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: params.key });
    return getSignedUrl(this.client, command, { expiresIn: params.expiresInSeconds });
  }

  async head(key: string): Promise<StoredObject | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return { size: result.ContentLength ?? 0, contentType: result.ContentType ?? null };
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === 'NotFound' || name === 'NoSuchKey') return null;
      throw error;
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
