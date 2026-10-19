import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DATABASE_AVAILABLE,
  createClient,
  createTestContext,
  extractResetToken,
  url,
  type TestContext,
} from './harness';

/**
 * Интеграционные тесты восстановления пароля (US-10, ARCHITECTURE §6.5).
 * Требуют настоящий PostgreSQL: без DATABASE_URL/TEST_DATABASE_URL набор
 * помечается пропущенным.
 */
describe.skipIf(!DATABASE_AVAILABLE)('восстановление пароля (интеграция)', () => {
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

  const NEW_PASSWORD = 'NewPassword9';

  describe('запрос письма', () => {
    it('по ссылке из письма задаётся новый пароль, и им можно войти', async () => {
      const user = await createClient(context);

      const forgot = await context
        .http()
        .post(url('/auth/forgot-password'))
        .send({ email: user.email })
        .expect(202);
      expect(forgot.body).toEqual({ accepted: true });

      const message = context.mail.lastTo(user.email);
      expect(message?.type).toBe('PASSWORD_RESET');
      expect(message?.text).toContain('/reset?token=');

      const token = extractResetToken(context, user.email);
      const reset = await context
        .http()
        .post(url('/auth/reset-password'))
        .send({ token, password: NEW_PASSWORD })
        .expect(200);
      expect(reset.body).toEqual({ reset: true });

      // Новый пароль работает, старый — нет.
      await context
        .http()
        .post(url('/auth/login'))
        .send({ email: user.email, password: NEW_PASSWORD })
        .expect(200);
      const old = await context
        .http()
        .post(url('/auth/login'))
        .send({ email: user.email, password: user.password })
        .expect(401);
      expect(old.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    /**
     * Главное требование потока: эндпоинт не должен работать перечислителем
     * аккаунтов. Статус и тело для неизвестного адреса — ровно те же.
     */
    it('неизвестный адрес получает тот же 202 и то же тело, письма нет', async () => {
      const user = await createClient(context);
      context.mail.clear();

      const known = await context
        .http()
        .post(url('/auth/forgot-password'))
        .send({ email: user.email })
        .expect(202);
      const unknown = await context
        .http()
        .post(url('/auth/forgot-password'))
        .send({ email: 'nobody.at.all@example.com' })
        .expect(202);

      expect(unknown.status).toBe(known.status);
      expect(unknown.body).toEqual(known.body);
      expect(context.mail.lastTo('nobody.at.all@example.com')).toBeUndefined();
      // Ссылка выпущена только для существующего адреса.
      const { rows } = await context.db.query<{ count: string }>(
        'SELECT count(*) FROM "password_reset_tokens"',
      );
      expect(Number(rows[0]!.count)).toBe(1);
    });

    it('в БД лежит только хеш токена, а не сам токен из письма', async () => {
      const user = await createClient(context);
      await context
        .http()
        .post(url('/auth/forgot-password'))
        .send({ email: user.email })
        .expect(202);
      const token = extractResetToken(context, user.email);

      const { rows } = await context.db.query<{ token_hash: string }>(
        'SELECT "token_hash" FROM "password_reset_tokens"',
      );
      // Именно hex-хеш, а не сам токен: колонка CHAR(64) дополняет короткую
      // строку пробелами, поэтому одной длины для проверки недостаточно.
      expect(rows[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(rows[0]!.token_hash).not.toContain(token);
    });

    /** Отказ почтового канала не превращается в признак существования аккаунта. */
    it('канал отказал → всё равно 202 с тем же телом', async () => {
      const user = await createClient(context);
      context.mail.clear();
      context.mail.failDelivery();

      const response = await context
        .http()
        .post(url('/auth/forgot-password'))
        .send({ email: user.email })
        .expect(202);

      expect(response.body).toEqual({ accepted: true });
      expect(context.mail.all()).toHaveLength(0);
    });

    it('адрес не в форме e-mail → 422 VALIDATION_FAILED', async () => {
      const response = await context
        .http()
        .post(url('/auth/forgot-password'))
        .send({ email: 'не-адрес' })
        .expect(422);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('установка нового пароля', () => {
    it('истёкшая ссылка → 410 TOKEN_EXPIRED', async () => {
      const user = await createClient(context);
      await context
        .http()
        .post(url('/auth/forgot-password'))
        .send({ email: user.email })
        .expect(202);
      const token = extractResetToken(context, user.email);
      await context.db.query(
        `UPDATE "password_reset_tokens" SET "expires_at" = now() - interval '1 minute'`,
      );

      const response = await context
        .http()
        .post(url('/auth/reset-password'))
        .send({ token, password: NEW_PASSWORD })
        .expect(410);
      expect(response.body.error.code).toBe('TOKEN_EXPIRED');
      // Пароль остался прежним.
      await context
        .http()
        .post(url('/auth/login'))
        .send({ email: user.email, password: user.password })
        .expect(200);
    });

    it('повторный проход по той же ссылке → 409 TOKEN_ALREADY_USED', async () => {
      const user = await createClient(context);
      await context
        .http()
        .post(url('/auth/forgot-password'))
        .send({ email: user.email })
        .expect(202);
      const token = extractResetToken(context, user.email);

      await context
        .http()
        .post(url('/auth/reset-password'))
        .send({ token, password: NEW_PASSWORD })
        .expect(200);
      const response = await context
        .http()
        .post(url('/auth/reset-password'))
        .send({ token, password: 'OneMorePass8' })
        .expect(409);
      expect(response.body.error.code).toBe('TOKEN_ALREADY_USED');

      // Второй пароль не применился.
      await context
        .http()
        .post(url('/auth/login'))
        .send({ email: user.email, password: NEW_PASSWORD })
        .expect(200);
    });

    it('несуществующий токен → 400 TOKEN_INVALID', async () => {
      const response = await context
        .http()
        .post(url('/auth/reset-password'))
        .send({ token: 'definitely-not-a-real-token', password: NEW_PASSWORD })
        .expect(400);
      expect(response.body.error.code).toBe('TOKEN_INVALID');
    });

    it('сообщение об ошибке не содержит присланный токен', async () => {
      const token = 'definitely-not-a-real-token';
      const response = await context
        .http()
        .post(url('/auth/reset-password'))
        .send({ token, password: NEW_PASSWORD })
        .expect(400);
      expect(JSON.stringify(response.body)).not.toContain(token);
    });

    it('слабый пароль отклоняется теми же правилами, что при регистрации', async () => {
      const user = await createClient(context);
      await context
        .http()
        .post(url('/auth/forgot-password'))
        .send({ email: user.email })
        .expect(202);
      const token = extractResetToken(context, user.email);

      for (const password of ['short1', 'onlyletters', '12345678']) {
        await context
          .http()
          .post(url('/auth/reset-password'))
          .send({ token, password })
          .expect(422);
      }
      // Ссылка не израсходована неудачными попытками.
      await context
        .http()
        .post(url('/auth/reset-password'))
        .send({ token, password: NEW_PASSWORD })
        .expect(200);
    });

    it('прочие неиспользованные ссылки того же человека гасятся', async () => {
      const user = await createClient(context);
      await context
        .http()
        .post(url('/auth/forgot-password'))
        .send({ email: user.email })
        .expect(202);
      const first = extractResetToken(context, user.email);

      await context
        .http()
        .post(url('/auth/forgot-password'))
        .send({ email: user.email })
        .expect(202);
      const second = extractResetToken(context, user.email);
      expect(second).not.toBe(first);

      await context
        .http()
        .post(url('/auth/reset-password'))
        .send({ token: second, password: NEW_PASSWORD })
        .expect(200);

      const response = await context
        .http()
        .post(url('/auth/reset-password'))
        .send({ token: first, password: 'YetAnother7' })
        .expect(409);
      expect(response.body.error.code).toBe('TOKEN_ALREADY_USED');
    });

    /**
     * Смысл отзыва сессий: кто бы ни запросил смену пароля — хозяин или тот,
     * кто аккаунт увёл, — живым остаётся только знающий новый пароль.
     */
    it('после смены пароля старый refresh-токен больше не работает', async () => {
      const user = await createClient(context);
      const login = await context
        .http()
        .post(url('/auth/login'))
        .send({ email: user.email, password: user.password })
        .expect(200);
      const cookie = login.headers['set-cookie'] as unknown as string[];

      // До смены пароля сессия жива.
      const before = await context
        .http()
        .post(url('/auth/refresh'))
        .set('Cookie', cookie)
        .expect(200);
      const rotated = before.headers['set-cookie'] as unknown as string[];

      await context
        .http()
        .post(url('/auth/forgot-password'))
        .send({ email: user.email })
        .expect(202);
      await context
        .http()
        .post(url('/auth/reset-password'))
        .send({ token: extractResetToken(context, user.email), password: NEW_PASSWORD })
        .expect(200);

      // После смены пароля — мертва, в том числе только что выданный токен.
      const after = await context
        .http()
        .post(url('/auth/refresh'))
        .set('Cookie', rotated)
        .expect(401);
      expect(after.body.error.code).toBe('REFRESH_INVALID');

      const { rows } = await context.db.query<{ count: string }>(
        'SELECT count(*) FROM "refresh_tokens" WHERE "user_id" = $1 AND "revoked_at" IS NULL',
        [user.id],
      );
      expect(Number(rows[0]!.count)).toBe(0);
    });
  });
});
