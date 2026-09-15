import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ADDRESS,
  DATABASE_AVAILABLE,
  createClient,
  createStaff,
  createTestContext,
  uploadFile,
  url,
  type TestContext,
  type TestUser,
} from './harness';
import { UserRole } from '../src/generated/prisma/enums';

/** Ящик из MANAGER_EMAIL: роли «менеджер» в системе нет (ARCHITECTURE §11, вопрос 7). */
const MANAGER = 'manager@renovateam.am';

describe.skipIf(!DATABASE_AVAILABLE)('обсуждение заявки (интеграция)', () => {
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

  /** Заявка клиента без расчёта — обсуждению расчёт не нужен. */
  async function createRequest(user: TestUser): Promise<string> {
    const created = await context
      .http()
      .post(url('/requests'))
      .set(auth(user))
      .send({ address: ADDRESS })
      .expect(201);
    return created.body.id as string;
  }

  async function comments(user: TestUser, requestId: string) {
    const response = await context
      .http()
      .get(url(`/requests/${requestId}`))
      .set(auth(user))
      .expect(200);
    return response.body.comments as Array<{
      id: string;
      text: string;
      author: { id: string | null; name: string | null; role: string };
      files: Array<{ id: string; originalName: string }>;
    }>;
  }

  describe('право писать и читать', () => {
    it('клиент пишет в своей заявке, сообщение появляется в ленте', async () => {
      const user = await createClient(context);
      const requestId = await createRequest(user);

      const response = await context
        .http()
        .post(url(`/requests/${requestId}/comments`))
        .set(auth(user))
        .send({ text: 'Потолки 2.7, плана БТИ нет на руках' })
        .expect(201);

      expect(response.body).toMatchObject({
        text: 'Потолки 2.7, плана БТИ нет на руках',
        author: { id: user.id, role: 'CLIENT' },
        files: [],
      });

      const feed = await comments(user, requestId);
      expect(feed).toHaveLength(1);
      expect(feed[0]!.text).toBe('Потолки 2.7, плана БТИ нет на руках');
    });

    it('чужая заявка — 403 и на чтение ленты, и на запись', async () => {
      const owner = await createClient(context);
      const stranger = await createClient(context);
      const requestId = await createRequest(owner);

      const read = await context
        .http()
        .get(url(`/requests/${requestId}`))
        .set(auth(stranger))
        .expect(403);
      expect(read.body.error.code).toBe('FORBIDDEN');

      const write = await context
        .http()
        .post(url(`/requests/${requestId}/comments`))
        .set(auth(stranger))
        .send({ text: 'Здравствуйте' })
        .expect(403);
      expect(write.body.error.code).toBe('FORBIDDEN');

      expect(await comments(owner, requestId)).toEqual([]);
    });

    it('сметчик и админ пишут в любой заявке', async () => {
      const owner = await createClient(context);
      const estimator = await createStaff(context, UserRole.ESTIMATOR);
      const admin = await createStaff(context, UserRole.ADMIN);
      const requestId = await createRequest(owner);

      await context
        .http()
        .post(url(`/requests/${requestId}/comments`))
        .set(auth(estimator))
        .send({ text: 'Нужен поэтажный план' })
        .expect(201);
      await context
        .http()
        .post(url(`/requests/${requestId}/comments`))
        .set(auth(admin))
        .send({ text: 'Считаем по вторичке с демонтажом' })
        .expect(201);

      const feed = await comments(owner, requestId);
      expect(feed.map((entry) => entry.author.role)).toEqual(['ESTIMATOR', 'ADMIN']);
      // Клиент видит, кто именно ответил: имя и роль, а не «сотрудник».
      expect(feed[0]!.author.name).toBeTruthy();
    });
  });

  describe('роль автора', () => {
    it('сохраняется в записи и переживает смену роли пользователя', async () => {
      const owner = await createClient(context);
      const estimator = await createStaff(context, UserRole.ESTIMATOR);
      const requestId = await createRequest(owner);

      await context
        .http()
        .post(url(`/requests/${requestId}/comments`))
        .set(auth(estimator))
        .send({ text: 'Смета будет завтра' })
        .expect(201);

      // Сотрудника перевели: учётная запись та же, роль другая.
      await context.db.query(`UPDATE "users" SET "role" = 'CLIENT' WHERE "id" = $1`, [
        estimator.id,
      ]);

      const feed = await comments(owner, requestId);
      expect(feed[0]!.author.role).toBe('ESTIMATOR');
    });

    it('остаётся читаемой после удаления учётной записи автора', async () => {
      const owner = await createClient(context);
      const estimator = await createStaff(context, UserRole.ESTIMATOR);
      const requestId = await createRequest(owner);

      await context
        .http()
        .post(url(`/requests/${requestId}/comments`))
        .set(auth(estimator))
        .send({ text: 'Пришлите план БТИ' })
        .expect(201);

      await context.db.query(`DELETE FROM "users" WHERE "id" = $1`, [estimator.id]);

      const feed = await comments(owner, requestId);
      expect(feed[0]).toMatchObject({
        text: 'Пришлите план БТИ',
        author: { id: null, name: null, role: 'ESTIMATOR' },
      });
    });
  });

  describe('уведомления', () => {
    it('сообщение клиента уходит на общий ящик, а не самому клиенту', async () => {
      const user = await createClient(context);
      const requestId = await createRequest(user);
      context.mail.clear();

      await context
        .http()
        .post(url(`/requests/${requestId}/comments`))
        .set(auth(user))
        .send({ text: 'Готов прислать план' })
        .expect(201);

      const sent = context.mail.all().filter((message) => message.type === 'REQUEST_COMMENT');
      expect(sent).toHaveLength(1);
      expect(sent[0]!.to).toBe(MANAGER);
      // Автору собственного сообщения письма нет.
      expect(sent.some((message) => message.to === user.email)).toBe(false);
    });

    it('сообщение сметчика уходит клиенту, а не самому сметчику', async () => {
      const owner = await createClient(context);
      const estimator = await createStaff(context, UserRole.ESTIMATOR);
      const requestId = await createRequest(owner);
      context.mail.clear();

      await context
        .http()
        .post(url(`/requests/${requestId}/comments`))
        .set(auth(estimator))
        .send({ text: 'Не хватает плана БТИ' })
        .expect(201);

      const sent = context.mail.all().filter((message) => message.type === 'REQUEST_COMMENT');
      expect(sent.map((message) => message.to)).toEqual([owner.email]);
      expect(sent.some((message) => message.to === estimator.email)).toBe(false);
      expect(sent[0]!.subject).toContain('новое сообщение');
    });

    it('текст сообщения в письме экранирован', async () => {
      const owner = await createClient(context);
      const estimator = await createStaff(context, UserRole.ESTIMATOR);
      const requestId = await createRequest(owner);
      context.mail.clear();

      await context
        .http()
        .post(url(`/requests/${requestId}/comments`))
        .set(auth(estimator))
        .send({ text: '<script>alert("1")</script> & <b>жирный</b>' })
        .expect(201);

      const message = context.mail.lastTo(owner.email);
      expect(message?.html).toContain('&lt;script&gt;');
      expect(message?.html).not.toContain('<script>');
      expect(message?.html).not.toContain('<b>жирный</b>');
    });
  });

  describe('валидация', () => {
    it('сообщение ровно в 4000 символов принимается, 4001 — отклоняется', async () => {
      const user = await createClient(context);
      const requestId = await createRequest(user);

      await context
        .http()
        .post(url(`/requests/${requestId}/comments`))
        .set(auth(user))
        .send({ text: 'я'.repeat(4000) })
        .expect(201);

      const response = await context
        .http()
        .post(url(`/requests/${requestId}/comments`))
        .set(auth(user))
        .send({ text: 'я'.repeat(4001) })
        .expect(422);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');

      expect(await comments(user, requestId)).toHaveLength(1);
    });

    it('пустое сообщение без вложений отклоняется', async () => {
      const user = await createClient(context);
      const requestId = await createRequest(user);

      const response = await context
        .http()
        .post(url(`/requests/${requestId}/comments`))
        .set(auth(user))
        .send({ text: '   ' })
        .expect(422);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('в отклонённой заявке лента доступна только на чтение', async () => {
      const user = await createClient(context);
      const requestId = await createRequest(user);
      await context
        .http()
        .post(url(`/requests/${requestId}/comments`))
        .set(auth(user))
        .send({ text: 'Дорого выходит' })
        .expect(201);

      await context.db.query(`UPDATE "requests" SET "status" = 'REJECTED' WHERE "id" = $1`, [
        requestId,
      ]);

      const response = await context
        .http()
        .post(url(`/requests/${requestId}/comments`))
        .set(auth(user))
        .send({ text: 'Ещё вопрос' })
        .expect(409);
      expect(response.body.error.code).toBe('DISCUSSION_CLOSED');

      // Читать переписку по-прежнему можно: она документ.
      expect(await comments(user, requestId)).toHaveLength(1);
    });
  });

  describe('вложения', () => {
    it('файл из переписки виден в общем списке файлов заявки с пометкой', async () => {
      const user = await createClient(context);
      const requestId = await createRequest(user);
      const attachedAtSubmit = await uploadFile(context, user, { name: 'plan.pdf' });
      await context
        .http()
        .post(url(`/requests/${requestId}/comments`))
        .set(auth(user))
        .send({ text: 'План при отправке' })
        .expect(201);
      // Файл заявки: привязан отдельно, минуя обсуждение.
      await context.db.query(`UPDATE "files" SET "request_id" = $1 WHERE "id" = $2`, [
        requestId,
        attachedAtSubmit,
      ]);

      const fileId = await uploadFile(context, user, { name: 'dosyl.pdf' });
      const created = await context
        .http()
        .post(url(`/requests/${requestId}/comments`))
        .set(auth(user))
        .send({ text: 'Вот недостающий чертёж', fileIds: [fileId] })
        .expect(201);
      expect(created.body.files).toMatchObject([{ id: fileId, originalName: 'dosyl.pdf' }]);

      const card = await context
        .http()
        .get(url(`/requests/${requestId}`))
        .set(auth(user))
        .expect(200);

      const files = card.body.files as Array<{ id: string; source: string }>;
      expect(files).toHaveLength(2);
      expect(files.find((file) => file.id === fileId)?.source).toBe('DISCUSSION');
      expect(files.find((file) => file.id === attachedAtSubmit)?.source).toBe('REQUEST');
      // И в ленте вложение осталось при своём сообщении.
      const feed = card.body.comments as Array<{ files: Array<{ id: string }> }>;
      expect(feed[1]!.files.map((file) => file.id)).toEqual([fileId]);
    });

    it('чужой файл к сообщению не привязывается', async () => {
      const owner = await createClient(context);
      const stranger = await createClient(context);
      const requestId = await createRequest(owner);
      const foreignFile = await uploadFile(context, stranger, { name: 'foreign.pdf' });

      const created = await context
        .http()
        .post(url(`/requests/${requestId}/comments`))
        .set(auth(owner))
        .send({ text: 'Прикладываю', fileIds: [foreignFile] })
        .expect(201);

      expect(created.body.files).toEqual([]);
      const card = await context
        .http()
        .get(url(`/requests/${requestId}`))
        .set(auth(owner))
        .expect(200);
      expect(card.body.files).toEqual([]);
    });

    it('сметчик досылает файл в обсуждение, клиент видит его в заявке', async () => {
      const owner = await createClient(context);
      const estimator = await createStaff(context, UserRole.ESTIMATOR);
      const requestId = await createRequest(owner);
      const fileId = await uploadFile(context, estimator, { name: 'razmetka.pdf' });

      await context
        .http()
        .post(url(`/requests/${requestId}/comments`))
        .set(auth(estimator))
        .send({ text: 'Отметил на плане', fileIds: [fileId] })
        .expect(201);

      const card = await context
        .http()
        .get(url(`/requests/${requestId}`))
        .set(auth(owner))
        .expect(200);
      expect(card.body.files).toMatchObject([{ id: fileId, source: 'DISCUSSION' }]);
    });
  });

  describe('неизменяемость ленты', () => {
    it('эндпоинтов правки и удаления сообщения не существует', async () => {
      const user = await createClient(context);
      const requestId = await createRequest(user);
      const created = await context
        .http()
        .post(url(`/requests/${requestId}/comments`))
        .set(auth(user))
        .send({ text: 'Опечатка' })
        .expect(201);
      const commentId = created.body.id as string;

      for (const path of [
        `/requests/${requestId}/comments/${commentId}`,
        `/requests/comments/${commentId}`,
      ]) {
        await context.http().patch(url(path)).set(auth(user)).send({ text: 'Правка' }).expect(404);
        await context.http().put(url(path)).set(auth(user)).send({ text: 'Правка' }).expect(404);
        await context.http().delete(url(path)).set(auth(user)).expect(404);
      }

      // Запись на месте и не изменилась.
      const feed = await comments(user, requestId);
      expect(feed).toHaveLength(1);
      expect(feed[0]!.text).toBe('Опечатка');
    });
  });
});
