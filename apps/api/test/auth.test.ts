import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DATABASE_AVAILABLE,
  createClient,
  createTestContext,
  extractVerificationToken,
  url,
  type TestContext,
} from './harness';

/**
 * Интеграционные тесты аутентификации. Требуют настоящий PostgreSQL:
 * без DATABASE_URL/TEST_DATABASE_URL набор помечается пропущенным.
 */
describe.skipIf(!DATABASE_AVAILABLE)('auth (интеграция)', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await createTestContext();
  });
  afterAll(async () => {
    await context.close();
  });
  beforeEach(async () => {
    await context.reset();
  });

  const registration = {
    fullName: 'Արամ Պետրոսյան',
    email: 'aram@example.com',
    phone: '+37477123456',
    address: 'Երևան, Աբովյան 1',
    password: 'Password1',
    locale: 'RU' as const,
  };

  describe('регистрация', () => {
    it('создаёт пользователя и отправляет письмо верификации', async () => {
      const response = await context
        .http()
        .post(url('/auth/register'))
        .send(registration)
        .expect(201);

      expect(response.body).toEqual({
        userId: expect.any(String),
        emailVerificationSent: true,
      });
      const message = context.mail.lastTo(registration.email);
      expect(message?.subject).toContain('подтвердите e-mail');
      expect(message?.text).toContain('/verify?token=');
    });

    it('повторный e-mail отклоняется с кодом EMAIL_ALREADY_REGISTERED', async () => {
      await context.http().post(url('/auth/register')).send(registration).expect(201);
      const response = await context
        .http()
        .post(url('/auth/register'))
        .send(registration)
        .expect(409);
      expect(response.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it('телефон вне формата Армении отклоняется', async () => {
      const response = await context
        .http()
        .post(url('/auth/register'))
        .send({ ...registration, phone: '+79161234567' })
        .expect(422);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
      expect(response.body.error.details).toContainEqual({ field: 'phone', code: 'INVALID' });
    });

    it.each(['short1', 'onlyletters', '12345678'])(
      'слабый пароль "%s" отклоняется',
      async (password) => {
        await context
          .http()
          .post(url('/auth/register'))
          .send({ ...registration, password })
          .expect(422);
      },
    );

    it('пароль хранится как bcrypt-хеш, а не в открытом виде', async () => {
      await context.http().post(url('/auth/register')).send(registration).expect(201);
      const { rows } = await context.db.query<{ password_hash: string }>(
        'SELECT "password_hash" FROM "users" WHERE "email" = $1',
        [registration.email],
      );
      expect(rows[0]!.password_hash).toMatch(/^\$2[aby]\$\d{2}\$/);
      expect(rows[0]!.password_hash).not.toContain(registration.password);
    });

    it('телефон не уникален: дубли решаются склейкой в админке, а не запретом', async () => {
      await context.http().post(url('/auth/register')).send(registration).expect(201);
      await context
        .http()
        .post(url('/auth/register'))
        .send({ ...registration, email: 'other@example.com' })
        .expect(201);
    });
  });

  describe('верификация e-mail', () => {
    it('подтверждает адрес по ссылке из письма', async () => {
      await context.http().post(url('/auth/register')).send(registration).expect(201);
      const token = extractVerificationToken(context, registration.email);

      const response = await context.http().post(url('/auth/verify')).send({ token }).expect(200);
      expect(response.body).toEqual({ verified: true });

      const { rows } = await context.db.query<{ email_verified_at: Date | null }>(
        'SELECT "email_verified_at" FROM "users" WHERE "email" = $1',
        [registration.email],
      );
      expect(rows[0]!.email_verified_at).not.toBeNull();
    });

    it('повторный переход по использованной ссылке → TOKEN_ALREADY_USED', async () => {
      await context.http().post(url('/auth/register')).send(registration).expect(201);
      const token = extractVerificationToken(context, registration.email);

      await context.http().post(url('/auth/verify')).send({ token }).expect(200);
      const response = await context.http().post(url('/auth/verify')).send({ token }).expect(409);
      expect(response.body.error.code).toBe('TOKEN_ALREADY_USED');
    });

    it('истёкшая ссылка → TOKEN_EXPIRED', async () => {
      await context.http().post(url('/auth/register')).send(registration).expect(201);
      const token = extractVerificationToken(context, registration.email);
      await context.db.query(
        `UPDATE "verification_tokens" SET "expires_at" = now() - interval '1 minute'`,
      );

      const response = await context.http().post(url('/auth/verify')).send({ token }).expect(410);
      expect(response.body.error.code).toBe('TOKEN_EXPIRED');
    });

    it('несуществующий токен → TOKEN_INVALID', async () => {
      const response = await context
        .http()
        .post(url('/auth/verify'))
        .send({ token: 'definitely-not-a-real-token' })
        .expect(400);
      expect(response.body.error.code).toBe('TOKEN_INVALID');
    });

    it('в БД хранится хеш, а не сам токен из письма', async () => {
      await context.http().post(url('/auth/register')).send(registration).expect(201);
      const token = extractVerificationToken(context, registration.email);
      const { rows } = await context.db.query<{ token_hash: string }>(
        'SELECT "token_hash" FROM "verification_tokens"',
      );
      expect(rows[0]!.token_hash).toHaveLength(64);
      expect(rows[0]!.token_hash).not.toBe(token);
    });
  });

  describe('повторная отправка письма', () => {
    it('чаще одного раза в 60 секунд не отправляется', async () => {
      const user = await createClient(context, { verified: false });

      const first = await context
        .http()
        .post(url('/auth/resend-verification'))
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(429);
      expect(first.body.error.code).toBe('RESEND_TOO_SOON');
      expect(first.headers['retry-after']).toBeDefined();
    });

    it('по истечении окна письмо уходит снова', async () => {
      const user = await createClient(context, { verified: false });
      await context.db.query(
        `UPDATE "verification_tokens" SET "created_at" = now() - interval '2 minutes'`,
      );

      const response = await context
        .http()
        .post(url('/auth/resend-verification'))
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(202);
      expect(response.body).toEqual({ sent: true, nextAllowedAt: expect.any(String) });

      const { rows } = await context.db.query<{ count: string }>(
        'SELECT count(*) FROM "verification_tokens" WHERE "user_id" = $1',
        [user.id],
      );
      expect(Number(rows[0]!.count)).toBe(2);
    });

    it('уже подтверждённый адрес → ALREADY_VERIFIED', async () => {
      const user = await createClient(context, { verified: true });
      const response = await context
        .http()
        .post(url('/auth/resend-verification'))
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(409);
      expect(response.body.error.code).toBe('ALREADY_VERIFIED');
    });

    it('без токена доступа эндпоинт закрыт', async () => {
      await context.http().post(url('/auth/resend-verification')).expect(401);
    });
  });

  describe('вход и токены', () => {
    it('выдаёт access-токен и кладёт refresh в httpOnly-cookie', async () => {
      const user = await createClient(context);
      const response = await context
        .http()
        .post(url('/auth/login'))
        .send({ email: user.email, password: user.password })
        .expect(200);

      expect(response.body.accessToken).toEqual(expect.any(String));
      expect(response.body.user.emailVerified).toBe(true);
      // refresh не отдаётся в теле — только в cookie
      expect(JSON.stringify(response.body)).not.toContain('refreshToken');

      const cookies = response.headers['set-cookie'] as unknown as string[];
      const cookie = cookies[0]!;
      expect(cookie).toContain('renovateam_rt=');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
    });

    it('неверный пароль и несуществующий e-mail дают одинаковый ответ', async () => {
      const user = await createClient(context);
      const wrongPassword = await context
        .http()
        .post(url('/auth/login'))
        .send({ email: user.email, password: 'WrongPass1' })
        .expect(401);
      const noSuchUser = await context
        .http()
        .post(url('/auth/login'))
        .send({ email: 'nobody@example.com', password: 'WrongPass1' })
        .expect(401);

      expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(noSuchUser.body.error.code).toBe(wrongPassword.body.error.code);
      expect(noSuchUser.body.error.message).toBe(wrongPassword.body.error.message);
    });

    it('ротация refresh: старый токен после обновления не работает', async () => {
      const user = await createClient(context);
      const login = await context
        .http()
        .post(url('/auth/login'))
        .send({ email: user.email, password: user.password })
        .expect(200);
      const oldCookie = login.headers['set-cookie'] as unknown as string[];

      const refreshed = await context
        .http()
        .post(url('/auth/refresh'))
        .set('Cookie', oldCookie)
        .expect(200);
      expect(refreshed.body.accessToken).toEqual(expect.any(String));

      // Повторное использование старого токена — признак кражи.
      const reuse = await context
        .http()
        .post(url('/auth/refresh'))
        .set('Cookie', oldCookie)
        .expect(401);
      expect(reuse.body.error.code).toBe('REFRESH_INVALID');

      // Вся цепочка отозвана: новый токен тоже больше не работает.
      const newCookie = refreshed.headers['set-cookie'] as unknown as string[];
      await context.http().post(url('/auth/refresh')).set('Cookie', newCookie).expect(401);
    });

    it('GET /auth/me возвращает профиль без пароля', async () => {
      const user = await createClient(context);
      const response = await context
        .http()
        .get(url('/auth/me'))
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({ id: user.id, email: user.email, role: 'CLIENT' });
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    });

    it('без токена доступ к /auth/me закрыт', async () => {
      const response = await context.http().get(url('/auth/me')).expect(401);
      expect(response.body.error.requestId).toEqual(expect.any(String));
    });
  });
});
