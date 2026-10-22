import type { Locale } from '@db/enums';
import { renderHtml, renderText, type EmailContent, type LayoutChrome } from './email-layout';
import type { NotificationEvent } from './public';

export interface RenderedMessage {
  subject: string;
  /** Запасной вариант для почтовиков без HTML. */
  text: string;
  html: string;
}

type Dictionary = Record<Locale, EmailContent>;

/**
 * Обвязка макета: одинакова для всех писем, но переводится, как и содержимое.
 */
const CHROME: Record<Locale, LayoutChrome> = {
  RU: {
    lang: 'ru',
    disclaimer:
      'Все суммы в письмах RenovateAM предварительные: точная стоимость определяется после замера.',
    ignore: 'Если вы не запрашивали это письмо, просто проигнорируйте его.',
    linkFallback: 'Если кнопка не открывается, скопируйте ссылку в адресную строку браузера:',
  },
  HY: {
    lang: 'hy',
    disclaimer:
      'RenovateAM-ի նամակներում նշված բոլոր գումարները նախնական են. ճշգրիտ արժեքը որոշվում է չափագրումից հետո:',
    ignore: 'Եթե դուք չեք պահանջել այս նամակը, պարզապես անտեսեք այն:',
    linkFallback: 'Եթե կոճակը չի բացվում, պատճենեք հղումը դիտարկիչի հասցեագոտում:',
  },
  EN: {
    lang: 'en',
    disclaimer:
      'All amounts in RenovateAM emails are preliminary: the exact price is set after the on-site survey.',
    ignore: 'If you did not request this email, simply ignore it.',
    linkFallback: 'If the button does not work, copy the link into your browser address bar:',
  },
};

/**
 * Шаблоны писем на трёх языках (US-8: переводятся в том числе письма).
 * Язык берётся из профиля пользователя (users.locale).
 *
 * Отдаются обе версии: `html` — свёрстанное письмо, `text` — то же содержимое
 * простым текстом для почтовиков, которые HTML не показывают. Разметку
 * собирает общий макет (email-layout.ts), шаблон описывает только содержимое,
 * а все подставляемые значения экранируются на входе в HTML.
 */
export function renderTemplate(event: NotificationEvent): RenderedMessage {
  const content = build(event)[event.locale];
  const chrome = CHROME[event.locale];
  return {
    subject: content.subject,
    text: renderText(content, chrome),
    html: renderHtml(content, chrome),
  };
}

function build(event: NotificationEvent): Dictionary {
  switch (event.type) {
    case 'EMAIL_VERIFICATION':
      return {
        RU: {
          subject: 'RenovateAM — подтвердите e-mail',
          heading: 'Подтвердите адрес',
          paragraphs: [
            'Подтвердите адрес, чтобы отправить заявку на расчёт.',
            'Ссылка действует 24 часа.',
          ],
          action: { label: 'Подтвердить e-mail', url: event.link },
        },
        HY: {
          subject: 'RenovateAM — հաստատեք ձեր էլ. հասցեն',
          heading: 'Հաստատեք հասցեն',
          paragraphs: ['Հաստատեք հասցեն՝ հայտ ուղարկելու համար:', 'Հղումը գործում է 24 ժամ:'],
          action: { label: 'Հաստատել էլ. հասցեն', url: event.link },
        },
        EN: {
          subject: 'RenovateAM — confirm your email',
          heading: 'Confirm your address',
          paragraphs: [
            'Confirm your address to submit a request.',
            'The link is valid for 24 hours.',
          ],
          action: { label: 'Confirm email', url: event.link },
        },
      };

    case 'PASSWORD_RESET':
      return {
        RU: {
          subject: 'RenovateAM — восстановление пароля',
          heading: 'Новый пароль',
          paragraphs: [
            'Вы запросили смену пароля в RenovateAM. Откройте ссылку и задайте новый пароль.',
            'Ссылка действует 60 минут и срабатывает один раз.',
            'Пароль не менялся, пока вы не задали новый. После смены придётся войти заново на всех устройствах.',
          ],
          action: { label: 'Задать новый пароль', url: event.link },
        },
        HY: {
          subject: 'RenovateAM — գաղտնաբառի վերականգնում',
          heading: 'Նոր գաղտնաբառ',
          paragraphs: [
            'Դուք պահանջել եք փոխել RenovateAM-ի գաղտնաբառը: Բացեք հղումը և սահմանեք նոր գաղտնաբառ:',
            'Հղումը գործում է 60 րոպե և աշխատում է միայն մեկ անգամ:',
            'Գաղտնաբառը չի փոխվել, քանի դեռ նորը չեք սահմանել: Փոխելուց հետո պետք է նորից մուտք գործել բոլոր սարքերում:',
          ],
          action: { label: 'Սահմանել նոր գաղտնաբառ', url: event.link },
        },
        EN: {
          subject: 'RenovateAM — password reset',
          heading: 'New password',
          paragraphs: [
            'You asked to change your RenovateAM password. Open the link and set a new one.',
            'The link is valid for 60 minutes and works once.',
            'Your password has not changed until you set a new one. After the change you will need to sign in again on every device.',
          ],
          action: { label: 'Set a new password', url: event.link },
        },
      };

    case 'REQUEST_SUBMITTED':
      return {
        RU: {
          subject: `RenovateAM — заявка №${event.requestNumber} принята`,
          heading: `Заявка №${event.requestNumber} принята`,
          paragraphs: [
            `Заявка №${event.requestNumber} принята в работу.`,
            'Сметчик подготовит смету в течение 2 рабочих дней.',
          ],
        },
        HY: {
          subject: `RenovateAM — հայտ №${event.requestNumber} ընդունված է`,
          heading: `Հայտ №${event.requestNumber} ընդունված է`,
          paragraphs: [
            `Հայտ №${event.requestNumber} ընդունված է:`,
            'Նախահաշիվը պատրաստ կլինի 2 աշխատանքային օրում:',
          ],
        },
        EN: {
          subject: `RenovateAM — request #${event.requestNumber} received`,
          heading: `Request #${event.requestNumber} received`,
          paragraphs: [
            `Request #${event.requestNumber} is in progress.`,
            'The quote will be ready within 2 business days.',
          ],
        },
      };

    case 'REQUEST_NEEDS_INFO':
      return {
        RU: {
          subject: `RenovateAM — по заявке №${event.requestNumber} нужны данные`,
          heading: `По заявке №${event.requestNumber} нужны данные`,
          paragraphs: [
            `Сметчику не хватает данных по заявке №${event.requestNumber}.`,
            `Комментарий: ${event.comment}`,
          ],
        },
        HY: {
          subject: `RenovateAM — №${event.requestNumber} հայտի համար լրացուցիչ տվյալներ են պետք`,
          heading: `№${event.requestNumber} հայտի համար լրացուցիչ տվյալներ են պետք`,
          paragraphs: [
            `Հայտ №${event.requestNumber}՝ պահանջվում են լրացուցիչ տվյալներ:`,
            `Մեկնաբանություն: ${event.comment}`,
          ],
        },
        EN: {
          subject: `RenovateAM — more data needed for request #${event.requestNumber}`,
          heading: `More data needed for request #${event.requestNumber}`,
          paragraphs: [
            `The estimator needs more data for request #${event.requestNumber}.`,
            `Comment: ${event.comment}`,
          ],
        },
      };

    case 'QUOTE_READY':
      return {
        RU: {
          subject: `RenovateAM — смета по заявке №${event.requestNumber} готова`,
          heading: `Смета по заявке №${event.requestNumber} готова`,
          paragraphs: [
            `Смета по заявке №${event.requestNumber} готова.`,
            'Откройте личный кабинет, чтобы посмотреть её и принять решение.',
          ],
        },
        HY: {
          subject: `RenovateAM — №${event.requestNumber} հայտի նախահաշիվը պատրաստ է`,
          heading: `№${event.requestNumber} հայտի նախահաշիվը պատրաստ է`,
          paragraphs: [
            `Հայտ №${event.requestNumber}-ի նախահաշիվը պատրաստ է:`,
            'Մուտք գործեք անձնական էջ՝ այն դիտելու և որոշում կայացնելու համար:',
          ],
        },
        EN: {
          subject: `RenovateAM — quote for request #${event.requestNumber} is ready`,
          heading: `Quote for request #${event.requestNumber} is ready`,
          paragraphs: [
            `The quote for request #${event.requestNumber} is ready.`,
            'Open your account to review and decide.',
          ],
        },
      };

    case 'REQUEST_COMMENT': {
      // Формулировка зависит от того, кто написал: клиенту приходит письмо
      // о сообщении сметчика, на общий ящик — о сообщении клиента.
      const author = event.byStaff;
      return {
        RU: {
          subject: `RenovateAM — новое сообщение по заявке №${event.requestNumber}`,
          heading: `Новое сообщение по заявке №${event.requestNumber}`,
          paragraphs: [
            author
              ? `Сметчик написал вам по заявке №${event.requestNumber}.`
              : `Клиент написал по заявке №${event.requestNumber}.`,
            event.comment,
            author
              ? 'Ответить можно в личном кабинете, в карточке заявки.'
              : 'Ответить можно в карточке заявки.',
          ],
        },
        HY: {
          subject: `RenovateAM — նոր հաղորդագրություն №${event.requestNumber} հայտի վերաբերյալ`,
          heading: `Նոր հաղորդագրություն №${event.requestNumber} հայտի վերաբերյալ`,
          paragraphs: [
            author
              ? `Նախահաշվարկողը գրել է ձեզ №${event.requestNumber} հայտի վերաբերյալ:`
              : `Հաճախորդը գրել է №${event.requestNumber} հայտի վերաբերյալ:`,
            event.comment,
            author
              ? 'Պատասխանել կարող եք անձնական էջում՝ հայտի քարտում:'
              : 'Պատասխանել կարող եք հայտի քարտում:',
          ],
        },
        EN: {
          subject: `RenovateAM — new message on request #${event.requestNumber}`,
          heading: `New message on request #${event.requestNumber}`,
          paragraphs: [
            author
              ? `The estimator wrote to you about request #${event.requestNumber}.`
              : `The client wrote about request #${event.requestNumber}.`,
            event.comment,
            author
              ? 'You can reply in your account, on the request card.'
              : 'You can reply on the request card.',
          ],
        },
      };
    }

    case 'DECISION_MADE': {
      const accepted = event.result === 'ACCEPTED';
      return {
        RU: {
          subject: `RenovateAM — заявка №${event.requestNumber}: ${accepted ? 'смета принята' : 'смета отклонена'}`,
          heading: `Заявка №${event.requestNumber}: ${accepted ? 'смета принята' : 'смета отклонена'}`,
          paragraphs: [
            `Клиент ${accepted ? 'принял' : 'отклонил'} смету по заявке №${event.requestNumber}.`,
          ],
        },
        HY: {
          subject: `RenovateAM — հայտ №${event.requestNumber}: ${accepted ? 'ընդունված' : 'մերժված'}`,
          heading: `Հայտ №${event.requestNumber}: ${accepted ? 'ընդունված' : 'մերժված'}`,
          paragraphs: [
            `Հաճախորդը ${accepted ? 'ընդունել' : 'մերժել'} է հայտ №${event.requestNumber}-ի նախահաշիվը:`,
          ],
        },
        EN: {
          subject: `RenovateAM — request #${event.requestNumber}: ${accepted ? 'quote accepted' : 'quote rejected'}`,
          heading: `Request #${event.requestNumber}: ${accepted ? 'quote accepted' : 'quote rejected'}`,
          paragraphs: [
            `The client has ${accepted ? 'accepted' : 'rejected'} the quote for request #${event.requestNumber}.`,
          ],
        },
      };
    }

    case 'CHAT_LEAD': {
      // Карточка лида, а не пересказ разговора: имя, телефон, почта, первый
      // вопрос и ссылка. Всё остальное менеджер прочитает в админке — письмо
      // нужно, чтобы он туда пошёл, а не чтобы заменить её собой.
      const card = (labels: ChatLabels): string[] => [
        `${labels.name}: ${event.name}`,
        `${labels.phone}: ${event.phone}`,
        `${labels.email}: ${event.email}`,
        event.question === '' ? labels.noQuestion : `${labels.question}: ${event.question}`,
      ];
      return {
        RU: {
          subject: 'RenovateAM — новый лид из чата',
          heading: 'Новый лид из чата',
          paragraphs: ['Посетитель оставил контакты в чате на сайте.', ...card(CHAT_LABELS.RU)],
          action: { label: 'Открыть разговор', url: event.adminLink },
        },
        HY: {
          subject: 'RenovateAM — նոր հայտ չատից',
          heading: 'Նոր հայտ չատից',
          paragraphs: ['Այցելուն թողել է իր կոնտակտները կայքի չատում:', ...card(CHAT_LABELS.HY)],
          action: { label: 'Բացել զրույցը', url: event.adminLink },
        },
        EN: {
          subject: 'RenovateAM — new chat lead',
          heading: 'New chat lead',
          paragraphs: [
            'A visitor left their contacts in the website chat.',
            ...card(CHAT_LABELS.EN),
          ],
          action: { label: 'Open the conversation', url: event.adminLink },
        },
      };
    }

    case 'CHAT_HANDOFF': {
      // Человека можно позвать и без контактов: тогда в письме честно сказано,
      // что звонить некуда, и единственный путь к посетителю — админка.
      const contacts = (labels: ChatLabels): string =>
        event.name === '' && event.phone === ''
          ? labels.noContacts
          : `${labels.name}: ${event.name === '' ? '—' : event.name}, ${labels.phone}: ${
              event.phone === '' ? '—' : event.phone
            }`;
      const body = (labels: ChatLabels): string[] => [
        labels.handoffLead,
        contacts(labels),
        event.question === '' ? labels.noQuestion : `${labels.question}: ${event.question}`,
      ];
      return {
        RU: {
          subject: 'RenovateAM — в чате просят человека',
          heading: 'В чате просят человека',
          paragraphs: body(CHAT_LABELS.RU),
          action: { label: 'Открыть разговор', url: event.adminLink },
        },
        HY: {
          subject: 'RenovateAM — չատում խնդրում են մասնագետի',
          heading: 'Չատում խնդրում են մասնագետի',
          paragraphs: body(CHAT_LABELS.HY),
          action: { label: 'Բացել զրույցը', url: event.adminLink },
        },
        EN: {
          subject: 'RenovateAM — a chat visitor asks for a human',
          heading: 'A chat visitor asks for a human',
          paragraphs: body(CHAT_LABELS.EN),
          action: { label: 'Open the conversation', url: event.adminLink },
        },
      };
    }
  }
}

/** Подписи полей карточки лида. Письмо менеджеру тоже переводится (US-8). */
interface ChatLabels {
  name: string;
  phone: string;
  email: string;
  question: string;
  noQuestion: string;
  noContacts: string;
  handoffLead: string;
}

const CHAT_LABELS: Record<Locale, ChatLabels> = {
  RU: {
    name: 'Имя',
    phone: 'Телефон',
    email: 'Почта',
    question: 'Спрашивал',
    noQuestion: 'Вопрос задать не успел',
    noContacts: 'Контакты посетитель не оставил — связаться можно только через чат',
    handoffLead: 'Посетитель чата просит живого человека.',
  },
  HY: {
    name: 'Անուն',
    phone: 'Հեռախոս',
    email: 'Էլ. փոստ',
    question: 'Հարցրել է',
    noQuestion: 'Հարց չի տրվել',
    noContacts: 'Այցելուն կոնտակտներ չի թողել — կապվել հնարավոր է միայն չատի միջոցով',
    handoffLead: 'Չատի այցելուն խնդրում է մասնագետի հետ խոսել:',
  },
  EN: {
    name: 'Name',
    phone: 'Phone',
    email: 'Email',
    question: 'Asked',
    noQuestion: 'No question was asked',
    noContacts: 'The visitor left no contacts — the chat is the only way back to them',
    handoffLead: 'A chat visitor is asking for a human.',
  },
};
