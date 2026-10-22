import { describe, expect, it } from 'vitest';
import { chatActionTarget } from '@/features/chat/actions';
import { chatContactsSchema, normalizeArmenianPhone } from '@/features/chat/contacts';
import { isPublicChatPath } from '@/features/chat/public-pages';

describe('нормализация телефона (CHAT.md §5.1)', () => {
  // Ровно три записи из контракта: все три должны дать один номер.
  it('приводит местную, международную и 00-запись к одному виду', () => {
    expect(normalizeArmenianPhone('099099457')).toBe('+37499099457');
    expect(normalizeArmenianPhone('+374 99 099 457')).toBe('+37499099457');
    expect(normalizeArmenianPhone('00374 99-09-94-57')).toBe('+37499099457');
  });

  it('отвергает слишком короткий номер и мусор', () => {
    expect(normalizeArmenianPhone('12345')).toBeNull();
    expect(normalizeArmenianPhone('не номер')).toBeNull();
    expect(normalizeArmenianPhone('+374 99 099 45')).toBeNull();
  });
});

describe('схема формы контактов', () => {
  it('принимает заполненные контакты', () => {
    const result = chatContactsSchema.safeParse({
      name: 'Ани',
      phone: '099 09 94 57',
      email: 'ani@example.am',
    });
    expect(result.success).toBe(true);
  });

  it('сообщения ошибок — ключи i18n, а не готовый текст', () => {
    const result = chatContactsSchema.safeParse({ name: 'А', phone: '12345', email: 'ani@' });
    expect(result.success).toBe(false);
    const messages = result.success ? [] : result.error.issues.map((issue) => issue.message);
    expect(messages).toContain('chat.contacts.validation.nameShort');
    expect(messages).toContain('chat.contacts.validation.phoneInvalid');
    expect(messages).toContain('chat.contacts.validation.emailInvalid');
  });
});

describe('назначение кнопок действий', () => {
  it('Instagram — внешняя ссылка, человек — запрос, остальное — маршруты', () => {
    expect(chatActionTarget('ESTIMATE')).toEqual({ kind: 'route', to: '/#calculator' });
    expect(chatActionTarget('REQUEST')).toEqual({ kind: 'route', to: '/requests/new' });
    expect(chatActionTarget('PORTFOLIO').kind).toBe('external');
    expect(chatActionTarget('CALL')).toEqual({ kind: 'tel', href: 'tel:+37499099457' });
    expect(chatActionTarget('HUMAN')).toEqual({ kind: 'handoff' });
  });
});

describe('где живёт виджет', () => {
  it('публичные страницы — да, кабинет и админка — нет', () => {
    expect(isPublicChatPath('/')).toBe(true);
    expect(isPublicChatPath('/estimate')).toBe(true);
    expect(isPublicChatPath('/login')).toBe(true);
    expect(isPublicChatPath('/cabinet')).toBe(false);
    expect(isPublicChatPath('/cabinet/requests/1')).toBe(false);
    expect(isPublicChatPath('/requests/new')).toBe(false);
    expect(isPublicChatPath('/admin')).toBe(false);
    expect(isPublicChatPath('/admin/chat/42')).toBe(false);
  });
});
