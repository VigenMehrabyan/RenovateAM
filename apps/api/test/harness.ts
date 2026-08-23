import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { API_PREFIX, configureApp } from '../src/bootstrap';
import { MemoryEmailChannel } from '../src/modules/notifications/channels/memory-email.channel';
import { MemoryStorage } from '../src/modules/files/storage/memory.storage';
import { DEFAULT_RATE_VALUES } from '../src/modules/pricing/pricing.service';
import { UserRole } from '../src/generated/prisma/enums';

/** Доступна ли реальная БД для интеграционных тестов. */
export const DATABASE_AVAILABLE = Boolean(
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
);

const TABLES = [
  'status_log',
  'decisions',
  'quotes',
  'files',
  'requests',
  'quick_estimates',
  'pricing_rates',
  'rate_versions',
  'refresh_tokens',
  'verification_tokens',
  'users',
];

export interface TestContext {
  app: INestApplication;
  mail: MemoryEmailChannel;
  storage: MemoryStorage;
  db: Client;
  http: () => request.Agent;
  close: () => Promise<void>;
  reset: () => Promise<void>;
}

export function url(path: string): string {
  return `/${API_PREFIX}${path}`;
}

/** Поднимает приложение целиком — тот же конвейер, что и в проде. */
export async function createTestContext(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(moduleRef.createNestApplication());
  await app.init();

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const context: TestContext = {
    app,
    mail: app.get(MemoryEmailChannel),
    storage: app.get(MemoryStorage),
    db,
    http: () => request(app.getHttpServer() as App),
    close: async () => {
      await db.end();
      await app.close();
    },
    reset: async () => {
      await db.query(`TRUNCATE ${TABLES.map((table) => `"${table}"`).join(', ')} CASCADE`);
      await seedRates(db);
      context.mail.clear();
      context.storage.clear();
    },
  };

  await context.reset();
  return context;
}

/** Активная версия ставок: без неё расчёт невозможен. */
export async function seedRates(
  db: Client,
  overrides: Record<string, number> = {},
): Promise<string> {
  await db.query(`UPDATE "rate_versions" SET "is_active" = FALSE WHERE "is_active" = TRUE`);
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO "rate_versions" ("id", "note", "is_active", "created_at")
     VALUES (gen_random_uuid(), 'test', TRUE, now()) RETURNING "id"`,
  );
  const versionId = rows[0]!.id;
  const values = { ...DEFAULT_RATE_VALUES, ...overrides };
  for (const [key, value] of Object.entries(values)) {
    await db.query(
      `INSERT INTO "pricing_rates" ("id", "version_id", "key", "value")
       VALUES (gen_random_uuid(), $1, $2, $3)`,
      [versionId, key, value],
    );
  }
  return versionId;
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  accessToken: string;
}

let userCounter = 0;

/** Регистрирует клиента; verified=true подтверждает e-mail по реальной ссылке из письма. */
export async function createClient(
  context: TestContext,
  options: { verified?: boolean; phone?: string } = {},
): Promise<TestUser> {
  userCounter += 1;
  const email = `client${userCounter}.${Date.now()}@example.com`;
  const password = 'Password1';

  const registerResponse = await context
    .http()
    .post(url('/auth/register'))
    .send({
      fullName: `Client ${userCounter}`,
      email,
      phone: options.phone ?? '+37411000001',
      address: 'Yerevan, Abovyan 1',
      password,
      locale: 'RU',
    })
    .expect(201);

  if (options.verified !== false) {
    const token = extractVerificationToken(context, email);
    await context.http().post(url('/auth/verify')).send({ token }).expect(200);
  }

  const loginResponse = await context
    .http()
    .post(url('/auth/login'))
    .send({ email, password })
    .expect(200);

  return {
    id: (registerResponse.body as { userId: string }).userId,
    email,
    password,
    accessToken: (loginResponse.body as { accessToken: string }).accessToken,
  };
}

/** Создаёт сотрудника напрямую в БД: эндпоинта создания персонала в MVP нет. */
export async function createStaff(
  context: TestContext,
  role: UserRole = UserRole.ESTIMATOR,
): Promise<TestUser> {
  userCounter += 1;
  const email = `staff${userCounter}.${Date.now()}@example.com`;
  const password = 'Password1';
  const bcrypt = await import('bcryptjs');

  const { rows } = await context.db.query<{ id: string }>(
    `INSERT INTO "users"
       ("id","full_name","email","email_verified_at","phone","address","password_hash","role","locale","created_at","updated_at")
     VALUES (gen_random_uuid(), $1, $2, now(), '+37411000099', 'Yerevan', $3, $4, 'RU', now(), now())
     RETURNING "id"`,
    [`Staff ${userCounter}`, email, await bcrypt.hash(password, 10), role],
  );

  const loginResponse = await context
    .http()
    .post(url('/auth/login'))
    .send({ email, password })
    .expect(200);

  return {
    id: rows[0]!.id,
    email,
    password,
    accessToken: (loginResponse.body as { accessToken: string }).accessToken,
  };
}

/** Достаёт токен верификации из письма, отправленного в память. */
export function extractVerificationToken(context: TestContext, email: string): string {
  const message = context.mail.lastTo(email);
  if (!message) throw new Error(`письмо верификации для ${email} не отправлено`);
  const match = /token=([A-Za-z0-9_-]+)/.exec(message.text);
  if (!match?.[1]) throw new Error(`в письме нет ссылки верификации: ${message.text}`);
  return match[1];
}

/** Быстрый расчёт по стандартному пакету. */
export async function createEstimate(
  context: TestContext,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const response = await context
    .http()
    .post(url('/pricing/estimate'))
    .send({
      areaSqm: 80,
      objectType: 'APARTMENT',
      workScope: 'TURNKEY',
      finishPackage: 'STANDARD',
      condition: 'NEW_BUILDING',
      ceilingHeight: 'UP_TO_3M',
      locale: 'RU',
      ...overrides,
    })
    .expect(201);
  return (response.body as { id: string }).id;
}

/** Полный цикл загрузки файла: ссылка → «загрузка» в хранилище → подтверждение. */
export async function uploadFile(
  context: TestContext,
  user: TestUser,
  options: { kind?: 'BTI' | 'DESIGN'; name?: string; mime?: string; size?: number } = {},
): Promise<string> {
  const name = options.name ?? 'plan.pdf';
  const mime = options.mime ?? 'application/pdf';
  const size = options.size ?? 1024;

  const response = await context
    .http()
    .post(url('/files/upload-url'))
    .set('Authorization', `Bearer ${user.accessToken}`)
    .send({ kind: options.kind ?? 'BTI', originalName: name, mime, size })
    .expect(201);

  const fileId = (response.body as { fileId: string }).fileId;
  const { rows } = await context.db.query<{ storage_key: string }>(
    'SELECT "storage_key" FROM "files" WHERE "id" = $1',
    [fileId],
  );
  // Имитация PUT в R2 по подписанной ссылке.
  context.storage.completeUpload(rows[0]!.storage_key, Buffer.alloc(size, 1), mime);

  await context
    .http()
    .post(url(`/files/${fileId}/confirm`))
    .set('Authorization', `Bearer ${user.accessToken}`)
    .expect(200);

  return fileId;
}
