import type { Locale } from '@db/enums';
import type { NotificationEvent } from './public';

export interface RenderedMessage {
  subject: string;
  text: string;
}

type Dictionary = Record<Locale, RenderedMessage>;

/**
 * Шаблоны писем на трёх языках (US-8: переводятся в том числе письма).
 * Язык берётся из профиля пользователя (users.locale).
 */
export function renderTemplate(event: NotificationEvent): RenderedMessage {
  const dictionary = build(event);
  return dictionary[event.locale];
}

function build(event: NotificationEvent): Dictionary {
  switch (event.type) {
    case 'EMAIL_VERIFICATION':
      return {
        RU: {
          subject: 'RenovateAM — подтвердите e-mail',
          text: `Подтвердите адрес, чтобы отправить заявку на расчёт:\n${event.link}\n\nСсылка действует 24 часа.`,
        },
        HY: {
          subject: 'RenovateAM — հաստատեք ձեր էլ. հասցեն',
          text: `Հաստատեք հասցեն՝ հայտ ուղարկելու համար:\n${event.link}\n\nՀղումը գործում է 24 ժամ:`,
        },
        EN: {
          subject: 'RenovateAM — confirm your email',
          text: `Confirm your address to submit a request:\n${event.link}\n\nThe link is valid for 24 hours.`,
        },
      };

    case 'REQUEST_SUBMITTED':
      return {
        RU: {
          subject: `RenovateAM — заявка №${event.requestNumber} принята`,
          text: `Заявка №${event.requestNumber} принята в работу. Сметчик подготовит смету в течение 2 рабочих дней.`,
        },
        HY: {
          subject: `RenovateAM — հայտ №${event.requestNumber} ընդունված է`,
          text: `Հայտ №${event.requestNumber} ընդունված է: Նախահաշիվը պատրաստ կլինի 2 աշխատանքային օրում:`,
        },
        EN: {
          subject: `RenovateAM — request #${event.requestNumber} received`,
          text: `Request #${event.requestNumber} is in progress. The quote will be ready within 2 business days.`,
        },
      };

    case 'REQUEST_NEEDS_INFO':
      return {
        RU: {
          subject: `RenovateAM — по заявке №${event.requestNumber} нужны данные`,
          text: `Сметчику не хватает данных по заявке №${event.requestNumber}.\n\nКомментарий: ${event.comment}`,
        },
        HY: {
          subject: `RenovateAM — №${event.requestNumber} հայտի համար լրացուցիչ տվյալներ են պետք`,
          text: `Հայտ №${event.requestNumber}՝ պահանջվում են լրացուցիչ տվյալներ:\n\nՄեկնաբանություն: ${event.comment}`,
        },
        EN: {
          subject: `RenovateAM — more data needed for request #${event.requestNumber}`,
          text: `The estimator needs more data for request #${event.requestNumber}.\n\nComment: ${event.comment}`,
        },
      };

    case 'QUOTE_READY':
      return {
        RU: {
          subject: `RenovateAM — смета по заявке №${event.requestNumber} готова`,
          text: `Смета по заявке №${event.requestNumber} готова. Откройте личный кабинет, чтобы посмотреть её и принять решение.`,
        },
        HY: {
          subject: `RenovateAM — №${event.requestNumber} հայտի նախահաշիվը պատրաստ է`,
          text: `Հայտ №${event.requestNumber}-ի նախահաշիվը պատրաստ է: Մուտք գործեք անձնական էջ:`,
        },
        EN: {
          subject: `RenovateAM — quote for request #${event.requestNumber} is ready`,
          text: `The quote for request #${event.requestNumber} is ready. Open your account to review and decide.`,
        },
      };

    case 'DECISION_MADE': {
      const accepted = event.result === 'ACCEPTED';
      return {
        RU: {
          subject: `RenovateAM — заявка №${event.requestNumber}: ${accepted ? 'смета принята' : 'смета отклонена'}`,
          text: `Клиент ${accepted ? 'принял' : 'отклонил'} смету по заявке №${event.requestNumber}.`,
        },
        HY: {
          subject: `RenovateAM — հայտ №${event.requestNumber}: ${accepted ? 'ընդունված' : 'մերժված'}`,
          text: `Հաճախորդը ${accepted ? 'ընդունել' : 'մերժել'} է հայտ №${event.requestNumber}-ի նախահաշիվը:`,
        },
        EN: {
          subject: `RenovateAM — request #${event.requestNumber}: ${accepted ? 'quote accepted' : 'quote rejected'}`,
          text: `The client has ${accepted ? 'accepted' : 'rejected'} the quote for request #${event.requestNumber}.`,
        },
      };
    }
  }
}
