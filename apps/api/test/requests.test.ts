import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
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
        .send({ quickEstimateId: estimateId, comment: 'Хочу ремонт под ключ' })
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
        .send({})
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
        .send({ quickEstimateId: estimateId })
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
        .send({})
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
        .send({ quickEstimateId: estimateId })
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
        .send({})
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
      await context.http().post(url('/requests')).set(auth(user)).send({}).expect(403);

      const message = context.mail.lastTo(user.email)!;
      const token = /token=([A-Za-z0-9_-]+)/.exec(message.text)![1]!;
      await context.http().post(url('/auth/verify')).send({ token }).expect(200);

      // Старый access-токен ещё содержит emailVerified=false, но гейт читает БД.
      await context.http().post(url('/requests')).set(auth(user)).send({}).expect(201);
    });
  });

  describe('инвариант «одна активная заявка»', () => {
    it('вторая активная заявка не создаётся', async () => {
      const user = await createClient(context);
      await context.http().post(url('/requests')).set(auth(user)).send({}).expect(201);

      const second = await context
        .http()
        .post(url('/requests'))
        .set(auth(user))
        .send({})
        .expect(409);
      expect(second.body.error.code).toBe('ACTIVE_REQUEST_EXISTS');

      const { rows } = await context.db.query<{ count: string }>(
        'SELECT count(*) FROM "requests" WHERE "user_id" = $1',
        [user.id],
      );
      expect(Number(rows[0]!.count)).toBe(1);
    });

    it('параллельные отправки не создают двух заявок (гонка ловится индексом)', async () => {
      const user = await createClient(context);
      const results = await Promise.allSettled([
        context.http().post(url('/requests')).set(auth(user)).send({}),
        context.http().post(url('/requests')).set(auth(user)).send({}),
        context.http().post(url('/requests')).set(auth(user)).send({}),
      ]);
      const created = results.filter(
        (result) => result.status === 'fulfilled' && result.value.status === 201,
      );
      expect(created).toHaveLength(1);

      const { rows } = await context.db.query<{ count: string }>(
        'SELECT count(*) FROM "requests" WHERE "user_id" = $1',
        [user.id],
      );
      expect(Number(rows[0]!.count)).toBe(1);
    });

    it('после закрытия заявки можно создать новую', async () => {
      const user = await createClient(context);
      const first = await context
        .http()
        .post(url('/requests'))
        .set(auth(user))
        .send({})
        .expect(201);
      await context.db.query(`UPDATE "requests" SET "status" = 'REJECTED' WHERE "id" = $1`, [
        first.body.id,
      ]);

      await context.http().post(url('/requests')).set(auth(user)).send({}).expect(201);
    });

    it('заявки разных клиентов друг другу не мешают', async () => {
      const first = await createClient(context);
      const second = await createClient(context);
      await context.http().post(url('/requests')).set(auth(first)).send({}).expect(201);
      await context.http().post(url('/requests')).set(auth(second)).send({}).expect(201);
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
        .send({})
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
        .send({})
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
      await context.http().post(url('/requests')).set(auth(owner)).send({}).expect(201);

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
        .send({})
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

  describe('решение клиента', () => {
    async function prepareQuoteReady(): Promise<{ user: TestUser; requestId: string }> {
      const user = await createClient(context);
      const created = await context
        .http()
        .post(url('/requests'))
        .set(auth(user))
        .send({})
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
        .send({})
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
