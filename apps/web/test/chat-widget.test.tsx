import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { installChatMock } from '@/features/chat/mock/chat-mock-server';
import type { ChatMockServer } from '@/features/chat/mock/chat-mock-server';
import { makeUser, renderWithProviders } from './render';

/**
 * Тесты виджета идут против мок-слоя (`chat-mock-server.ts`), а не против
 * подменённых компонентов: в разметке нет ни одной заглушки, подмена живёт
 * на границе сети и отвечает кодами из docs/CHAT.md §5.
 *
 * Паузы «бот печатает» настоящие (400–700 мс, §7.3), поэтому ожидания
 * заданы явными таймаутами, а не подкруткой часов: проверяется то же
 * поведение, что увидит посетитель.
 */
const WAIT = { timeout: 4000 };

/**
 * Закрывающая анимация из ChatWidget.tsx (`CLOSE_MS`, §7.1 п. 2). Панель
 * живёт в разметке ровно столько, поэтому «не закрылась» проверяется не
 * сразу после клика, а спустя заведомо больший срок.
 */
const CLOSE_ANIMATION_MS = 180;

let mock: { server: ChatMockServer; restore: () => void };

beforeEach(() => {
  window.sessionStorage.clear();
  mock = installChatMock();
});

afterEach(() => {
  mock.restore();
});

/** Открывает виджет и ждёт приветствие бота. */
async function openChat(): Promise<HTMLElement> {
  renderWithProviders(<App />);
  await userEvent.click(screen.getByRole('button', { name: 'Открыть чат с помощником' }));
  const panel = await screen.findByRole('dialog', { name: 'Помощник RenovateAM' });
  await screen.findByText(/Здравствуйте/, undefined, WAIT);
  return panel;
}

/** Задаёт первый вопрос и ждёт ответ бота. */
async function askFirstQuestion(text = 'Сколько стоит ремонт?'): Promise<void> {
  await userEvent.type(screen.getByLabelText('Ваш вопрос'), text);
  await userEvent.click(screen.getByRole('button', { name: 'Отправить' }));
  await screen.findByText(/считается от площади/, undefined, WAIT);
}

describe('виджет чата: открытие и закрытие', () => {
  it('на публичной странице кнопка есть', () => {
    renderWithProviders(<App />, { route: '/' });
    expect(screen.getByRole('button', { name: 'Открыть чат с помощником' })).toBeInTheDocument();
  });

  it('в админке кнопки нет', async () => {
    renderWithProviders(<App />, { route: '/admin', user: makeUser({ role: 'ESTIMATOR' }) });

    expect(await screen.findByRole('heading', { name: 'Очередь заявок' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Открыть чат с помощником' }),
    ).not.toBeInTheDocument();
  });

  it('в кабинете кнопки нет', () => {
    renderWithProviders(<App />, { route: '/cabinet', user: makeUser() });

    expect(
      screen.queryByRole('button', { name: 'Открыть чат с помощником' }),
    ).not.toBeInTheDocument();
    // Внутри заявки — тоже: у клиента там своё обсуждение (§7.3).
    renderWithProviders(<App />, { route: '/cabinet/requests/r1', user: makeUser() });
    expect(
      screen.queryByRole('button', { name: 'Открыть чат с помощником' }),
    ).not.toBeInTheDocument();
  });

  it('закрытый виджет не создаёт сессию и не шлёт запросов', () => {
    renderWithProviders(<App />);
    expect(mock.server.calls).toHaveLength(0);
    expect(window.sessionStorage.getItem('renovateam.chat.session')).toBeNull();
  });

  it('клик по затемнению вне панели НЕ закрывает чат', async () => {
    const panel = await openChat();

    const overlay = document.querySelector('.chat-overlay');
    expect(overlay).not.toBeNull();
    await userEvent.click(overlay as HTMLElement);

    /*
     * Проверяется состояние, а не только наличие панели в разметке: на время
     * закрывающей анимации (180 мс) панель остаётся в DOM, поэтому сразу
     * после клика её находит и `getByRole` — даже если закрытие началось.
     * `data-state` же переключается в тот же такт, что и само закрытие.
     */
    expect(panel).toHaveAttribute('data-state', 'open');

    // И через время, заведомо большее анимации, панель всё ещё открыта.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, CLOSE_ANIMATION_MS * 2));
    });
    expect(screen.getByRole('dialog', { name: 'Помощник RenovateAM' })).toHaveAttribute(
      'data-state',
      'open',
    );
  });

  it('клик по странице за пределами панели НЕ закрывает чат', async () => {
    const panel = await openChat();

    // Лендинг под виджетом остаётся рабочим: диалог не модальный. Клик по
    // его заголовку — это и есть «мимо панели».
    await userEvent.click(screen.getAllByRole('heading', { level: 1 })[0] as HTMLElement);
    expect(panel).toHaveAttribute('data-state', 'open');

    await userEvent.click(document.body);
    expect(panel).toHaveAttribute('data-state', 'open');

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, CLOSE_ANIMATION_MS * 2));
    });
    expect(screen.getByRole('dialog', { name: 'Помощник RenovateAM' })).toBeInTheDocument();
  });

  it('клик по × закрывает чат и возвращает фокус на кнопку', async () => {
    await openChat();

    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Помощник RenovateAM' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Открыть чат с помощником' })).toHaveFocus();
  });

  it('Escape закрывает чат', async () => {
    await openChat();

    await userEvent.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Помощник RenovateAM' })).not.toBeInTheDocument();
    });
  });

  it('разговор не теряется при повторном открытии', async () => {
    await openChat();
    await askFirstQuestion();

    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Помощник RenovateAM' })).not.toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Открыть чат с помощником' }));

    expect(await screen.findByText('Сколько стоит ремонт?')).toBeInTheDocument();
  });
});

describe('виджет чата: форма контактов', () => {
  it('появляется внутри ленты после первого ответа бота', async () => {
    await openChat();
    expect(screen.queryByText('Как с вами связаться?')).not.toBeInTheDocument();

    await askFirstQuestion();

    const title = await screen.findByText('Как с вами связаться?', undefined, WAIT);
    expect(title).toBeInTheDocument();
    // Форма — элемент ленты, а не отдельное модальное окно.
    expect(title.closest('ol.chat-messages')).not.toBeNull();
    expect(screen.getByLabelText('Имя')).toBeInTheDocument();
    expect(screen.getByLabelText('Телефон')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
  });

  it('ошибка телефона и почты показывается под своим полем', async () => {
    await openChat();
    await askFirstQuestion();
    await screen.findByText('Как с вами связаться?', undefined, WAIT);

    await userEvent.type(screen.getByLabelText('Имя'), 'Ани');
    await userEvent.type(screen.getByLabelText('Телефон'), '12345');
    await userEvent.type(screen.getByLabelText('E-mail'), 'ani@');
    await userEvent.click(screen.getByRole('button', { name: 'Продолжить разговор' }));

    const phoneError = await screen.findByText(/Не похоже на армянский номер/);
    const emailError = await screen.findByText(/Проверьте адрес/);

    const phone = screen.getByLabelText('Телефон');
    const email = screen.getByLabelText('E-mail');
    // «Под полем» — буквально: сообщение следует за полем и связано с ним.
    expect(phoneError.previousElementSibling).toBe(phone);
    expect(emailError.previousElementSibling).toBe(email);
    expect(phone).toHaveAttribute('aria-invalid', 'true');
    expect(phone.getAttribute('aria-describedby')).toContain(phoneError.id);
    expect(email.getAttribute('aria-describedby')).toContain(emailError.id);
    // Пока номер не исправлен, на сервер ничего не ушло.
    expect(mock.server.calls.some((call) => call.path.endsWith('/contacts'))).toBe(false);
  });

  it('верные контакты уходят нормализованными и форма исчезает', async () => {
    await openChat();
    await askFirstQuestion();
    await screen.findByText('Как с вами связаться?', undefined, WAIT);

    await userEvent.type(screen.getByLabelText('Имя'), 'Ани');
    await userEvent.type(screen.getByLabelText('Телефон'), '099 09 94 57');
    await userEvent.type(screen.getByLabelText('E-mail'), 'ani@example.am');
    await userEvent.click(screen.getByRole('button', { name: 'Продолжить разговор' }));

    await screen.findByText(/Спасибо! Записал/, undefined, WAIT);
    expect(screen.queryByText('Как с вами связаться?')).not.toBeInTheDocument();

    const call = mock.server.calls.find((item) => item.path.endsWith('/contacts'));
    expect(call?.body).toEqual({
      name: 'Ани',
      email: 'ani@example.am',
      phone: '+37499099457',
    });
  });
});

describe('виджет чата: отправка сообщения', () => {
  it('двойной клик по «Отправить» не отправляет сообщение дважды', async () => {
    await openChat();

    await userEvent.type(screen.getByLabelText('Ваш вопрос'), 'Сколько стоит ремонт?');
    // Именно двойной клик, а не два разнесённых: между нажатиями виджет
    // не успевает ничего дорисовать, и защита должна быть в нём самом.
    await userEvent.dblClick(screen.getByRole('button', { name: 'Отправить' }));

    /*
     * Ответ ещё в пути (пауза «печатает» — 400–700 мс), и на это время
     * разговор заперт признаком `busy`.
     *
     * Проверяется не только число запросов, но и само состояние запертости.
     * Причина честная: от двойной отправки виджет закрыт тремя слоями
     * (погасшая кнопка, пустое поле, `busy` в use-chat.ts), и снятие любого
     * одного из них в этой среде числа запросов не меняет — второй клик
     * уходит с уже очищенным полем. Запертость — единственный признак,
     * который краснеет от снятия самой блокировки, поэтому он здесь и есть.
     * «Отправить» гаснет и по пустому полю, а «позвать человека» — только
     * по `busy`: вот он и ловит потерю блокировки.
     */
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Позвать человека' })).toBeDisabled();

    await screen.findByText(/считается от площади/, undefined, WAIT);

    const sent = mock.server.calls.filter((call) => call.path.endsWith('/messages'));
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).toEqual({ text: 'Сколько стоит ремонт?' });
    // И в ленте вопрос один, а не два пузыря подряд.
    expect(screen.getAllByText('Сколько стоит ремонт?')).toHaveLength(1);
  });

  it('пустое поле отправить нельзя', async () => {
    await openChat();

    expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Ваш вопрос'), '   ');
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled();
    expect(mock.server.calls.some((call) => call.path.endsWith('/messages'))).toBe(false);
  });
});

describe('виджет чата: сессия и маскот', () => {
  it('404 от сервера молча начинает новую сессию, лента остаётся', async () => {
    // Снимок разговора из прошлой загрузки страницы: такой сессии на сервере нет.
    window.sessionStorage.setItem(
      'renovateam.chat.session',
      JSON.stringify({
        version: 1,
        sessionId: 'умершая-сессия',
        messages: [{ id: 'old', author: 'bot', text: 'Здравствуйте! Чем помочь?' }],
        needsContacts: false,
        contactsSaved: false,
      }),
    );

    renderWithProviders(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Открыть чат с помощником' }));
    expect(await screen.findByText('Здравствуйте! Чем помочь?')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Ваш вопрос'), 'Сколько стоит ремонт?');
    await userEvent.click(screen.getByRole('button', { name: 'Отправить' }));

    // Ответ пришёл, старая лента на месте, об ошибке посетителю не сказали.
    await screen.findByText(/считается от площади/, undefined, WAIT);
    expect(screen.getByText('Здравствуйте! Чем помочь?')).toBeInTheDocument();
    expect(screen.queryByText(/Разговор не найден/)).not.toBeInTheDocument();
    expect(mock.server.calls.filter((call) => call.path === '/chat/sessions')).toHaveLength(1);
  });

  it('маскот — инлайновый SVG, без картинок и эмодзи', async () => {
    const panel = await openChat();

    const mascots = panel.querySelectorAll('svg.chat-mascot');
    // Два: 96 px в приветствии и 32 px в шапке панели (§7.2).
    expect(mascots).toHaveLength(2);
    expect(panel.querySelectorAll('img')).toHaveLength(0);
    // 96 px в приветствии, 32 px в шапке — ровно размеры из §7.2.
    expect([...mascots].map((node) => node.getAttribute('width')).sort()).toEqual(['32', '96']);
    // Фирменные цвета: шампань в глазах и замковом камне, изумруд в визоре.
    expect(panel.innerHTML).toContain('#C9B183');
    expect(panel.innerHTML).toContain('#0E2B25');
  });

  it('в приветствии маскот живой, в шапке — статичный', async () => {
    const panel = await openChat();

    const greeting = panel.querySelector('.chat-greeting svg.chat-mascot');
    const header = panel.querySelector('.chat-panel-header svg.chat-mascot');
    expect(greeting).toHaveClass('chat-mascot-animated');
    // 32 px в шапке — статичный по §7.2: он соседствует с текстом заголовка,
    // и парящая фигура там отвлекала бы от чтения.
    expect(header).not.toHaveClass('chat-mascot-animated');
  });

  it('при prefers-reduced-motion маскот не анимируется', async () => {
    // Системная настройка «меньше движения». `matchMedia` в jsdom не
    // реализован, поэтому его подменяет сам тест (см. test/setup.ts).
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('prefers-reduced-motion'),
          media: query,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    );

    const panel = await openChat();

    const mascots = panel.querySelectorAll('svg.chat-mascot');
    expect(mascots).toHaveLength(2);
    for (const mascot of mascots) {
      // Ни одного правила движения: класса, за которым живут парение,
      // моргание и наклон, в разметке нет вовсе.
      expect(mascot).not.toHaveClass('chat-mascot-animated');
      // И такта моргания тоже: инлайновых переменных не осталось.
      expect(mascot.getAttribute('style')).toBeNull();
    }
    expect(panel.querySelectorAll('.chat-mascot-animated')).toHaveLength(0);
  });

  it('движение выключено и в стилях, а не только в разметке', () => {
    const css = readFileSync(resolve(__dirname, '../src/index.css'), 'utf8');

    // Общее правило гасит анимации всего документа…
    const reduce = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduce).toContain('animation: none !important');
    // …а панели и затемнению возвращает одну прозрачность (§7.1 п. 2):
    // ни подъёма, ни масштаба не остаётся.
    expect(reduce).toContain(".chat-panel[data-state='open']");
    expect(reduce).toContain('chat-fade-in');
    expect(reduce).toContain('transform: none !important');
  });
});

describe('виджет чата: жёсткие требования §7.1', () => {
  it('кнопка закреплена в правом нижнем углу с учётом safe-area', () => {
    const css = readFileSync(resolve(__dirname, '../src/index.css'), 'utf8');
    const block = css.slice(css.indexOf('.chat-launcher {'), css.indexOf('.chat-launcher:hover'));

    // п. 1: `fixed` — кнопка не двигается при скролле; отступы считаются
    // от safe-area, иначе на iPhone она попадает под домашнюю полоску.
    expect(block).toContain('position: fixed');
    expect(block).toContain('env(safe-area-inset-bottom');
    expect(block).toContain('env(safe-area-inset-right');
  });

  it('открытие 220 мс, закрытие 180 мс — прозрачность, подъём и масштаб', () => {
    const css = readFileSync(resolve(__dirname, '../src/index.css'), 'utf8');

    expect(css).toContain('animation: chat-panel-in 220ms');
    expect(css).toContain('animation: chat-panel-out 180ms');
    const frames = css.slice(css.indexOf('@keyframes chat-panel-in'));
    expect(frames).toContain('opacity: 0');
    expect(frames).toMatch(/translateY\([\d.]+px\) scale\([\d.]+\)/);
  });

  it('ниже 640 px панель на весь экран, поле ввода — от 44 px', () => {
    const css = readFileSync(resolve(__dirname, '../src/index.css'), 'utf8');
    const mobile = css.slice(css.indexOf('@media (max-width: 639px) {\n  .chat-panel'));

    expect(mobile).toContain('100dvh');
    // Высота считается по видимой области: экранная клавиатура iOS накрывает
    // окно, не меняя `dvh`, и без поправки поле ввода уходит под неё.
    expect(mobile).toContain('var(--chat-viewport-height');
    const input = css.slice(css.indexOf('.chat-input {'), css.indexOf('.chat-input::placeholder'));
    expect(input).toContain('min-height: 44px');
  });

  it('у кнопки закрытия и кнопок ленты цель нажатия не меньше 44 px', async () => {
    const panel = await openChat();

    const close = within(panel).getByRole('button', { name: 'Закрыть' });
    expect(close).toHaveClass('chat-close');

    const css = readFileSync(resolve(__dirname, '../src/index.css'), 'utf8');
    const block = css.slice(css.indexOf('.chat-close {'), css.indexOf('.chat-close:hover'));
    expect(block).toContain('height: 44px');
    expect(block).toContain('width: 44px');
    expect(css.slice(css.indexOf('.chat-human {'))).toContain('min-height: 44px');
  });
});
