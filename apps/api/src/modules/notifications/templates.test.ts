import { describe, expect, it } from 'vitest';
import type { Locale } from '@db/enums';
import { renderTemplate } from './templates';
import type { NotificationEvent } from './public';

const LOCALES: Locale[] = ['RU', 'HY', 'EN'];
const LINK = 'https://renovateam.am/verify?token=abc123';
const RESET_LINK = 'https://renovateam.am/reset?token=abc123';
const ADMIN_LINK = 'https://renovateam.am/admin/chat/0b2f17c0-0000-4000-8000-000000000001';

/** По одному событию каждого типа — на одной локали. */
function events(locale: Locale): NotificationEvent[] {
  return [
    { type: 'EMAIL_VERIFICATION', to: 'client@example.com', locale, link: LINK },
    { type: 'PASSWORD_RESET', to: 'client@example.com', locale, link: RESET_LINK },
    { type: 'REQUEST_SUBMITTED', to: 'client@example.com', locale, requestNumber: 12 },
    {
      type: 'REQUEST_NEEDS_INFO',
      to: 'client@example.com',
      locale,
      requestNumber: 12,
      comment: 'План БТИ без масштаба',
    },
    { type: 'QUOTE_READY', to: 'client@example.com', locale, requestNumber: 12 },
    {
      type: 'DECISION_MADE',
      to: 'manager@example.com',
      locale,
      requestNumber: 12,
      result: 'ACCEPTED',
    },
    {
      type: 'REQUEST_COMMENT',
      to: 'client@example.com',
      locale,
      requestNumber: 12,
      byStaff: true,
      comment: 'Пришлите, пожалуйста, поэтажный план',
    },
    {
      type: 'REQUEST_COMMENT',
      to: 'manager@example.com',
      locale,
      requestNumber: 12,
      byStaff: false,
      comment: 'План прикладываю',
    },
    {
      type: 'CHAT_LEAD',
      to: 'manager@example.com',
      locale,
      name: 'Ани',
      phone: '+37499099457',
      email: 'ani@example.com',
      question: 'сколько стоит ремонт 60 м² под ключ',
      adminLink: ADMIN_LINK,
    },
    {
      type: 'CHAT_HANDOFF',
      to: 'manager@example.com',
      locale,
      name: 'Ани',
      phone: '+37499099457',
      question: 'хочу поговорить с человеком',
      adminLink: ADMIN_LINK,
    },
  ];
}

describe('шаблоны писем', () => {
  it('ссылка есть и в HTML, и в тексте', () => {
    for (const locale of LOCALES) {
      const message = renderTemplate({
        type: 'EMAIL_VERIFICATION',
        to: 'client@example.com',
        locale,
        link: LINK,
      });

      // В HTML — и кнопкой (href), и текстом рядом: часть почтовиков вырезает
      // оформленные ссылки, адрес должен остаться копируемым.
      expect(message.html).toContain(`href="${LINK}"`);
      expect(message.html.split(LINK).length - 1).toBeGreaterThanOrEqual(3);
      expect(message.text).toContain(LINK);
    }
  });

  it('письмо восстановления ведёт на /reset и называет срок жизни ссылки', () => {
    for (const [locale, ttl] of [
      ['RU', '60 минут'],
      ['HY', '60 րոպե'],
      ['EN', '60 minutes'],
    ] as const) {
      const message = renderTemplate({
        type: 'PASSWORD_RESET',
        to: 'client@example.com',
        locale,
        link: RESET_LINK,
      });

      expect(message.html).toContain(`href="${RESET_LINK}"`);
      expect(message.text).toContain(RESET_LINK);
      expect(message.text, `${locale} ttl`).toContain(ttl);
    }
  });

  it('подставляемые значения экранируются в HTML и остаются как есть в тексте', () => {
    const comment = 'Смета <script>alert("x")</script> & план "БТИ" от O\'Брайена';
    const message = renderTemplate({
      type: 'REQUEST_NEEDS_INFO',
      to: 'client@example.com',
      locale: 'RU',
      requestNumber: 7,
      comment,
    });

    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('&lt;script&gt;');
    expect(message.html).toContain('&amp;');
    expect(message.html).toContain('&quot;');
    expect(message.html).toContain('&#39;');
    // Текстовая версия — не разметка, экранировать в ней нечего.
    expect(message.text).toContain(comment);
  });

  it('текст сообщения из обсуждения попадает в письмо экранированным', () => {
    const comment = '<b>Срочно</b> & «план БТИ»';
    const message = renderTemplate({
      type: 'REQUEST_COMMENT',
      to: 'client@example.com',
      locale: 'RU',
      requestNumber: 12,
      byStaff: true,
      comment,
    });

    expect(message.html).not.toContain('<b>Срочно</b>');
    expect(message.html).toContain('&lt;b&gt;Срочно&lt;/b&gt;');
    expect(message.html).toContain('&amp;');
    expect(message.text).toContain(comment);
    expect(message.subject).toContain('№12');
  });

  it('ссылка не вырывается из атрибута href', () => {
    const message = renderTemplate({
      type: 'EMAIL_VERIFICATION',
      to: 'client@example.com',
      locale: 'RU',
      link: 'https://renovateam.am/verify?token="><img src=x onerror=alert(1)>',
    });

    expect(message.html).not.toContain('<img');
    expect(message.html).toContain('&quot;&gt;&lt;img');
  });

  it('письмо о лиде — карточка и ссылка в админку, а не пересказ разговора', () => {
    const message = renderTemplate({
      type: 'CHAT_LEAD',
      to: 'manager@example.com',
      locale: 'RU',
      name: 'Ани',
      phone: '+37499099457',
      email: 'ani@example.com',
      question: 'сколько стоит ремонт 60 м² под ключ',
      adminLink: ADMIN_LINK,
    });

    expect(message.text).toContain('Ани');
    expect(message.text).toContain('+37499099457');
    expect(message.text).toContain('ani@example.com');
    expect(message.text).toContain('сколько стоит ремонт 60 м² под ключ');
    expect(message.text).toContain(ADMIN_LINK);
    expect(message.html).toContain(`href="${ADMIN_LINK}"`);
  });

  it('человека позвали без контактов — письмо говорит об этом прямо', () => {
    const message = renderTemplate({
      type: 'CHAT_HANDOFF',
      to: 'manager@example.com',
      locale: 'RU',
      name: '',
      phone: '',
      question: '',
      adminLink: ADMIN_LINK,
    });

    expect(message.text).toContain('Контакты посетитель не оставил');
    expect(message.text).toContain('Вопрос задать не успел');
    // Единственный путь к посетителю — админка, и ссылка на неё обязана быть.
    expect(message.text).toContain(ADMIN_LINK);
  });

  it('имя и вопрос посетителя экранируются: это произвольный текст из чата', () => {
    const message = renderTemplate({
      type: 'CHAT_LEAD',
      to: 'manager@example.com',
      locale: 'RU',
      name: '<b>Ани</b>',
      phone: '+37499099457',
      email: 'ani@example.com',
      question: '<script>alert("x")</script>',
      adminLink: ADMIN_LINK,
    });

    expect(message.html).not.toContain('<script>');
    expect(message.html).not.toContain('<b>Ани</b>');
    expect(message.html).toContain('&lt;script&gt;');
  });

  it('для всех локалей и типов событий заполнены subject, text и html', () => {
    for (const locale of LOCALES) {
      for (const event of events(locale)) {
        const message = renderTemplate(event);

        expect(message.subject.trim().length, `${locale}/${event.type} subject`).toBeGreaterThan(0);
        expect(message.text.trim().length, `${locale}/${event.type} text`).toBeGreaterThan(0);
        expect(message.html.trim().length, `${locale}/${event.type} html`).toBeGreaterThan(0);
      }
    }
  });

  it('во всех письмах — общий макет: шапка, оговорка о ценах и просьба игнорировать', () => {
    for (const locale of LOCALES) {
      for (const event of events(locale)) {
        const { html, text } = renderTemplate(event);

        expect(html.startsWith('<!doctype html>')).toBe(true);
        expect(html).toContain('>RenovateAM<');
        expect(html).toContain('max-width:600px');
        // Цены предварительные + «если вы не запрашивали это письмо» — в обеих версиях.
        for (const line of [DISCLAIMER[locale], IGNORE[locale]]) {
          expect(html, `${locale}/${event.type} html`).toContain(line);
          expect(text, `${locale}/${event.type} text`).toContain(line);
        }
      }
    }
  });

  it('вёрстка почтовая: таблицы и инлайновые стили, без флексбокса, шрифтов и картинок', () => {
    const { html } = renderTemplate({
      type: 'EMAIL_VERIFICATION',
      to: 'client@example.com',
      locale: 'RU',
      link: LINK,
    });

    expect(html).toContain('<table role="presentation"');
    expect(html).not.toMatch(/display:\s*(flex|grid)/);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<button');
    expect(html).not.toMatch(/@font-face|fonts\.googleapis|https?:\/\/[^"']*\.(?:woff|css)/);
    // Действие — оформленная ссылка.
    expect(html).toMatch(/<a class="rn-action" href=/);
  });
});

const DISCLAIMER: Record<Locale, string> = {
  RU: 'предварительные',
  HY: 'նախնական',
  EN: 'preliminary',
};

const IGNORE: Record<Locale, string> = {
  RU: 'просто проигнорируйте его',
  HY: 'պարզապես անտեսեք այն',
  EN: 'simply ignore it',
};
