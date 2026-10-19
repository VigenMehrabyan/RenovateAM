import { describe, expect, it } from 'vitest';
import { S3Storage } from './s3.storage';

/**
 * Подписанная ссылка на загрузку выпускается до того, как у сервера есть тело
 * файла. Если SDK вшивает в неё контрольную сумму, это сумма пустого тела, и
 * R2 отклоняет любой настоящий файл. Ссылка не должна содержать checksum-параметров.
 */
describe('S3Storage — подписанная ссылка на загрузку', () => {
  const storage = new S3Storage('renovateam-files', {
    endpoint: 'https://account.r2.cloudflarestorage.com',
    region: 'auto',
    accessKey: 'test-access-key',
    secretKey: 'test-secret-key',
  });

  const ticket = () =>
    storage.createUploadUrl({
      key: 'requests/abc/bti.pdf',
      mime: 'application/pdf',
      size: 12345,
      expiresInSeconds: 600,
    });

  it('не содержит контрольной суммы пустого тела', async () => {
    const { url } = await ticket();
    for (const name of new URL(url).searchParams.keys()) {
      expect(name.toLowerCase()).not.toContain('checksum');
    }
  });

  it('адрес в стиле endpoint/bucket/key и подписанный Content-Length', async () => {
    const { url, requiredHeaders } = await ticket();
    const parsed = new URL(url);
    expect(parsed.host).toBe('account.r2.cloudflarestorage.com');
    expect(parsed.pathname).toBe('/renovateam-files/requests/abc/bti.pdf');
    expect(parsed.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length');
    expect(requiredHeaders).toEqual({
      'Content-Type': 'application/pdf',
      'Content-Length': '12345',
    });
  });
});
