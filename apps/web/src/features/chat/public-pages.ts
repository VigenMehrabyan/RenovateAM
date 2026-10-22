/**
 * Где виджет есть, а где его нет (docs/CHAT.md §7.3).
 *
 * Чат — инструмент для посетителя без регистрации: он живёт на публичных
 * страницах. В кабинете у клиента есть обсуждение внутри заявки, а в админке
 * чат мешал бы работе — там виджета нет.
 *
 * Список закрытых разделов повторяет защищённые маршруты в `App.tsx`.
 * Проверка идёт по префиксу пути, поэтому новая страница внутри кабинета или
 * админки не получит виджет случайно.
 */
const PRIVATE_PREFIXES = ['/cabinet', '/requests', '/admin'];

export function isPublicChatPath(pathname: string): boolean {
  return !PRIVATE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
