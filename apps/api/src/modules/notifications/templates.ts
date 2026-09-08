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
  }
}
