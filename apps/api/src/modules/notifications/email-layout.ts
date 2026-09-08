/**
 * Общий макет письма. Все шаблоны собираются через него: разметка описана
 * один раз, шаблон отдаёт только содержимое.
 *
 * Правила почтовой вёрстки, от которых письмо не разваливается в Outlook,
 * Gmail и почтовиках Apple:
 *  · раскладка — вложенные таблицы, без flex/grid;
 *  · оформление — инлайновые стили; отдельный <style> держит только
 *    медиазапрос: классы в нём — единственный способ сузить поля на узком
 *    экране, инлайном это не выражается;
 *  · ширина 600 px через `max-width`, сама таблица тянется на 100 %;
 *  · ни внешних шрифтов, ни картинок — только системные гарнитуры и цвет;
 *  · действие — оформленная ссылка `<a>`, не `<button>` (кнопки в письмах
 *    не работают), и рядом сам адрес текстом: часть клиентов вырезает
 *    оформленные ссылки, и адрес должен остаться копируемым.
 */

/** Фирменные цвета (brand/README.md). */
const EMERALD = '#0E2B25';
const DEEP = '#0A1F1A';
const CHAMPAGNE = '#C9B183';
const LIGHT = '#EDF1EE';

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', 'Noto Sans Armenian', Arial, sans-serif";

/**
 * Экранирование ЛЮБОГО подставляемого значения. Комментарий сметчика и номер
 * заявки приходят из админки: без экранирования введённый текст попал бы
 * в письмо разметкой.
 */
export function escapeHtml(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Подписи обвязки макета — переводятся вместе с содержимым. */
export interface LayoutChrome {
  /** Код языка для атрибута `lang`. */
  lang: string;
  /** Оговорка о предварительном характере цен. */
  disclaimer: string;
  /** «Если вы не запрашивали это письмо, просто проигнорируйте его». */
  ignore: string;
  /** Подводка к продублированному текстом адресу. */
  linkFallback: string;
}

export interface EmailContent {
  subject: string;
  heading: string;
  /** Абзацы основного текста. Подставляются как есть — экранируются здесь. */
  paragraphs: string[];
  /** Действие: крупная ссылка-кнопка и продублированный текстом адрес. */
  action?: { label: string; url: string };
}

export function renderHtml(content: EmailContent, chrome: LayoutChrome): string {
  const paragraphs = content.paragraphs
    .map((paragraph, index) => {
      const last = index === content.paragraphs.length - 1 && !content.action;
      return `<p style="margin:0 0 ${last ? '0' : '16px'};font:400 16px/1.6 ${FONT};color:#10201C;">${escapeHtml(
        paragraph,
      ).replace(/\n/g, '<br />')}</p>`;
    })
    .join('');

  const action = content.action ? renderAction(content.action, chrome) : '';

  return `<!doctype html>
<html lang="${escapeHtml(chrome.lang)}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title>${escapeHtml(content.subject)}</title>
<style>
  @media only screen and (max-width: 620px) {
    .rn-pad { padding-left: 20px !important; padding-right: 20px !important; }
    .rn-action-table { width: 100% !important; }
    .rn-action { display: block !important; text-align: center !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${LIGHT};font-family:${FONT};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.heading)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:${LIGHT};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-collapse:collapse;">
        <tr>
          <td class="rn-pad" style="padding:24px 32px;background:${EMERALD};border-radius:16px 16px 0 0;">
            <span style="font:600 20px/1.2 ${FONT};letter-spacing:0.04em;color:${CHAMPAGNE};">RenovateAM</span>
          </td>
        </tr>
        <tr>
          <td class="rn-pad" style="padding:32px;background:#FFFFFF;">
            <h1 style="margin:0 0 16px;font:600 22px/1.3 ${FONT};color:${DEEP};">${escapeHtml(content.heading)}</h1>
            ${paragraphs}${action}
          </td>
        </tr>
        <tr>
          <td class="rn-pad" style="padding:20px 32px 28px;background:#F3F6F4;border-top:1px solid #DCE4E0;border-radius:0 0 16px 16px;">
            <p style="margin:0 0 8px;font:400 13px/1.5 ${FONT};color:#5F706A;">${escapeHtml(chrome.disclaimer)}</p>
            <p style="margin:0;font:400 13px/1.5 ${FONT};color:#5F706A;">${escapeHtml(chrome.ignore)}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function renderAction(action: NonNullable<EmailContent['action']>, chrome: LayoutChrome): string {
  const url = escapeHtml(action.url);
  return `<table role="presentation" class="rn-action-table" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;border-collapse:collapse;">
              <tr>
                <td align="center" style="border-radius:12px;background:${EMERALD};">
                  <a class="rn-action" href="${url}" style="display:inline-block;padding:14px 28px;font:600 16px/1.2 ${FONT};color:${LIGHT};text-decoration:none;border-radius:12px;">${escapeHtml(action.label)}</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 4px;font:400 13px/1.5 ${FONT};color:#5F706A;">${escapeHtml(chrome.linkFallback)}</p>
            <p style="margin:0;font:400 13px/1.5 ${FONT};color:${EMERALD};word-break:break-all;"><a href="${url}" style="color:${EMERALD};">${url}</a></p>`;
}

/** Текстовая версия того же содержимого — запасной вариант без HTML. */
export function renderText(content: EmailContent, chrome: LayoutChrome): string {
  const blocks = [...content.paragraphs];
  if (content.action) blocks.push(`${content.action.label}:\n${content.action.url}`);
  blocks.push(`${chrome.disclaimer}\n${chrome.ignore}`);
  return blocks.join('\n\n');
}
