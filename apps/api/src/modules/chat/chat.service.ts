import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIG, type AppConfig } from '@config';
import { AppException } from '@common/errors/app.exception';
import { ErrorCode } from '@common/errors/error-codes';
import type { ChatMessage, ChatSession } from '@db';
import type { Locale } from '@db/enums';
import {
  NOTIFICATIONS_PUBLIC_SERVICE,
  type NotificationsPublicService,
} from '@modules/notifications/public';
import { ChatRepository, type NewMessage } from './chat.repository';
import { CHAT_ENTRIES, SERVICE_ENTRIES } from './knowledge/entries';
import type { Localized } from './knowledge/types';
import { normalizeArmenianPhone } from './phone';
import { detectLocale } from './search/detect-locale';
import { searchKnowledge } from './search/engine';
import type {
  ChatConversation,
  ChatLeadList,
  ChatLeadRow,
  ChatMessageView,
  ChatPublicService,
  ChatReply,
  ChatSessionStarted,
  ChatStaffActor,
} from './public';

/**
 * Срок жизни разговора. Сутки — это «тот же визит, может быть, с перерывом
 * на обед»; всё, что старше, посетитель уже не помнит, и продолжать прежнюю
 * нитку бессмысленно. Считается от начала разговора, а не от последнего
 * сообщения: иначе один длинный разговор живёт вечно.
 */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Предел сообщений посетителя на один разговор (docs/CHAT.md §5.1).
 * Шестьдесят вопросов — это уже не вопрос к боту из базы на сорок тем,
 * а либо скрипт, либо человек, которому нужен человек.
 */
export const MAX_VISITOR_MESSAGES = 60;

/** Длина сообщения посетителя после `trim`. */
export const MIN_TEXT_LENGTH = 1;
export const MAX_TEXT_LENGTH = 1000;

/** Кнопок под ответом — не больше двух, подсказок — не больше трёх (§5.1). */
const MAX_ACTIONS = 2;
const MAX_SUGGESTIONS = 3;

/** Предел колонки `chat_messages.text`. */
const STORED_TEXT_LIMIT = 2000;

/**
 * Стартовые подсказки под приветствием.
 *
 * Список именной, а не «первые три темы базы»: при таком отборе подсказка
 * «Посчитать цену» повторяла подпись кнопки ESTIMATE, стоящей рядом, и
 * посетитель видел один и тот же ход дважды. Здесь три разных входа в
 * разговор — цена, объём работ, сроки, — и ни один не дублирует кнопку.
 */
const STARTER_SUGGESTION_IDS = ['price_per_sqm', 'turnkey_scope', 'renovation_duration'];

@Injectable()
export class ChatService implements ChatPublicService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly repository: ChatRepository,
    @Inject(NOTIFICATIONS_PUBLIC_SERVICE)
    private readonly notifications: NotificationsPublicService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  // --- диалог --------------------------------------------------------------

  async startSession(input: {
    locale: Locale;
    pageUrl?: string;
    userId?: string;
  }): Promise<ChatSessionStarted> {
    const session = await this.repository.createSession({
      locale: input.locale,
      userId: input.userId ?? null,
      pageUrl: input.pageUrl ?? null,
    });

    const reply = this.serviceReply('greeting', input.locale, {
      suggestions: this.topicSuggestions(input.locale),
    });
    await this.repository.appendMessages(session.id, [botMessage(reply)], session.lastMessageAt);

    return { sessionId: session.id, locale: input.locale, reply };
  }

  async handleMessage(sessionId: string, rawText: string): Promise<ChatReply> {
    const text = rawText.trim();
    if (text.length < MIN_TEXT_LENGTH || text.length > MAX_TEXT_LENGTH) {
      throw new AppException(
        400,
        ErrorCode.VALIDATION_FAILED,
        `text must be ${MIN_TEXT_LENGTH}–${MAX_TEXT_LENGTH} characters after trim`,
        { details: [{ field: 'text', code: 'INVALID' }] },
      );
    }

    const session = await this.requireLiveSession(sessionId);
    const visitorMessages = await this.repository.countVisitorMessages(sessionId);

    if (visitorMessages >= MAX_VISITOR_MESSAGES) {
      throw new AppException(
        429,
        ErrorCode.CHAT_SESSION_EXHAUSTED,
        'Too many messages in this conversation',
      );
    }

    // Приветствие и первый вопрос бесплатны, дальше нужны контакты (§5.1).
    const hasContacts = session.leadCapturedAt !== null;
    if (!hasContacts && visitorMessages >= 1) {
      throw new AppException(
        403,
        ErrorCode.CHAT_CONTACTS_REQUIRED,
        'Contacts are required to continue the conversation',
      );
    }

    // Язык определяется для каждого сообщения заново и запоминается в сессии:
    // ответы, приветствие и письма менеджеру идут на нём (§2).
    const locale = detectLocale(text, session.locale, CHAT_ENTRIES);
    const needsContacts = !hasContacts;
    const reply = this.answer(text, locale, needsContacts);

    const now = new Date();
    await this.repository.appendMessages(
      sessionId,
      [{ role: 'VISITOR', text: truncate(text), entryId: null }, botMessage(reply)],
      now,
    );
    if (locale !== session.locale) {
      await this.repository.updateSession(sessionId, { locale });
    }

    return reply;
  }

  async saveContacts(
    sessionId: string,
    contacts: { name: string; email: string; phone: string },
  ): Promise<ChatReply> {
    const session = await this.requireLiveSession(sessionId);
    const validated = validateContacts(contacts);

    const alreadyLead = session.leadCapturedAt !== null;
    const capturedAt = session.leadCapturedAt ?? new Date();
    await this.repository.updateSession(sessionId, {
      contactName: validated.name,
      contactEmail: validated.email,
      contactPhone: validated.phone,
      leadCapturedAt: capturedAt,
    });

    const reply = await this.contactsReply(session);

    // Уведомление — только после записи в базу и только один раз на лид:
    // повторная отправка контактов не должна плодить письма менеджеру.
    if (!alreadyLead) {
      const question = await this.repository.findFirstVisitorMessage(sessionId);
      await this.notifyManager({
        type: 'CHAT_LEAD',
        locale: session.locale,
        name: validated.name,
        phone: validated.phone,
        email: validated.email,
        question: question?.text ?? '',
        sessionId,
      });
    }

    return reply;
  }

  async requestHandoff(sessionId: string): Promise<ChatReply> {
    const session = await this.requireLiveSession(sessionId);
    const reply = this.serviceReply('handoff_done', session.locale);

    // Идемпотентность: повторный вызов не плодит уведомления (§5.1).
    const alreadyRequested = session.handoffRequestedAt !== null;
    if (!alreadyRequested) {
      await this.repository.updateSession(sessionId, { handoffRequestedAt: new Date() });
    }
    await this.repository.appendMessages(sessionId, [botMessage(reply)], new Date());

    if (!alreadyRequested) {
      const question = await this.repository.findFirstVisitorMessage(sessionId);
      await this.notifyManager({
        type: 'CHAT_HANDOFF',
        locale: session.locale,
        name: session.contactName ?? '',
        phone: session.contactPhone ?? '',
        email: session.contactEmail ?? '',
        question: question?.text ?? '',
        sessionId,
      });
    }

    return reply;
  }

  // --- админка -------------------------------------------------------------

  async listLeads(query: {
    handled?: boolean;
    page: number;
    perPage: number;
  }): Promise<ChatLeadList> {
    const { rows, total } = await this.repository.listLeads({
      ...(query.handled === undefined ? {} : { handled: query.handled }),
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
    });
    const questions = await this.repository.firstVisitorMessages(rows.map((row) => row.id));

    return {
      items: rows.map((row) => toLeadRow(row, questions.get(row.id) ?? null)),
      page: query.page,
      perPage: query.perPage,
      total,
    };
  }

  async getConversation(sessionId: string): Promise<ChatConversation> {
    // В админке срок жизни сессии не применяется: разговор остаётся
    // историей лида и после того, как для посетителя он закрыт.
    const session = await this.repository.findSession(sessionId);
    if (!session) throw sessionNotFound();

    const messages = await this.repository.listMessages(sessionId);
    const firstQuestion = messages.find((message) => message.role === 'VISITOR') ?? null;

    return {
      ...toLeadRow(session, firstQuestion?.text ?? null),
      pageUrl: session.pageUrl,
      messages: messages.map(toMessageView),
    };
  }

  async markHandled(sessionId: string, actor: ChatStaffActor): Promise<ChatLeadRow> {
    const session = await this.repository.findSession(sessionId);
    if (!session) throw sessionNotFound();

    // Идемпотентно: повторная отметка не переписывает ни время, ни автора —
    // обработал лид тот, кто сделал это первым.
    if (session.handledAt !== null) {
      const question = await this.repository.findFirstVisitorMessage(sessionId);
      return toLeadRow(session, question?.text ?? null);
    }

    const updated = await this.repository.updateSession(sessionId, {
      handledAt: new Date(),
      handledById: actor.id,
    });
    const question = await this.repository.findFirstVisitorMessage(sessionId);
    return toLeadRow(updated, question?.text ?? null);
  }

  // --- внутреннее ----------------------------------------------------------

  /** Живая сессия или 404: неизвестная и просроченная отвечают одинаково. */
  private async requireLiveSession(sessionId: string): Promise<ChatSession> {
    const session = await this.repository.findSession(sessionId);
    if (!session) throw sessionNotFound();
    if (Date.now() - session.createdAt.getTime() > SESSION_TTL_MS) throw sessionNotFound();
    return session;
  }

  /** Решение движка, обёрнутое в ответ API. */
  private answer(text: string, locale: Locale, needsContacts: boolean): ChatReply {
    const outcome = searchKnowledge(text, CHAT_ENTRIES);

    let reply: ChatReply;
    switch (outcome.kind) {
      case 'ANSWER':
        reply = {
          text: outcome.entry.answer[localeKey(locale)],
          entryId: outcome.entry.id,
          actions: (outcome.entry.actions ?? []).slice(0, MAX_ACTIONS),
          suggestions: [],
          needsContacts,
        };
        break;

      case 'CLARIFY': {
        // Бот не угадывает между двумя близкими темами, а переспрашивает.
        const labels = [outcome.first, outcome.second].map(
          (entry) => entry.label[localeKey(locale)],
        );
        reply = {
          text: SERVICE_ENTRIES.clarify.answer[localeKey(locale)]
            .replace('{{a}}', labels[0] as string)
            .replace('{{b}}', labels[1] as string),
          entryId: SERVICE_ENTRIES.clarify.id,
          actions: (SERVICE_ENTRIES.clarify.actions ?? []).slice(0, MAX_ACTIONS),
          suggestions: labels.slice(0, MAX_SUGGESTIONS),
          needsContacts,
        };
        break;
      }

      case 'FALLBACK':
        reply = this.serviceReply('fallback', locale, {
          needsContacts,
          // Подсказки вместо «спросите иначе»: по названиям тем видно,
          // о чём бот вообще умеет говорить.
          suggestions: this.topicSuggestions(locale),
        });
        break;
    }

    if (!needsContacts) return reply;

    // Первое сообщение: к ответу добавляется просьба оставить контакты —
    // отдельной репликой бота виджету пришлось бы рисовать два пузыря,
    // а форма и так появляется внутри ленты (§7.3).
    const request = SERVICE_ENTRIES.contacts_request.answer[localeKey(locale)];
    return { ...reply, text: `${reply.text}\n\n${request}` };
  }

  /**
   * Ответ на сохранение контактов.
   *
   * Контракт обещает `contacts_thanks` «и, если посетитель ждал ответа на
   * вопрос, сразу ответ на него». Нормальным ходом такого долга не возникает:
   * первый вопрос отвечается бесплатно, а второй до контактов получает 403
   * и не сохраняется. Долг остаётся возможен только как след сбоя — когда
   * последним в разговоре лежит сообщение посетителя без ответа бота;
   * тогда на него и отвечаем.
   */
  private async contactsReply(session: ChatSession): Promise<ChatReply> {
    const thanks = this.serviceReply('contacts_thanks', session.locale);
    const last = await this.repository.findLastMessage(session.id);

    let reply = thanks;
    if (last && last.role === 'VISITOR') {
      const answer = this.answer(last.text, session.locale, false);
      reply = { ...answer, text: `${thanks.text}\n\n${answer.text}` };
    }

    // Реплика бота пишется в разговор так же, как приветствие и ответы:
    // менеджер в админке должен видеть ровно то, что видел посетитель.
    await this.repository.appendMessages(session.id, [botMessage(reply)], new Date());
    return reply;
  }

  /** Служебная реплика бота по фиксированному id. */
  private serviceReply(
    id: keyof typeof SERVICE_ENTRIES,
    locale: Locale,
    extra: { needsContacts?: boolean; suggestions?: string[] } = {},
  ): ChatReply {
    const entry = SERVICE_ENTRIES[id];
    return {
      text: entry.answer[localeKey(locale)],
      entryId: entry.id,
      actions: (entry.actions ?? []).slice(0, MAX_ACTIONS),
      suggestions: (extra.suggestions ?? []).slice(0, MAX_SUGGESTIONS),
      needsContacts: extra.needsContacts ?? false,
    };
  }

  /**
   * Подписи первых тем базы знаний как готовые реплики-подсказки.
   *
   * Берутся по порядку из файла, а не случайно: ответ бота на один и тот же
   * вопрос должен быть одинаковым, включая подсказки.
   */
  private topicSuggestions(locale: Locale): string[] {
    const key = localeKey(locale);
    return STARTER_SUGGESTION_IDS.map((id) => CHAT_ENTRIES.find((entry) => entry.id === id))
      .filter((entry): entry is (typeof CHAT_ENTRIES)[number] => entry !== undefined)
      .slice(0, MAX_SUGGESTIONS)
      .map((entry) => entry.label[key]);
  }

  /**
   * Письмо и сообщение в Telegram менеджеру. Ошибка доставки не роняет
   * операцию: лид уже сохранён (правило модуля notifications).
   */
  private async notifyManager(input: {
    type: 'CHAT_LEAD' | 'CHAT_HANDOFF';
    locale: Locale;
    name: string;
    phone: string;
    email: string;
    question: string;
    sessionId: string;
  }): Promise<void> {
    const to = this.config.mail.managerEmail;
    if (to === '') {
      // Молча терять лид нельзя: если ящик менеджера не настроен, об этом
      // должно быть видно в логе, а не только в пустой папке «Входящие».
      this.logger.error(
        `MANAGER_EMAIL не задан: уведомление "${input.type}" по разговору ${input.sessionId} не отправлено`,
      );
      return;
    }

    const adminLink = `${this.config.appUrl}/admin/chat/${input.sessionId}`;
    const delivery =
      input.type === 'CHAT_LEAD'
        ? await this.notifications.send({
            type: 'CHAT_LEAD',
            to,
            locale: input.locale,
            name: input.name,
            phone: input.phone,
            email: input.email,
            question: input.question,
            adminLink,
          })
        : await this.notifications.send({
            type: 'CHAT_HANDOFF',
            to,
            locale: input.locale,
            name: input.name,
            phone: input.phone,
            question: input.question,
            adminLink,
          });

    if (!delivery.accepted) {
      this.logger.error(
        `уведомление "${input.type}" по разговору ${input.sessionId} не принял ни один канал`,
      );
    }
  }
}

/** Ответ бота как строка для записи в разговор. */
function botMessage(reply: ChatReply): NewMessage {
  return { role: 'BOT', text: truncate(reply.text), entryId: reply.entryId };
}

/** `Locale` — это `RU`/`HY`/`EN`, а ключи переводов строчные. */
function localeKey(locale: Locale): keyof Localized {
  return locale.toLowerCase() as keyof Localized;
}

function truncate(text: string): string {
  return text.length <= STORED_TEXT_LIMIT ? text : text.slice(0, STORED_TEXT_LIMIT);
}

function sessionNotFound(): AppException {
  return new AppException(404, ErrorCode.CHAT_SESSION_NOT_FOUND, 'Chat session not found');
}

/**
 * Проверка контактов. Все три поля разом, чтобы посетитель увидел сразу
 * все свои опечатки, а не исправлял их по одной.
 */
function validateContacts(contacts: { name: string; email: string; phone: string }): {
  name: string;
  email: string;
  phone: string;
} {
  const details: Array<{ field: string; code: string }> = [];

  const name = contacts.name.trim();
  if (name.length < 2 || name.length > 120) details.push({ field: 'name', code: 'INVALID' });

  const email = contacts.email.trim().toLowerCase();
  if (!EMAIL_RULE.test(email) || email.length > 254) {
    details.push({ field: 'email', code: 'INVALID' });
  }

  const phone = normalizeArmenianPhone(contacts.phone);
  if (phone === null) details.push({ field: 'phone', code: 'INVALID' });

  if (details.length > 0) {
    throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Invalid contact details', {
      details,
    });
  }

  return { name, email, phone: phone as string };
}

/**
 * Проверка адреса: один `@`, точка в домене, без пробелов.
 *
 * Полная RFC 5322 здесь не нужна и вредна — она пропускает адреса, которые
 * всё равно никуда не доедут. Единственный честный способ проверить почту —
 * письмо, а чат его не посылает.
 */
const EMAIL_RULE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Строка списка лидов из записи сессии. */
function toLeadRow(session: ChatSession, firstQuestion: string | null): ChatLeadRow {
  return {
    id: session.id,
    name: session.contactName,
    phone: session.contactPhone,
    email: session.contactEmail,
    locale: session.locale,
    firstQuestion,
    handoffRequested: session.handoffRequestedAt !== null,
    handled: session.handledAt !== null,
    lastMessageAt: session.lastMessageAt.toISOString(),
    createdAt: session.createdAt.toISOString(),
  };
}

function toMessageView(message: ChatMessage): ChatMessageView {
  return {
    id: message.id,
    role: message.role,
    text: message.text,
    entryId: message.entryId,
    createdAt: message.createdAt.toISOString(),
  };
}
