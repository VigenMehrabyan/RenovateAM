/**
 * Открытие подписанных ссылок (сметы и файлы заявки).
 *
 * Ссылка выдаётся отдельным запросом и живёт 15 минут (ARCHITECTURE §5.4),
 * поэтому к моменту ответа жест пользователя уже «потрачен»: вызванный после
 * await `window.open` браузеры считают всплывающим окном и блокируют — кнопка
 * «Скачать» выглядит нажатой и не делает ничего. Поэтому вкладка открывается
 * синхронно, ещё в обработчике клика, а адрес подставляется, когда придёт.
 */
export async function openSignedUrl(load: () => Promise<{ url: string }>): Promise<void> {
  // `noopener` здесь нельзя: с ним window.open по спецификации возвращает null
  // и подставить адрес будет некуда. Связь с открывшей страницей рвём вручную.
  const target = window.open('about:blank', '_blank');
  if (target) target.opener = null;

  try {
    const { url } = await load();
    if (target) target.location.href = url;
    else window.location.assign(url);
  } catch (error) {
    target?.close();
    throw error;
  }
}
