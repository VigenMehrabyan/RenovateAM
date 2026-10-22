/**
 * Маскот виджета — инлайновый SVG, движение на CSS (docs/CHAT.md §7.2).
 *
 * Без растра, без Lottie, без сторонних зависимостей и без эмодзи вместо лица:
 * фигура собрана из контуров и градиентов, движение — ключевые кадры в
 * `index.css` (`.chat-mascot-*`).
 *
 * Связь со знаком компании прямая и намеренная:
 *  · «антенна» заканчивается замковым камнем — тот же контур и те же
 *    пропорции, что в `brand/mark.svg` (широкая кромка сверху, узкая снизу);
 *  · глаза — две дуги, повторяющие вершину арки из знака;
 *  · боковые накладки — изумруд `accent-500`, цвет стоек арки.
 *
 * Палитра фирменная: корпус `#EDF1EE` со светотенью от белого к `ink-200`,
 * визор `#0E2B25`, камень и глаза `#C9B183`.
 *
 * Объём даётся градиентами, а не слоями теней: источник света сверху слева,
 * один и тот же для корпуса, визора и накладок. Поэтому фигура читается
 * объёмной и на 96 px, и на 32 px, где любая мелкая деталь схлопнулась бы.
 *
 * Анимации: парение 3 с туда-обратно, моргание раз в 4–6 с со случайной
 * задержкой, лёгкий наклон при появлении. Моргание — веко: полоса цвета
 * визора проходит сверху вниз по глазам и возвращается. Сжатие самих дуг
 * выглядело бы мерцанием, а не морганием.
 *
 * При `prefers-reduced-motion` не остаётся ни одной анимации, и выключение
 * двойное — намеренно:
 *  · класс `chat-mascot-animated` не ставится вовсе, то есть в разметке нет
 *    ни одного правила, которое что-то двигало бы (это же состояние видит
 *    тест: он читает классы, а не вычисленный стиль, которого в jsdom нет);
 *  · общий медиазапрос в конце `index.css` гасит анимации всего документа.
 *
 * Знак декоративный: смысл несёт текст приветствия рядом, поэтому
 * для программ чтения маскот скрыт.
 */
import { useId, useState } from 'react';
import type { CSSProperties } from 'react';
import { prefersReducedMotion } from '@/lib/motion';

/** Случайный, но стабильный для экземпляра такт моргания: 4–6 с. */
function useBlinkRhythm(): { period: string; delay: string } {
  const [rhythm] = useState(() => ({
    period: `${(4 + Math.random() * 2).toFixed(2)}s`,
    delay: `${(Math.random() * 2.5).toFixed(2)}s`,
  }));
  return rhythm;
}

export function ChatMascot({
  size = 96,
  /** `true` — ни одной анимации и без опорной тени: шапка панели (32 px, §7.2). */
  still = false,
  className = '',
}: {
  size?: number;
  still?: boolean;
  className?: string;
}): JSX.Element {
  const uid = useId().replace(/[^a-zA-Z0-9-]/g, '');
  const bodyId = `chat-mascot-body-${uid}`;
  const visorId = `chat-mascot-visor-${uid}`;
  const earId = `chat-mascot-ear-${uid}`;
  const softId = `chat-mascot-soft-${uid}`;
  const glowId = `chat-mascot-glow-${uid}`;
  const groundId = `chat-mascot-ground-${uid}`;
  const visorClipId = `chat-mascot-visor-clip-${uid}`;
  const blink = useBlinkRhythm();
  // Настройка читается при отрисовке, а не в эффекте: иначе маскот успел бы
  // один раз дёрнуться наклоном до того, как движение выключат.
  const animated = !still && !prefersReducedMotion();

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={`chat-mascot ${animated ? 'chat-mascot-animated' : ''} ${className}`}
      style={
        animated
          ? ({
              ['--mascot-blink-period' as string]: blink.period,
              ['--mascot-blink-delay' as string]: blink.delay,
            } as CSSProperties)
          : undefined
      }
      aria-hidden="true"
      focusable="false"
      role="presentation"
    >
      <defs>
        {/* Светотень корпуса: источник сверху слева, один на всю фигуру. */}
        <linearGradient id={bodyId} x1="20%" y1="0%" x2="76%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="52%" stopColor="#EDF1EE" />
          <stop offset="100%" stopColor="#CFDAD4" />
        </linearGradient>
        {/* Визор: стекло светлее сверху, глубже у нижней кромки. */}
        <linearGradient id={visorId} x1="24%" y1="0%" x2="72%" y2="100%">
          <stop offset="0%" stopColor="#1C4A40" />
          <stop offset="58%" stopColor="#0E2B25" />
          <stop offset="100%" stopColor="#081B17" />
        </linearGradient>
        {/* Боковые накладки — тот же изумруд, но с собственной светотенью. */}
        <linearGradient id={earId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3D6459" />
          <stop offset="100%" stopColor="#0E2B25" />
        </linearGradient>
        {/* Мягкая тень корпуса. Фильтр, а не слой-дубль: тень обязана
            повторять скругления корпуса, а не приближать их. */}
        <filter id={softId} x="-40%" y="-40%" width="180%" height="190%">
          <feDropShadow dx="0" dy="2.2" stdDeviation="2" floodColor="#0E2B25" floodOpacity="0.22" />
        </filter>
        {/* Свечение глаз: смещения нет, только размытие — это ореол, не тень. */}
        <filter id={glowId} x="-80%" y="-80%" width="260%" height="260%">
          <feDropShadow dx="0" dy="0" stdDeviation="1.4" floodColor="#C9B183" floodOpacity="0.9" />
        </filter>
        {/* Опора под фигурой: размывается, иначе на крупном размере
            она читается как отдельное тёмное пятно, а не как тень. */}
        <filter id={groundId} x="-60%" y="-200%" width="220%" height="500%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
        {/* Веко и блик живут только внутри визора. */}
        <clipPath id={visorClipId}>
          <rect x="16.5" y="22" width="31" height="19.5" rx="9.75" />
        </clipPath>
      </defs>

      <g className="chat-mascot-figure">
        <g className="chat-mascot-float">
          {/* Антенна с замковым камнем — деталь из знака компании.
              Стойка короткая и толстая: тонкая на 32 px исчезает, и камень
              повисает в воздухе сам по себе. */}
          <path d="M32 17.5V10.2" stroke="#0E2B25" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M28.2 5.4H35.8L35 10.6H29Z" fill="#C9B183" />

          {/* Боковые накладки — за корпусом, видны только края. */}
          <rect x="7.6" y="27" width="6.4" height="13" rx="3.2" fill={`url(#${earId})`} />
          <rect x="50" y="27" width="6.4" height="13" rx="3.2" fill={`url(#${earId})`} />

          {/* Корпус. */}
          <rect
            x="11.5"
            y="15"
            width="41"
            height="36"
            rx="15"
            fill={`url(#${bodyId})`}
            filter={`url(#${softId})`}
          />
          {/* Блик по верхней кромке — узкая полоса между кромкой корпуса
              (y = 15) и визором (y = 22). Весь блик лежит выше визора
              намеренно: визор рисуется следующим и закрыл бы собой всё,
              что заходит ниже y = 22, — блик обрывался бы на полуслове. */}
          <path
            d="M19 20.8A11 11 0 0 1 28 17.4h8.5"
            stroke="#FFFFFF"
            strokeOpacity="0.8"
            strokeWidth="1.6"
            strokeLinecap="round"
            fill="none"
          />

          {/* Визор. */}
          <rect x="16.5" y="22" width="31" height="19.5" rx="9.75" fill={`url(#${visorId})`} />

          <g clipPath={`url(#${visorClipId})`}>
            {/* Отражение на стекле: широкая дуга по верхнему краю визора. */}
            <path
              d="M18.5 28.5A11 11 0 0 1 30.5 23.2h12"
              stroke="#FFFFFF"
              strokeOpacity="0.14"
              strokeWidth="3.2"
              strokeLinecap="round"
              fill="none"
            />

            {/* Глаза — арка из знака: полукруглая вершина на коротких стойках.
                Вершина взята у знака буквально — там ширина арки 26 при радиусе
                13, то есть ровно полукруг; здесь хорда 7 при радиусе 3.5. Стойки
                укорочены: у знака арка 26 × 33, и в такой пропорции глаз
                читался бы дверным проёмом, а не глазом. */}
            <g filter={`url(#${glowId})`}>
              <path
                d="M21.6 35.4V33.6A3.5 3.5 0 0 1 28.6 33.6v1.8"
                stroke="#C9B183"
                strokeWidth="2.5"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M35.4 35.4V33.6A3.5 3.5 0 0 1 42.4 33.6v1.8"
                stroke="#C9B183"
                strokeWidth="2.5"
                strokeLinecap="round"
                fill="none"
              />
            </g>

            {/* Веко: полоса цвета визора проходит по глазам сверху вниз и
                возвращается. Выше визора она не видна — её держит clipPath. */}
            <rect
              className="chat-mascot-lid"
              x="16.5"
              y="22"
              width="31"
              height="19.5"
              fill={`url(#${visorId})`}
            />
          </g>
        </g>

        {/* Опора под корпусом: без неё парящая фигура выглядит обрезанной.
            В шапке её нет — на 32 px размытый эллипс превращается в пятно. */}
        {!still && (
          <ellipse
            className="chat-mascot-shadow"
            cx="32"
            cy="55.5"
            rx="12"
            ry="2.2"
            fill="#0E2B25"
            filter={`url(#${groundId})`}
          />
        )}
      </g>
    </svg>
  );
}
