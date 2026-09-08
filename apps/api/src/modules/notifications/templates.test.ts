import { describe, expect, it } from 'vitest';
import type { Locale } from '@db/enums';
import { renderTemplate } from './templates';
import type { NotificationEvent } from './public';

const LOCALES: Locale[] = ['RU', 'HY', 'EN'];
const LINK = 'https://renovateam.am/verify?token=abc123';

/** По одному событию каждого типа — на одной локали. */
function events(locale: Locale): NotificationEvent[] {
  return [
    { type: 'EMAIL_VERIFICATION', to: 'client@example.com', locale, link: LINK },
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
