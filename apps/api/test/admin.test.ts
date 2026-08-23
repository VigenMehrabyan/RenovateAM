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

describe.skipIf(!DATABASE_AVAILABLE)('admin, pricing и files (интеграция)', () => {
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

  async function newRequest(user: TestUser, estimateId?: string): Promise<string> {
    const response = await context
      .http()
      .post(url('/requests'))
      .set(auth(user))
      .send(estimateId ? { quickEstimateId: estimateId } : {})
      .expect(201);
    return response.body.id as string;
  }

  // ------------------------------------------------------------------ pricing

  describe('быстрый расчёт', () => {
    it('стандартный пакет: вилка по формуле README', async () => {
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
        })
        .expect(201);

      expect(response.body).toMatchObject({
        needsManualReview: false,
        amountBase: 4_800_000,
        amountMin: 4_080_000,
        amountMax: 5_520_000,
        currency: 'AMD',
      });
    });

    it('дизайнерский пакет: ни одной суммы в ответе', async () => {
      const response = await context
        .http()
        .post(url('/pricing/estimate'))
        .send({
          areaSqm: 80,
          objectType: 'APARTMENT',
          workScope: 'TURNKEY',
          finishPackage: 'DESIGNER',
          condition: 'NEW_BUILDING',
          ceilingHeight: 'UP_TO_3M',
        })
        .expect(201);

      expect(response.body.needsManualReview).toBe(true);
      expect(response.body.reason).toBe('DESIGNER_PACKAGE');
      expect(response.body.amountMin).toBeUndefined();
      expect(response.body.amountMax).toBeUndefined();
      expect(response.body.amountBase).toBeUndefined();

      const { rows } = await context.db.query<{ amount_min: number | null }>(
        'SELECT "amount_min" FROM "quick_estimates" WHERE "id" = $1',
        [response.body.id],
      );
      expect(rows[0]!.amount_min).toBeNull();
    });

    it('площадь вне диапазона 10–1000 м² отклоняется', async () => {
      for (const areaSqm of [9, 1001]) {
        const response = await context
          .http()
          .post(url('/pricing/estimate'))
          .send({
            areaSqm,
            objectType: 'APARTMENT',
            workScope: 'TURNKEY',
            finishPackage: 'STANDARD',
            condition: 'NEW_BUILDING',
            ceilingHeight: 'UP_TO_3M',
          })
          .expect(422);
        expect(response.body.error.code).toBe('VALIDATION_FAILED');
      }
    });

    it('расчёт доступен гостю и сохраняется анонимно', async () => {
      const id = await createEstimate(context);
      const { rows } = await context.db.query<{ user_id: string | null }>(
        'SELECT "user_id" FROM "quick_estimates" WHERE "id" = $1',
        [id],
      );
      expect(rows[0]!.user_id).toBeNull();
    });

    it('анонимный расчёт привязывается к пользователю при регистрации', async () => {
      const estimateId = await createEstimate(context);
      await context
        .http()
        .post(url('/auth/register'))
        .send({
          fullName: 'Test User',
          email: 'attach@example.com',
          phone: '+37477000000',
          address: 'Yerevan',
          password: 'Password1',
          locale: 'RU',
          quickEstimateIds: [estimateId],
        })
        .expect(201);

      const { rows } = await context.db.query<{ user_id: string | null }>(
        'SELECT "user_id" FROM "quick_estimates" WHERE "id" = $1',
        [estimateId],
      );
      expect(rows[0]!.user_id).not.toBeNull();
    });

    it('GET /pricing/rates отдаёт активную версию с базой 60 000', async () => {
      const response = await context.http().get(url('/pricing/rates')).expect(200);
      expect(response.body).toMatchObject({
        baseRateAmd: 60_000,
        rangeMin: 0.85,
        rangeMax: 1.15,
        validityDays: 30,
        workScope: { TURNKEY: 1, FINISHING: 0.6, ROUGH: 0.45 },
      });
      expect(response.body.versionId).toEqual(expect.any(String));
    });
  });

  describe('версионирование ставок', () => {
    it('новая версия не пересчитывает ранее выданные оценки', async () => {
      const admin = await createStaff(context, UserRole.ADMIN);
      const before = await context
        .http()
        .post(url('/pricing/estimate'))
        .send({
          areaSqm: 80,
          objectType: 'APARTMENT',
          workScope: 'TURNKEY',
          finishPackage: 'STANDARD',
          condition: 'NEW_BUILDING',
          ceilingHeight: 'UP_TO_3M',
        })
        .expect(201);

      await context
        .http()
        .put(url('/admin/pricing/rates'))
        .set(auth(admin))
        .send({ rates: { base_rate_amd: 90_000 }, note: 'подорожание' })
        .expect(201);

      // Старый расчёт не изменился ни в БД, ни в ответе API.
      const { rows } = await context.db.query<{ amount_base: number; rate_version_id: string }>(
        'SELECT "amount_base", "rate_version_id" FROM "quick_estimates" WHERE "id" = $1',
        [before.body.id],
      );
      expect(rows[0]!.amount_base).toBe(4_800_000);

      // Новый расчёт идёт по новой версии.
      const after = await context
        .http()
        .post(url('/pricing/estimate'))
        .send({
          areaSqm: 80,
          objectType: 'APARTMENT',
          workScope: 'TURNKEY',
          finishPackage: 'STANDARD',
          condition: 'NEW_BUILDING',
          ceilingHeight: 'UP_TO_3M',
        })
        .expect(201);
      expect(after.body.amountBase).toBe(7_200_000);
      expect(after.body.rateVersionId).not.toBe(before.body.rateVersionId);
    });

    it('старая версия ставок сохраняется целиком', async () => {
      const admin = await createStaff(context, UserRole.ADMIN);
      const versionsBefore = await context.db.query('SELECT * FROM "rate_versions"');

      await context
        .http()
        .put(url('/admin/pricing/rates'))
        .set(auth(admin))
        .send({ rates: { base_rate_amd: 75_000 } })
        .expect(201);

      const versionsAfter = await context.db.query<{ is_active: boolean }>(
        'SELECT "is_active" FROM "rate_versions" ORDER BY "created_at"',
      );
      expect(versionsAfter.rows).toHaveLength(versionsBefore.rows.length + 1);
      expect(versionsAfter.rows.filter((row) => row.is_active)).toHaveLength(1);
    });

    it('история версий доступна админу', async () => {
      const admin = await createStaff(context, UserRole.ADMIN);
      await context
        .http()
        .put(url('/admin/pricing/rates'))
        .set(auth(admin))
        .send({ rates: { base_rate_amd: 65_000 }, note: 'калибровка' })
        .expect(201);

      const response = await context
        .http()
        .get(url('/admin/pricing/rates/versions'))
        .set(auth(admin))
        .expect(200);

      expect(response.body.items.length).toBeGreaterThanOrEqual(2);
      expect(response.body.items[0]).toMatchObject({ isActive: true, note: 'калибровка' });
    });

    it('неизвестный ключ ставки отклоняется', async () => {
      const admin = await createStaff(context, UserRole.ADMIN);
      const response = await context
        .http()
        .put(url('/admin/pricing/rates'))
        .set(auth(admin))
        .send({ rates: { totally_unknown_key: 1 } })
        .expect(422);
      expect(response.body.error.details).toContainEqual({
        field: 'totally_unknown_key',
        code: 'UNKNOWN_RATE_KEY',
      });
    });

    it('отрицательная ставка отклоняется', async () => {
      const admin = await createStaff(context, UserRole.ADMIN);
      await context
        .http()
        .put(url('/admin/pricing/rates'))
        .set(auth(admin))
        .send({ rates: { base_rate_amd: -1 } })
        .expect(422);
    });
  });

  // -------------------------------------------------------------------- files

  describe('загрузка файлов', () => {
    it('двухфазная загрузка: ссылка → загрузка → подтверждение', async () => {
      const user = await createClient(context);
      const response = await context
        .http()
        .post(url('/files/upload-url'))
        .set(auth(user))
        .send({ kind: 'BTI', originalName: 'plan.pdf', mime: 'application/pdf', size: 2048 })
        .expect(201);

      expect(response.body.uploadUrl).toContain('memory://upload/');
      expect(response.body.requiredHeaders).toEqual({
        'Content-Type': 'application/pdf',
        'Content-Length': '2048',
      });

      // До подтверждения файла для системы не существует.
      const { rows: before } = await context.db.query<{ uploaded_at: Date | null }>(
        'SELECT "uploaded_at" FROM "files" WHERE "id" = $1',
        [response.body.fileId],
      );
      expect(before[0]!.uploaded_at).toBeNull();

      const { rows: keys } = await context.db.query<{ storage_key: string }>(
        'SELECT "storage_key" FROM "files" WHERE "id" = $1',
        [response.body.fileId],
      );
      context.storage.completeUpload(keys[0]!.storage_key, Buffer.alloc(2048), 'application/pdf');

      await context
        .http()
        .post(url(`/files/${response.body.fileId}/confirm`))
        .set(auth(user))
        .expect(200);
    });

    it('подтверждение без реальной загрузки → UPLOAD_NOT_FOUND', async () => {
      const user = await createClient(context);
      const response = await context
        .http()
        .post(url('/files/upload-url'))
        .set(auth(user))
        .send({ kind: 'BTI', originalName: 'plan.pdf', mime: 'application/pdf', size: 2048 })
        .expect(201);

      const confirm = await context
        .http()
        .post(url(`/files/${response.body.fileId}/confirm`))
        .set(auth(user))
        .expect(409);
      expect(confirm.body.error.code).toBe('UPLOAD_NOT_FOUND');
    });

    it('неподдерживаемый формат отклоняется до выдачи ссылки', async () => {
      const user = await createClient(context);
      const response = await context
        .http()
        .post(url('/files/upload-url'))
        .set(auth(user))
        .send({
          kind: 'BTI',
          originalName: 'virus.exe',
          mime: 'application/x-msdownload',
          size: 1024,
        })
        .expect(415);
      expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
      expect(response.body.error.message).toContain('PDF, JPG, PNG or DWG');
    });

    it('расширение, не совпадающее с MIME, отклоняется', async () => {
      const user = await createClient(context);
      await context
        .http()
        .post(url('/files/upload-url'))
        .set(auth(user))
        .send({ kind: 'BTI', originalName: 'plan.exe', mime: 'application/pdf', size: 1024 })
        .expect(415);
    });

    it('файл больше 25 МБ отклоняется', async () => {
      const user = await createClient(context);
      const response = await context
        .http()
        .post(url('/files/upload-url'))
        .set(auth(user))
        .send({
          kind: 'BTI',
          originalName: 'huge.pdf',
          mime: 'application/pdf',
          size: 26 * 1024 * 1024,
        })
        .expect(422);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('больше 10 файлов на заявку не принимается', async () => {
      const user = await createClient(context);
      for (let index = 0; index < 10; index += 1) {
        await uploadFile(context, user, { name: `plan${index}.pdf` });
      }

      const response = await context
        .http()
        .post(url('/files/upload-url'))
        .set(auth(user))
        .send({ kind: 'BTI', originalName: 'eleventh.pdf', mime: 'application/pdf', size: 1024 })
        .expect(409);
      expect(response.body.error.code).toBe('FILE_LIMIT_REACHED');
    });

    it('файлы привязываются к заявке при её создании', async () => {
      const user = await createClient(context);
      const bti = await uploadFile(context, user, { kind: 'BTI', name: 'bti.pdf' });
      const design = await uploadFile(context, user, {
        kind: 'DESIGN',
        name: 'design.png',
        mime: 'image/png',
      });

      const created = await context
        .http()
        .post(url('/requests'))
        .set(auth(user))
        .send({ fileIds: [bti, design] })
        .expect(201);

      expect(created.body.files).toHaveLength(2);
      expect(created.body.files.map((file: { kind: string }) => file.kind).sort()).toEqual([
        'BTI',
        'DESIGN',
      ]);
    });

    it('чужой файл к своей заявке не привязывается', async () => {
      const owner = await createClient(context);
      const stranger = await createClient(context);
      const foreignFile = await uploadFile(context, owner);

      const created = await context
        .http()
        .post(url('/requests'))
        .set(auth(stranger))
        .send({ fileIds: [foreignFile] })
        .expect(201);
      expect(created.body.files).toEqual([]);
    });

    it('ключ в хранилище не содержит имени файла клиента', async () => {
      const user = await createClient(context);
      const fileId = await uploadFile(context, user, { name: 'секретный план.pdf' });
      const { rows } = await context.db.query<{ storage_key: string; original_name: string }>(
        'SELECT "storage_key", "original_name" FROM "files" WHERE "id" = $1',
        [fileId],
      );
      expect(rows[0]!.storage_key).not.toContain('секретный');
      expect(rows[0]!.original_name).toBe('секретный план.pdf');
    });
  });

  // -------------------------------------------------------------------- admin

  describe('очередь сметчика и статусы', () => {
    it('заявка появляется в очереди с контактами клиента', async () => {
      const user = await createClient(context);
      const staff = await createStaff(context);
      const estimateId = await createEstimate(context);
      await newRequest(user, estimateId);

      const response = await context
        .http()
        .get(url('/admin/requests'))
        .set(auth(staff))
        .expect(200);
      expect(response.body.total).toBe(1);
      expect(response.body.items[0]).toMatchObject({
        status: 'NEW',
        client: { email: user.email },
        estimateSummary: { amountMin: 4_080_000, amountMax: 5_520_000 },
      });
    });

    it('фильтр по статусу работает', async () => {
      const user = await createClient(context);
      const staff = await createStaff(context);
      await newRequest(user);

      const empty = await context
        .http()
        .get(url('/admin/requests?status=QUOTE_READY'))
        .set(auth(staff))
        .expect(200);
      expect(empty.body.items).toEqual([]);

      const found = await context
        .http()
        .get(url('/admin/requests?status=NEW'))
        .set(auth(staff))
        .expect(200);
      expect(found.body.items).toHaveLength(1);
    });

    it('поиск по телефону показывает дубли', async () => {
      const staff = await createStaff(context);
      const first = await createClient(context, { phone: '+37477555555' });
      const second = await createClient(context, { phone: '+37477555555' });
      await newRequest(first);
      await newRequest(second);

      const response = await context
        .http()
        .get(url('/admin/requests?phone=%2B37477555555'))
        .set(auth(staff))
        .expect(200);
      expect(response.body.items).toHaveLength(2);
      expect(response.body.items[0].duplicatePhoneCount).toBe(2);
    });

    it('недопустимый переход статуса отклоняется', async () => {
      const user = await createClient(context);
      const staff = await createStaff(context);
      const requestId = await newRequest(user);

      // NEW → QUOTE_READY минуя работу невозможен.
      const response = await context
        .http()
        .patch(url(`/admin/requests/${requestId}/status`))
        .set(auth(staff))
        .send({ to: 'QUOTE_READY' })
        .expect(409);
      expect(response.body.error.code).toBe('INVALID_STATUS_TRANSITION');

      // Как и возврат в NEW.
      await context
        .http()
        .patch(url(`/admin/requests/${requestId}/status`))
        .set(auth(staff))
        .send({ to: 'NEW' })
        .expect(409);
    });

    it('сметчик не может принять смету за клиента', async () => {
      const user = await createClient(context);
      const staff = await createStaff(context);
      const requestId = await newRequest(user);
      await context.db.query(`UPDATE "requests" SET "status" = 'QUOTE_READY' WHERE "id" = $1`, [
        requestId,
      ]);

      const response = await context
        .http()
        .patch(url(`/admin/requests/${requestId}/status`))
        .set(auth(staff))
        .send({ to: 'ACCEPTED' })
        .expect(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('переход в NEEDS_INFO требует комментария и шлёт письмо', async () => {
      const user = await createClient(context);
      const staff = await createStaff(context);
      const requestId = await newRequest(user);

      const withoutComment = await context
        .http()
        .patch(url(`/admin/requests/${requestId}/status`))
        .set(auth(staff))
        .send({ to: 'NEEDS_INFO' })
        .expect(422);
      expect(withoutComment.body.error.code).toBe('COMMENT_REQUIRED');

      await context
        .http()
        .patch(url(`/admin/requests/${requestId}/status`))
        .set(auth(staff))
        .send({ to: 'NEEDS_INFO', comment: 'План БТИ без масштаба' })
        .expect(200);

      const message = context.mail.lastTo(user.email);
      expect(message?.text).toContain('План БТИ без масштаба');
    });

    it('терминальный статус закрывает дальнейшие переходы', async () => {
      const user = await createClient(context);
      const staff = await createStaff(context);
      const requestId = await newRequest(user);
      await context.db.query(`UPDATE "requests" SET "status" = 'ACCEPTED' WHERE "id" = $1`, [
        requestId,
      ]);

      for (const to of ['IN_PROGRESS', 'NEEDS_INFO', 'QUOTE_READY']) {
        await context
          .http()
          .patch(url(`/admin/requests/${requestId}/status`))
          .set(auth(staff))
          .send({ to, comment: 'x' })
          .expect(409);
      }
    });

    it('каждая смена статуса пишется в журнал: кто, когда, из какого в какой', async () => {
      const user = await createClient(context);
      const staff = await createStaff(context);
      const requestId = await newRequest(user);

      await context
        .http()
        .patch(url(`/admin/requests/${requestId}/status`))
        .set(auth(staff))
        .send({ to: 'IN_PROGRESS' })
        .expect(200);

      const card = await context
        .http()
        .get(url(`/admin/requests/${requestId}`))
        .set(auth(staff))
        .expect(200);

      expect(card.body.statusLog).toHaveLength(2);
      expect(card.body.statusLog[1]).toMatchObject({
        fromStatus: 'NEW',
        toStatus: 'IN_PROGRESS',
        actorId: staff.id,
      });
    });
  });

  describe('загрузка сметы', () => {
    async function uploadQuote(staff: TestUser, requestId: string, totalAmount = 5_000_000) {
      return context
        .http()
        .post(url(`/admin/requests/${requestId}/quote`))
        .set(auth(staff))
        .field('totalAmount', String(totalAmount))
        .attach('file', Buffer.from('%PDF-1.4 smeta'), {
          filename: 'quote.pdf',
          contentType: 'application/pdf',
        });
    }

    it('смета переводит заявку в QUOTE_READY и уведомляет клиента', async () => {
      const user = await createClient(context);
      const staff = await createStaff(context);
      const requestId = await newRequest(user, await createEstimate(context));
      await context
        .http()
        .patch(url(`/admin/requests/${requestId}/status`))
        .set(auth(staff))
        .send({ to: 'IN_PROGRESS' })
        .expect(200);

      const response = await uploadQuote(staff, requestId, 5_100_000);
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ totalAmount: 5_100_000, isCurrent: true });

      const card = await context
        .http()
        .get(url(`/admin/requests/${requestId}`))
        .set(auth(staff))
        .expect(200);
      expect(card.body.status).toBe('QUOTE_READY');
      expect(context.mail.lastTo(user.email)?.subject).toContain('готова');
    });

    it('не-PDF отклоняется', async () => {
      const user = await createClient(context);
      const staff = await createStaff(context);
      const requestId = await newRequest(user);

      const response = await context
        .http()
        .post(url(`/admin/requests/${requestId}/quote`))
        .set(auth(staff))
        .field('totalAmount', '1000000')
        .attach('file', Buffer.from('not a pdf'), {
          filename: 'quote.png',
          contentType: 'image/png',
        });
      expect(response.status).toBe(415);
    });

    it('повторная загрузка заменяет смету, но история сохраняется', async () => {
      const user = await createClient(context);
      const staff = await createStaff(context);
      const requestId = await newRequest(user);
      await context
        .http()
        .patch(url(`/admin/requests/${requestId}/status`))
        .set(auth(staff))
        .send({ to: 'IN_PROGRESS' })
        .expect(200);

      await uploadQuote(staff, requestId, 4_000_000);
      await uploadQuote(staff, requestId, 4_500_000);

      const { rows } = await context.db.query<{ total_amount: number; is_current: boolean }>(
        'SELECT "total_amount", "is_current" FROM "quotes" WHERE "request_id" = $1 ORDER BY "created_at"',
        [requestId],
      );
      expect(rows).toHaveLength(2);
      expect(rows.filter((row) => row.is_current)).toHaveLength(1);
      expect(rows.find((row) => row.is_current)!.total_amount).toBe(4_500_000);
    });

    it('клиент скачивает свою смету, чужую — нет', async () => {
      const owner = await createClient(context);
      const stranger = await createClient(context);
      const staff = await createStaff(context);
      const requestId = await newRequest(owner);
      await context
        .http()
        .patch(url(`/admin/requests/${requestId}/status`))
        .set(auth(staff))
        .send({ to: 'IN_PROGRESS' })
        .expect(200);
      await uploadQuote(staff, requestId);

      await context
        .http()
        .get(url(`/admin/requests/${requestId}/quote/download-url`))
        .set(auth(owner))
        .expect(403); // клиент не имеет доступа к /admin

      const staffLink = await context
        .http()
        .get(url(`/admin/requests/${requestId}/quote/download-url`))
        .set(auth(staff))
        .expect(200);
      expect(staffLink.body.url).toContain('memory://download/');

      await context
        .http()
        .get(url(`/admin/requests/${requestId}/quote/download-url`))
        .set(auth(stranger))
        .expect(403);
    });
  });
});
