import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ADDRESS,
  DATABASE_AVAILABLE,
  createClient,
  createEstimate,
  createStaff,
  createTestContext,
  uploadFile,
  url,
  type TestContext,
  type TestUser,
} from './harness';
import { UserRole } from '../src/generated/prisma/enums';

describe.skipIf(!DATABASE_AVAILABLE)('requests (интеграция)', () => {
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

  const auth = (user: TestUser) => ({ Authorization: `Bearer ${user.accessToken}` });

  describe('создание заявки', () => {
    it('создаёт заявку с расчётом и отправляет письмо с номером', async () => {
      const user = await createClient(context);
      const estimateId = await createEstimate(context);

      const response = await context
        .http()
        .post(url('/requests'))
        .set(auth(user))
        .send({ address: ADDRESS, quickEstimateId: estimateId, comment: 'Хочу ремонт под ключ' })
        .expect(201);

      expect(response.body).toMatchObject({
        status: 'NEW',
        needsManual: false,
        comment: 'Хочу ремонт под ключ',
        number: expect.any(Number),
      });
      expect(response.body.estimate.amountMin).toBe(4_080_000);
      expect(response.body.estimate.amountMax).toBe(5_520_000);

      const message = context.mail.lastTo(user.email);
      expect(message?.subject).toContain(`№${response.body.number}`);
    });

    it('заявка создаётся и без файлов — они не блокируют отправку', async () => {
      const user = await createClient(context);
      const response = await context
        .http()
        .post(url('/requests'))
        .set(auth(user))
        .send({ address: ADDRESS })
        .expect(201);
      expect(response.body.files).toEqual([]);
      expect(response.body.needsManual).toBe(true);
    });

    it('заявка по дизайнерскому пакету помечается needsManual и не содержит сумм', async () => {
      const user = await createClient(context);
      const estimateId = await createEstimate(context, { finishPackage: 'DESIGNER' });

      const response = await context
        .http()
        .post(url('/requests'))
        .set(auth(user))
        .send({ address: ADDRESS, quickEstimateId: estimateId })
        .expect(201);

      expect(response.body.needsManual).toBe(true);
      expect(response.body.estimate.amountMin).toBeNull();
      expect(response.body.estimate.amountMax).toBeNull();
      expect(response.body.estimate.amountBase).toBeNull();
    });

    it('первая запись журнала создаётся вместе с заявкой', async () => {
      const user = await createClient(context);
      const created = await context
        .http()
        .post(url('/requests'))
        .set(auth(user))
        .send({ address: ADDRESS })
        .expect(201);

      const { rows } = await context.db.query<{ from_status: string | null; to_status: string }>(
        'SELECT "from_status", "to_status" FROM "status_log" WHERE "request_id" = $1',
        [created.body.id],
      );
      expect(rows).toEqual([{ from_status: null, to_status: 'NEW' }]);
    });

    it('просроченный расчёт → ESTIMATE_EXPIRED', async () => {
      const user = await createClient(context);
      const estimateId = await createEstimate(context);
      await context.db.query(
        `UPDATE "quick_estimates" SET "expires_at" = now() - interval '1 day' WHERE "id" = $1`,
        [estimateId],
      );

      const response = await context
        .http()
        .post(url('/requests'))
        .set(auth(user))
        .send({ address: ADDRESS, quickEstimateId: estimateId })
        .expect(410);
      expect(response.body.error.code).toBe('ESTIMATE_EXPIRED');
    });
  });

  describe('гейт верификации e-mail', () => {
    it('неверифицированный пользователь не может создать заявку', async () => {
      const user = await createClient(context, { verified: false });
      const response = await context
        .http()
        .post(url('/requests'))
        .set(auth(user))
        .send({ address: ADDRESS })
        .expect(403);
      expect(response.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('неверифицированный пользователь не может запросить ссылку на загрузку', async () => {
      const user = await createClient(context, { verified: false });
      const response = await context
        .http()
        .post(url('/files/upload-url'))
        .set(auth(user))
        .send({ kind: 'BTI', originalName: 'plan.pdf', mime: 'application/pdf', size: 1024 })
        .expect(403);
      expect(response.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('но в кабинет он входит и свои заявки видит', async () => {
      const user = await createClient(context, { verified: false });
      await context.http().get(url('/requests/me')).set(auth(user)).expect(200);
      await context.http().get(url('/auth/me')).set(auth(user)).expect(200);
    });

    it('после верификации заявка создаётся сразу, без перевыпуска токена', async () => {
      const user = await createClient(context, { verified: false });
      await context
        .http()
        .post(url('/requests'))
        .set(auth(user))
        .send({ address: ADDRESS })
        .expect(403);

      const message = context.mail.lastTo(user.email)!;
      const token = /token=([A-Za-z0-9_-]+)/.exec(message.text)![1]!;
      await context.http().post(url('/auth/verify')).send({ token }).expect(200);

      // Старый access-токен ещё содержит emailVerified=false, но гейт читает БД.
      await context
        .http()
        .post(url('/requests'))
        .set(auth(user))
        .send({ address: ADDRESS })
        .expect(201);
    });
  });

  describe('антидубль вместо «одной активной заявки»', () => {
    it('несколько заявок у одного клиента существуют одновременно', async () => {
      const user = await createClient(context);
      await context
        .http()
        .post(url('/requests'))
        .set(auth(user))
        .send({ address: 'Ереван, Маштоца 10' })
        .expect(201);
      await context
        .http()
        .post(url('/requests'))
        .set(auth(user))
        .send({ address: 'Гюмри, Руставели 3' })
        .expect(201);

      const mine = await context.http().get(url('/requests/me')).set(auth(user)).expect(200);
      expect(mine.body).toHaveLength(2);
      expect(mine.body.map((item: { address: string }) => item.address)).toEqual(
        expect.arrayContaining(['Ереван, Маштоца 10', 'Гюмри, Руставели 3']),
      );
    });

    it('четвёртая заявка за час отклоняется понятной ошибкой', async () => {
      const user = await createClient(context);
      for (let index = 0; index < 3; index += 1) {
        await context
          .http()
          .post(url('/requests'))
          .set(auth(user))
          .send({ address: ADDRESS })
          .expect(201);
      }

      const fourth = await context
        .http()
        .post(url('/requests'))
        .set(auth(user))
        .send({ address: ADDRESS })
        .expect(429);
      expect(fourth.body.error.code).toBe('REQUEST_LIMIT_REACHED');

      const { rows } = await context.db.query<{ count: string }>(
        'SELECT count(*) FROM "requests" WHERE "user_id" = $1',
        [user.id],
      );
      expect(Number(rows[0]!.count)).toBe(3);
    });

    it('окно считается по часу: заявки старше часа лимит не занимают', async () => {
      const user = await createClient(context);
      for (let index = 0; index < 3; index += 1) {
        await context
          .http()
          .post(url('/requests'))
          .set(auth(user))
          .send({ address: ADDRESS })
          .expect(201);
      }
      await context.db.query(
        `UPDATE "requests" SET "created_at" = now() - interval '2 hours' WHERE "user_id" = $1`,
        [user.id],
      );

      await context
        .http()
        .post(url('/requests'))
        .set(auth(user))
        .send({ address: ADDRESS })
        .expect(201);
    });

    it('параллельные отправки лимит не обходят', async () => {
      const user = await createClient(context);
      const results = await Promise.allSettled(
        Array.from({ length: 6 }, () =>
          context.http().post(url('/requests')).set(auth(user)).send({ address: ADDRESS }),
        ),
      );
      const created = results.filter(
        (result) => result.status === 'fulfilled' && result.value.status === 201,
      );
      expect(created).toHaveLength(3);

      const { rows } = await context.db.query<{ count: string }>(
        'SELECT count(*) FROM "requests" WHERE "user_id" = $1',
        [user.id],
      );
      expect(Number(rows[0]!.count)).toBe(3);
    });

    it('лимит считается по пользователю: заявки соседа не мешают', async () => {
      const first = await createClient(context);
      const second = await createClient(context);
      for (let index = 0; index < 3; index += 1) {
        await context
          .http()
          .post(url('/requests'))
          .set(auth(first))
          .send({ address: ADDRESS })
          .expect(201);
      }
      await context
        .http()
        .post(url('/requests'))
        .set(auth(second))
        .send({ address: ADDRESS })
        .expect(201);
    });

    it('адрес обязателен и не берётся из профиля молча', async () => {
      const user = await createClient(context);
      const response = await context
        .http()
        .post(url('/requests'))
        .set(auth(user))
        .send({})
        .expect(422);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
      expect(response.body.error.details).toContainEqual(
        expect.objectContaining({ field: 'address' }),
      );
    });
  });

  describe('список заявок кабинета', () => {
    /** Создаёт заявку и сразу приводит её к нужному статусу и дате изменения. */
    async function seedRequest(
      user: TestUser,
      params: { address: string; status?: string; updatedAt?: string },
    ): Promise<string> {
      const created = await context
        .http()
        .post(url('/requests'))
        .set(auth(user))
        .send({ address: params.address })
        .expect(201);
      const id = created.body.id as string;
      await context.db.query(
        `UPDATE "requests"
            SET "status" = COALESCE($2, "status")::"RequestStatus",
                "updated_at" = COALESCE($3::timestamptz, "updated_at")
          WHERE "id" = $1`,
        [id, params.status ?? null, params.updatedAt ?? null],
      );
      return id;
    }

    it('возвращает только свои заявки', async () => {
      const owner = await createClient(context);
      const stranger = await createClient(context);
      await seedRequest(owner, { address: 'Ереван, Маштоца 10' });
      await seedRequest(stranger, { address: 'Гюмри, Руставели 3' });

      const mine = await context.http().get(url('/requests/me')).set(auth(owner)).expect(200);
      expect(mine.body).toHaveLength(1);
      expect(mine.body[0].address).toBe('Ереван, Маштоца 10');
    });

    it('сначала требующие внимания клиента, дальше по дате изменения', async () => {
      const user = await createClient(context);
      await seedRequest(user, {
        address: 'Свежая, но ход не за клиентом',
        status: 'IN_PROGRESS',
        updatedAt: '2026-09-14T10:00:00Z',
      });
      await seedRequest(user, {
        address: 'Нужны данные',
        status: 'NEEDS_INFO',
        updatedAt: '2026-09-01T10:00:00Z',
      });
      await seedRequest(user, {
        address: 'Смета готова',
        status: 'QUOTE_READY',
        updatedAt: '2026-09-10T10:00:00Z',
      });

      const mine = await context.http().get(url('/requests/me')).set(auth(user)).expect(200);
      expect(mine.body.map((item: { address: string }) => item.address)).toEqual([
        'Смета готова',
        'Нужны данные',
        'Свежая, но ход не за клиентом',
      ]);
    });

    it('строка списка несёт адрес, площадь, объём работ, пакет и даты', async () => {
      const user = await createClient(context);
      const estimateId = await createEstimate(context, { workScope: 'FINISHING' });
      await context
        .http()
        .post(url('/requests'))
        .set(auth(user))
        .send({ address: 'Ереван, Маштоца 10', quickEstimateId: estimateId })
        .expect(201);

      const mine = await context.http().get(url('/requests/me')).set(auth(user)).expect(200);
      expect(mine.body[0]).toMatchObject({
        number: expect.any(Number),
        address: 'Ереван, Маштоца 10',
        status: 'NEW',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        estimate: {
          areaSqm: 80,
          workScope: 'FINISHING',
          finishPackage: 'STANDARD',
        },
      });
    });
  });

  describe('доступ к чужим данным', () => {
    it('чтение чужой заявки → 403', async () => {
      const owner = await createClient(context);
      const stranger = await createClient(context);
      const created = await context
        .http()
        .post(url('/requests'))
        .set(auth(owner))
        .send({ address: ADDRESS })
        .expect(201);

      const response = await context
        .http()
        .get(url(`/requests/${created.body.id}`))
        .set(auth(stranger))
        .expect(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('сметчик читает любую заявку', async () => {
      const owner = await createClient(context);
      const staff = await createStaff(context);
      const created = await context
        .http()
        .post(url('/requests'))
        .set(auth(owner))
        .send({ address: ADDRESS })
        .expect(201);

      await context
        .http()
        .get(url(`/requests/${created.body.id}`))
        .set(auth(staff))
        .expect(200);
    });

    it('GET /requests/me показывает только свои заявки', async () => {
      const owner = await createClient(context);
      const stranger = await createClient(context);
      await context
        .http()
        .post(url('/requests'))
        .set(auth(owner))
        .send({ address: ADDRESS })
        .expect(201);

      const mine = await context.http().get(url('/requests/me')).set(auth(stranger)).expect(200);
      expect(mine.body).toEqual([]);
    });

    it('решение по чужой заявке → 403', async () => {
      const owner = await createClient(context);
      const stranger = await createClient(context);
      const created = await context
        .http()
        .post(url('/requests'))
        .set(auth(owner))
        .send({ address: ADDRESS })
        .expect(201);
      await context.db.query(`UPDATE "requests" SET "status" = 'QUOTE_READY' WHERE "id" = $1`, [
        created.body.id,
      ]);

      const response = await context
        .http()
        .post(url(`/requests/${created.body.id}/decision`))
        .set(auth(stranger))
        .send({ result: 'ACCEPTED' })
        .expect(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('чужой файл не отдаётся по ссылке → 403', async () => {
      const owner = await createClient(context);
      const stranger = await createClient(context);
      const fileId = await uploadFile(context, owner);

      const response = await context
        .http()
        .get(url(`/files/${fileId}/download-url`))
        .set(auth(stranger))
        .expect(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('свой файл отдаётся по подписанной ссылке', async () => {
      const owner = await createClient(context);
      const fileId = await uploadFile(context, owner);

      const response = await context
        .http()
        .get(url(`/files/${fileId}/download-url`))
        .set(auth(owner))
        .expect(200);
      expect(response.body.url).toContain('memory://download/');
      expect(new Date(response.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('сметчик видит файлы любой заявки', async () => {
      const owner = await createClient(context);
      const staff = await createStaff(context, UserRole.ESTIMATOR);
      const fileId = await uploadFile(context, owner);

      await context
        .http()
        .get(url(`/files/${fileId}/download-url`))
        .set(auth(staff))
        .expect(200);
    });

    it('клиент не имеет доступа к админке', async () => {
      const user = await createClient(context);
      const response = await context.http().get(url('/admin/requests')).set(auth(user)).expect(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('сметчик не имеет доступа к редактору ставок', async () => {
      const staff = await createStaff(context, UserRole.ESTIMATOR);
      await context
        .http()
        .put(url('/admin/pricing/rates'))
        .set(auth(staff))
        .send({ rates: { base_rate_amd: 70_000 } })
        .expect(403);
    });
  });

  describe('карточка заявки в кабинете', () => {
    /** Доводит заявку клиента до статуса «смета готова» руками сметчика. */
    async function prepareWithQuote(): Promise<{
      owner: TestUser;
      stranger: TestUser;
      requestId: string;
    }> {
      const owner = await createClient(context);
      const stranger = await createClient(context);
      const staff = await createStaff(context);
      const created = await context
        .http()
        .post(url('/requests'))
        .set(auth(owner))
        .send({ address: ADDRESS, quickEstimateId: await createEstimate(context) })
        .expect(201);
      const requestId = created.body.id as string;

      await context
        .http()
        .patch(url(`/admin/requests/${requestId}/status`))
        .set(auth(staff))
        .send({ to: 'IN_PROGRESS' })
        .expect(200);
      await context
        .http()
        .post(url(`/admin/requests/${requestId}/quote`))
        .set(auth(staff))
        .field('totalAmount', '5000000')
        .attach('file', Buffer.from('%PDF-1.4 smeta'), {
          filename: 'quote.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      return { owner, stranger, requestId };
    }

    it('клиент видит смету, сумму и историю статусов своей заявки', async () => {
      const { owner, requestId } = await prepareWithQuote();

      const response = await context
        .http()
        .get(url(`/requests/${requestId}`))
        .set(auth(owner))
        .expect(200);

      expect(response.body.status).toBe('QUOTE_READY');
      expect(response.body.quote).toMatchObject({
        id: expect.any(String),
        totalAmount: 5_000_000,
        createdAt: expect.any(String),
      });
      // Ключ файла в хранилище клиенту не отдаётся — только ссылка по запросу.
      expect(response.body.quote.fileKey).toBeUndefined();
      expect(response.body.statusLog.map((entry: { toStatus: string }) => entry.toStatus)).toEqual([
        'NEW',
        'IN_PROGRESS',
        'QUOTE_READY',
      ]);
      expect(response.body.address).toBe(ADDRESS);
    });

    it('клиент получает подписанную ссылку на свою смету', async () => {
      const { owner, stranger, requestId } = await prepareWithQuote();

      const link = await context
        .http()
        .get(url(`/requests/${requestId}/quote/download-url`))
        .set(auth(owner))
        .expect(200);
      expect(link.body.url).toContain('memory://download/');

      await context
        .http()
        .get(url(`/requests/${requestId}/quote/download-url`))
        .set(auth(stranger))
        .expect(403);
    });

    it('чужую заявку по идентификатору не отдаёт даже со сметой', async () => {
      const { stranger, requestId } = await prepareWithQuote();
      const response = await context
        .http()
        .get(url(`/requests/${requestId}`))
        .set(auth(stranger))
        .expect(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('решение клиента', () => {
    async function prepareQuoteReady(): Promise<{ user: TestUser; requestId: string }> {
      const user = await createClient(context);
      const created = await context
        .http()
        .post(url('/requests'))
        .set(auth(user))
        .send({ address: ADDRESS })
        .expect(201);
      await context.db.query(`UPDATE "requests" SET "status" = 'QUOTE_READY' WHERE "id" = $1`, [
        created.body.id,
      ]);
      return { user, requestId: created.body.id as string };
    }

    it('принятие сметы переводит заявку в ACCEPTED и уведомляет', async () => {
      const { user, requestId } = await prepareQuoteReady();
      const response = await context
        .http()
        .post(url(`/requests/${requestId}/decision`))
        .set(auth(user))
        .send({ result: 'ACCEPTED' })
        .expect(201);

      expect(response.body.status).toBe('ACCEPTED');
      expect(response.body.decision).toMatchObject({ result: 'ACCEPTED', reason: null });
      expect(context.mail.lastTo(user.email)?.subject).toContain('смета принята');
    });

    it('отказ без причины отклоняется', async () => {
      const { user, requestId } = await prepareQuoteReady();
      const response = await context
        .http()
        .post(url(`/requests/${requestId}/decision`))
        .set(auth(user))
        .send({ result: 'REJECTED' })
        .expect(422);
      expect(response.body.error.details).toContainEqual({ field: 'reason', code: 'REQUIRED' });
    });

    it('причина OTHER без комментария отклоняется', async () => {
      const { user, requestId } = await prepareQuoteReady();
      await context
        .http()
        .post(url(`/requests/${requestId}/decision`))
        .set(auth(user))
        .send({ result: 'REJECTED', reason: 'OTHER' })
        .expect(422);
    });

    it('отказ с причиной сохраняется и виден в заявке', async () => {
      const { user, requestId } = await prepareQuoteReady();
      const response = await context
        .http()
        .post(url(`/requests/${requestId}/decision`))
        .set(auth(user))
        .send({ result: 'REJECTED', reason: 'TOO_EXPENSIVE' })
        .expect(201);

      expect(response.body.status).toBe('REJECTED');
      expect(response.body.decision.reason).toBe('TOO_EXPENSIVE');
    });

    it('решение необратимо: повторное нажатие отклоняется', async () => {
      const { user, requestId } = await prepareQuoteReady();
      await context
        .http()
        .post(url(`/requests/${requestId}/decision`))
        .set(auth(user))
        .send({ result: 'ACCEPTED' })
        .expect(201);

      const second = await context
        .http()
        .post(url(`/requests/${requestId}/decision`))
        .set(auth(user))
        .send({ result: 'REJECTED', reason: 'TOO_EXPENSIVE' })
        .expect(409);
      expect(second.body.error.code).toBe('DECISION_ALREADY_MADE');
    });

    it('решение до готовности сметы невозможно', async () => {
      const user = await createClient(context);
      const created = await context
        .http()
        .post(url('/requests'))
        .set(auth(user))
        .send({ address: ADDRESS })
        .expect(201);

      const response = await context
        .http()
        .post(url(`/requests/${created.body.id}/decision`))
        .set(auth(user))
        .send({ result: 'ACCEPTED' })
        .expect(409);
      expect(response.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });
  });
});
