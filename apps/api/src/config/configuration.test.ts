import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfiguration } from './configuration';

/**
 * Конфигурация боевого окружения.
 *
 * Регрессия: прод работал с STORAGE_DRIVER=memory. Хранилище в памяти выдаёт
 * браузеру ссылку `memory://…`, PUT по ней невозможен, `confirm` не вызывается —
 * и заявка уходила без вложений (`files=0` в логах), а клиент видел «отправлено».
 * Такая конфигурация обязана ронять процесс на старте.
 */
describe('конфигурация: заглушки в бою', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.JWT_SECRET = 'production-access-secret-production-acc';
    process.env.JWT_REFRESH_SECRET = 'production-refresh-secret-production-re';
    process.env.S3_ENDPOINT = 'https://account.r2.cloudflarestorage.com';
    process.env.S3_BUCKET = 'renovateam-files';
    process.env.S3_ACCESS_KEY = 'access';
    process.env.S3_SECRET_KEY = 'secret';
    process.env.RESEND_API_KEY = 're_test';
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in saved)) delete process.env[key];
    }
    Object.assign(process.env, saved);
  });

  it('NODE_ENV=production и хранилище в памяти — отказ на старте с понятным сообщением', () => {
    process.env.NODE_ENV = 'production';
    process.env.STORAGE_DRIVER = 'memory';
    process.env.MAIL_DRIVER = 'resend';

    expect(() => loadConfiguration()).toThrow(/STORAGE_DRIVER=memory/);
    expect(() => loadConfiguration()).toThrow(/production/);
    // Сообщение объясняет и причину, и что делать.
    expect(() => loadConfiguration()).toThrow(/memory:\/\//);
    expect(() => loadConfiguration()).toThrow(/STORAGE_DRIVER=s3/);
  });

  it('NODE_ENV=production и почта в памяти — такой же отказ', () => {
    process.env.NODE_ENV = 'production';
    process.env.STORAGE_DRIVER = 's3';
    process.env.MAIL_DRIVER = 'memory';

    expect(() => loadConfiguration()).toThrow(/MAIL_DRIVER=memory/);
    expect(() => loadConfiguration()).toThrow(/MAIL_DRIVER=resend/);
  });

  it('в бою с настоящими драйверами конфигурация читается', () => {
    process.env.NODE_ENV = 'production';
    process.env.STORAGE_DRIVER = 's3';
    process.env.MAIL_DRIVER = 'resend';

    const config = loadConfiguration();
    expect(config.storage.driver).toBe('s3');
    expect(config.mail.driver).toBe('resend');
  });

  it('вне боя заглушки разрешены: тесты и локальная разработка', () => {
    process.env.NODE_ENV = 'development';
    process.env.STORAGE_DRIVER = 'memory';
    process.env.MAIL_DRIVER = 'memory';

    expect(loadConfiguration().storage.driver).toBe('memory');
  });
});
