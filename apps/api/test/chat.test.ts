import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DATABASE_AVAILABLE,
  createClient,
  createStaff,
  createTestContext,
  url,
  type TestContext,
  type TestUser,
} from './harness';
import { UserRole } from '../src/generated/prisma/enums';
import { CHAT_ENTRIES } from '../src/modules/chat/knowledge/entries';

/** Ящик из MANAGER_EMAIL: роли «менеджер» в системе нет. */
const MANAGER = 'manager@renovateam.am';

/** Один и тот же номер, записанный так, как его пишут люди. */
const PHONE_FORMS = ['099099457', '+374 99 099 457', '00374 99-09-94-57'];
const PHONE_NORMALIZED = '+37499099457';

interface Reply {
  text: string;
  entryId: string;
  actions: string[];
  suggestions: string[];
  needsContacts: boolean;
}

describe.skipIf(!DATABASE_AVAILABLE)('чат-бот (интеграция)', () => {
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

  /**
   * Открывает разговор. Содержимое ответа не проверяется: база знаний
   * наполняется параллельно другой командой, и тест не должен зависеть
   * от её состава — только от структуры ответа.
   */
  async function startSession(body: Record<string, unknown> = {}): Promise<string> {
    const response = await context
      .http()
      .post(url('/chat/sessions'))
      .send({ locale: 'RU', ...body })
      .expect(201);
    const payload = response.body as { sessionId: string; locale: string; reply: Reply };
    expect(payload.reply.entryId).toBe('greeting');
    expect(payload.reply.needsContacts).toBe(false);
    return payload.sessionId;
  }

  async function sendMessage(sessionId: string, text: string, status = 200) {
    const response = await context
      .http()
      .post(url(`/chat/sessions/${sessionId}/messages`))
      .send({ text })
      .expect(status);
    return response.body as { reply: Reply } & { error?: { code: string } };
  }

  async function saveContacts(
    sessionId: string,
    contacts: Record<string, unknown> = {},
    status = 200,
  ) {
    const response = await context
      .http()
      .post(url(`/chat/sessions/${sessionId}/contacts`))
      .send({
        name: 'Ани',
        email: 'ani@example.com',
        phone: PHONE_FORMS[0],
        ...contacts,
      })
      .expect(status);
    return response.body as {
      reply?: Reply;
      error?: { code: string; details?: Array<{ field: string; code: string }> };
    };
  }

  async function sessionRow(sessionId: string) {
    const { rows } = await context.db.query<{
      contact_name: string | null;
      contact_email: string | null;
      contact_phone: string | null;
      lead_captured_at: Date | null;
      handoff_requested_at: Date | null;
      handled_at: Date | null;
      locale: string;
    }>(
      `SELECT "contact_name", "contact_email", "contact_phone", "lead_captured_at",
              "handoff_requested_at", "handled_at", "locale"
         FROM "chat_sessions" WHERE "id" = $1`,
      [sessionId],
    );
    return rows[0]!;
  }

  function leadEmails(type: 'CHAT_LEAD' | 'CHAT_HANDOFF') {
    return context.mail.all().filter((message) => message.type === type);
  }

  // --- диалог --------------------------------------------------------------

  describe('разговор', () => {
    it('приветствие отдаётся сразу и сохраняется в разговоре', async () => {
      const sessionId = await startSession({ pageUrl: 'https://renovateam.am/' });

      const { rows } = await context.db.query<{ role: string; entry_id: string | null }>(
        'SELECT "role", "entry_id" FROM "chat_messages" WHERE "session_id" = $1',
        [sessionId],
      );
      expect(rows).toEqual([{ role: 'BOT', entry_id: 'greeting' }]);
    });

    it('ответ содержит все поля контракта и не больше двух кнопок с тремя подсказками', async () => {
      const sessionId = await startSession();
      const { reply } = await sendMessage(sessionId, 'сколько стоит ремонт');

      expect(typeof reply.text).toBe('string');
      expect(reply.text.length).toBeGreaterThan(0);
      expect(typeof reply.entryId).toBe('string');
      expect(reply.entryId.length).toBeGreaterThan(0);
      expect(reply.actions.length).toBeLessThanOrEqual(2);
      expect(reply.suggestions.length).toBeLessThanOrEqual(3);
      expect(reply.needsContacts).toBe(true);
    });

    it('подсказки под приветствием не повторяют кнопку расчёта', async () => {
      // Кнопка ESTIMATE в виджете подписана «Посчитать цену» — ровно тем же,
      // чем подписана тема calculate_for_me. Когда подсказки брались как
      // «первые три темы базы», посетитель видел этот ход дважды: кнопкой и
      // подсказкой рядом с ней.
      const response = await context
        .http()
        .post(url('/chat/sessions'))
        .send({ locale: 'RU' })
        .expect(201);
      const { reply } = response.body as { reply: Reply };
      const calculate = CHAT_ENTRIES.find((entry) => entry.id === 'calculate_for_me');

      expect(reply.actions).toContain('ESTIMATE');
      expect(calculate).toBeDefined();
      expect(reply.suggestions).not.toContain(calculate?.label.ru);
      expect(new Set(reply.suggestions).size).toBe(reply.suggestions.length);
    });

    it('вопрос и ответ бота сохраняются парой', async () => {
      const sessionId = await startSession();
      await sendMessage(sessionId, 'сколько стоит ремонт');

      const { rows } = await context.db.query<{ role: string; text: string }>(
        'SELECT "role", "text" FROM "chat_messages" WHERE "session_id" = $1 ORDER BY "created_at"',
        [sessionId],
      );
      expect(rows.map((row) => row.role)).toEqual(['BOT', 'VISITOR', 'BOT']);
      expect(rows[1]!.text).toBe('сколько стоит ремонт');
    });

    it('язык сообщения запоминается в сессии', async () => {
      const sessionId = await startSession({ locale: 'RU' });
      await sendMessage(sessionId, 'how much does the renovation cost');
      expect((await sessionRow(sessionId)).locale).toBe('EN');
    });

    it('пустой текст и текст больше 1000 символов — 400 VALIDATION_FAILED', async () => {
      const sessionId = await startSession();

      const blank = await sendMessage(sessionId, '    ', 400);
      expect(blank.error?.code).toBe('VALIDATION_FAILED');

      const long = await sendMessage(sessionId, 'а'.repeat(1001), 400);
      expect(long.error?.code).toBe('VALIDATION_FAILED');
    });

    it('неизвестная сессия — 404 CHAT_SESSION_NOT_FOUND', async () => {
      const response = await sendMessage('0b2f17c0-0000-4000-8000-000000000999', 'цена', 404);
      expect(response.error?.code).toBe('CHAT_SESSION_NOT_FOUND');
    });

    it('сессия старше суток считается закрытой — тот же 404', async () => {
      const sessionId = await startSession();
      await context.db.query(
        `UPDATE "chat_sessions" SET "created_at" = now() - interval '25 hours' WHERE "id" = $1`,
        [sessionId],
      );

      const response = await sendMessage(sessionId, 'цена', 404);
      expect(response.error?.code).toBe('CHAT_SESSION_NOT_FOUND');
    });

    it('больше 60 сообщений посетителя — 429 CHAT_SESSION_EXHAUSTED', async () => {
      const sessionId = await startSession();
      await saveContacts(sessionId);
      // Шестьдесят сообщений вписываются напрямую: проверяется предел,
      // а не шестьдесят HTTP-запросов.
      await context.db.query(
        `INSERT INTO "chat_messages" ("id", "session_id", "role", "text")
         SELECT gen_random_uuid(), $1, 'VISITOR', 'вопрос ' || generate_series FROM generate_series(1, 60)`,
        [sessionId],
      );

      const response = await sendMessage(sessionId, 'ещё вопрос', 429);
      expect(response.error?.code).toBe('CHAT_SESSION_EXHAUSTED');
    });
  });

  // --- контакты ------------------------------------------------------------

  describe('контакты обязательны', () => {
    it('первый вопрос бесплатен, второй без контактов — 403, после контактов проходит', async () => {
      const sessionId = await startSession();

      const first = await sendMessage(sessionId, 'сколько стоит ремонт');
      expect(first.reply.needsContacts).toBe(true);

      const second = await sendMessage(sessionId, 'а сроки какие', 403);
      expect(second.error?.code).toBe('CHAT_CONTACTS_REQUIRED');

      await saveContacts(sessionId);

      const third = await sendMessage(sessionId, 'а сроки какие');
      expect(third.reply.needsContacts).toBe(false);
    });

    it('после сохранения контактов бот отвечает contacts_thanks', async () => {
      const sessionId = await startSession();
      const saved = await saveContacts(sessionId);
      expect(saved.reply?.entryId).toBe('contacts_thanks');
      expect(saved.reply?.needsContacts).toBe(false);
    });

    it('телефон нормализуется: три записи одного номера дают одну строку', async () => {
      for (const form of PHONE_FORMS) {
        const sessionId = await startSession();
        await saveContacts(sessionId, { phone: form });
        expect((await sessionRow(sessionId)).contact_phone, form).toBe(PHONE_NORMALIZED);
      }
    });

    it('невалидный телефон — 400 с полем phone в details', async () => {
      const sessionId = await startSession();
      const response = await saveContacts(sessionId, { phone: '12345' }, 400);

      expect(response.error?.code).toBe('VALIDATION_FAILED');
      expect(response.error?.details).toEqual([{ field: 'phone', code: 'INVALID' }]);
    });

    it('короткое имя и неверная почта тоже попадают в details', async () => {
      const sessionId = await startSession();
      const response = await saveContacts(sessionId, { name: 'А', email: 'не-почта' }, 400);

      expect(response.error?.details).toEqual([
        { field: 'name', code: 'INVALID' },
        { field: 'email', code: 'INVALID' },
      ]);
      // Ничего не сохранилось: лид не создаётся из половины данных.
      expect((await sessionRow(sessionId)).lead_captured_at).toBeNull();
    });

    it('авторизованный посетитель привязывается к сессии', async () => {
      const user = await createClient(context);
      const response = await context
        .http()
        .post(url('/chat/sessions'))
        .set(auth(user))
        .send({ locale: 'RU' })
        .expect(201);

      const sessionId = (response.body as { sessionId: string }).sessionId;
      const { rows } = await context.db.query<{ user_id: string | null }>(
        'SELECT "user_id" FROM "chat_sessions" WHERE "id" = $1',
        [sessionId],
      );
      expect(rows[0]!.user_id).toBe(user.id);
    });
  });

  // --- уведомления ---------------------------------------------------------

  describe('лид уходит менеджеру', () => {
    it('CHAT_LEAD отправлен ровно один раз, после записи в базу', async () => {
      const sessionId = await startSession();
      await sendMessage(sessionId, 'сколько стоит ремонт 60 метров');
      await saveContacts(sessionId);

      const sent = leadEmails('CHAT_LEAD');
      expect(sent).toHaveLength(1);
      expect(sent[0]!.to).toBe(MANAGER);
      expect(sent[0]!.text).toContain(PHONE_NORMALIZED);
      expect(sent[0]!.text).toContain('сколько стоит ремонт 60 метров');
      expect(sent[0]!.text).toContain(`/admin/chat/${sessionId}`);
      // Контакты в базе уже есть — письмо ушло после записи, а не вместо неё.
      expect((await sessionRow(sessionId)).lead_captured_at).not.toBeNull();
    });

    it('повторная отправка контактов не плодит уведомления', async () => {
      const sessionId = await startSession();
      await saveContacts(sessionId);
      await saveContacts(sessionId, { name: 'Ани Петросян' });

      expect(leadEmails('CHAT_LEAD')).toHaveLength(1);
      expect((await sessionRow(sessionId)).contact_name).toBe('Ани Петросян');
    });

    it('падение канала не ломает ответ API: лид сохранён', async () => {
      const sessionId = await startSession();
      context.mail.failDelivery();

      const saved = await saveContacts(sessionId);
      expect(saved.reply?.entryId).toBe('contacts_thanks');

      const row = await sessionRow(sessionId);
      expect(row.lead_captured_at).not.toBeNull();
      expect(row.contact_phone).toBe(PHONE_NORMALIZED);
    });

    it('handoff идемпотентен: второе нажатие не плодит уведомления', async () => {
      const sessionId = await startSession();
      await saveContacts(sessionId);

      const first = await context
        .http()
        .post(url(`/chat/sessions/${sessionId}/handoff`))
        .expect(200);
      expect((first.body as { reply: Reply }).reply.entryId).toBe('handoff_done');

      await context
        .http()
        .post(url(`/chat/sessions/${sessionId}/handoff`))
        .expect(200);

      expect(leadEmails('CHAT_HANDOFF')).toHaveLength(1);
      expect((await sessionRow(sessionId)).handoff_requested_at).not.toBeNull();
    });

    it('человека можно позвать и без контактов', async () => {
      const sessionId = await startSession();
      await context
        .http()
        .post(url(`/chat/sessions/${sessionId}/handoff`))
        .expect(200);

      const sent = leadEmails('CHAT_HANDOFF');
      expect(sent).toHaveLength(1);
      expect(sent[0]!.text).toContain('Контакты посетитель не оставил');
    });
  });

  // --- админка -------------------------------------------------------------

  describe('список лидов в админке', () => {
    let staff: TestUser;

    beforeEach(async () => {
      staff = await createStaff(context, UserRole.ESTIMATOR);
    });

    async function leads(query = '') {
      const response = await context
        .http()
        .get(url(`/admin/chat/sessions${query}`))
        .set(auth(staff))
        .expect(200);
      return response.body as {
        items: Array<{
          id: string;
          name: string | null;
          phone: string | null;
          firstQuestion: string | null;
          handoffRequested: boolean;
          handled: boolean;
        }>;
        total: number;
      };
    }

    it('анонимная сессия без контактов в списке не появляется', async () => {
      const anonymous = await startSession();
      await sendMessage(anonymous, 'сколько стоит ремонт');

      const list = await leads();
      expect(list.total).toBe(0);
      expect(list.items.map((item) => item.id)).not.toContain(anonymous);
    });

    it('сессия с контактами попадает в список вместе с первым вопросом', async () => {
      const sessionId = await startSession();
      await sendMessage(sessionId, 'сколько стоит ремонт 60 метров');
      await saveContacts(sessionId);

      const list = await leads();
      expect(list.total).toBe(1);
      expect(list.items[0]).toMatchObject({
        id: sessionId,
        name: 'Ани',
        phone: PHONE_NORMALIZED,
        firstQuestion: 'сколько стоит ремонт 60 метров',
        handoffRequested: false,
        handled: false,
      });
    });

    it('сессия без контактов, но с запросом человека, в список попадает', async () => {
      const sessionId = await startSession();
      await context
        .http()
        .post(url(`/chat/sessions/${sessionId}/handoff`))
        .expect(200);

      const list = await leads();
      expect(list.items.map((item) => item.id)).toEqual([sessionId]);
      expect(list.items[0]!.handoffRequested).toBe(true);
      expect(list.items[0]!.name).toBeNull();
    });

    it('фильтр handled: новые, обработанные и все', async () => {
      const handledSession = await startSession();
      await saveContacts(handledSession);
      const newSession = await startSession();
      await saveContacts(newSession, { email: 'second@example.com' });

      await context
        .http()
        .post(url(`/admin/chat/sessions/${handledSession}/handled`))
        .set(auth(staff))
        .expect(200);

      expect((await leads('?handled=true')).items.map((item) => item.id)).toEqual([handledSession]);
      expect((await leads('?handled=false')).items.map((item) => item.id)).toEqual([newSession]);
      // Пустое значение — фильтр снят, а не «только новые».
      expect((await leads('?handled=')).total).toBe(2);
      expect((await leads()).total).toBe(2);
    });

    it('новые сверху', async () => {
      const older = await startSession();
      await saveContacts(older);
      const newer = await startSession();
      await saveContacts(newer, { email: 'second@example.com' });

      const list = await leads();
      expect(list.items.map((item) => item.id)).toEqual([newer, older]);
    });

    it('отметка «обработан» идемпотентна и не меняет автора', async () => {
      const sessionId = await startSession();
      await saveContacts(sessionId);

      const first = await context
        .http()
        .post(url(`/admin/chat/sessions/${sessionId}/handled`))
        .set(auth(staff))
        .expect(200);
      const firstBody = first.body as { handled: boolean };
      expect(firstBody.handled).toBe(true);

      const another = await createStaff(context, UserRole.ADMIN);
      await context
        .http()
        .post(url(`/admin/chat/sessions/${sessionId}/handled`))
        .set(auth(another))
        .expect(200);

      const { rows } = await context.db.query<{ handled_by_id: string }>(
        'SELECT "handled_by_id" FROM "chat_sessions" WHERE "id" = $1',
        [sessionId],
      );
      expect(rows[0]!.handled_by_id).toBe(staff.id);
    });

    it('разговор целиком отдаётся с сообщениями', async () => {
      const sessionId = await startSession({ pageUrl: 'https://renovateam.am/services' });
      await sendMessage(sessionId, 'сколько стоит ремонт');
      await saveContacts(sessionId);

      const response = await context
        .http()
        .get(url(`/admin/chat/sessions/${sessionId}`))
        .set(auth(staff))
        .expect(200);
      const body = response.body as {
        id: string;
        pageUrl: string | null;
        messages: Array<{ role: string; text: string; entryId: string | null }>;
      };

      expect(body.id).toBe(sessionId);
      expect(body.pageUrl).toBe('https://renovateam.am/services');
      // Приветствие, вопрос, ответ и «спасибо за контакты»: менеджер видит
      // ровно то, что видел посетитель.
      expect(body.messages.map((message) => message.role)).toEqual([
        'BOT',
        'VISITOR',
        'BOT',
        'BOT',
      ]);
      expect(body.messages[0]!.entryId).toBe('greeting');
      expect(body.messages[1]!.entryId).toBeNull();
      expect(body.messages[3]!.entryId).toBe('contacts_thanks');
    });

    it('просроченная для посетителя сессия остаётся видимой менеджеру', async () => {
      const sessionId = await startSession();
      await saveContacts(sessionId);
      await context.db.query(
        `UPDATE "chat_sessions" SET "created_at" = now() - interval '25 hours' WHERE "id" = $1`,
        [sessionId],
      );

      await context
        .http()
        .get(url(`/admin/chat/sessions/${sessionId}`))
        .set(auth(staff))
        .expect(200);
    });

    it('неизвестный разговор — 404 CHAT_SESSION_NOT_FOUND', async () => {
      const response = await context
        .http()
        .get(url('/admin/chat/sessions/0b2f17c0-0000-4000-8000-000000000999'))
        .set(auth(staff))
        .expect(404);
      expect((response.body as { error: { code: string } }).error.code).toBe(
        'CHAT_SESSION_NOT_FOUND',
      );
    });

    it('клиенту список лидов закрыт, без токена — тоже', async () => {
      const client = await createClient(context);
      await context.http().get(url('/admin/chat/sessions')).set(auth(client)).expect(403);
      await context.http().get(url('/admin/chat/sessions')).expect(401);
    });
  });
});
