/**
 * Маскот виджета — инлайновый SVG, движение на CSS (docs/CHAT.md §7.2).
 *
 * Без растра, без Lottie, без сторонних зависимостей и без эмодзи вместо лица:
 * всё, что здесь есть, — три контура, одна заливка и три ключевых кадра
 * в `index.css` (`.chat-mascot-*`).
 *
 * Связь со знаком компании прямая и намеренная:
 *  · «антенна» заканчивается замковым камнем — тот же контур и те же
 *    пропорции, что в `brand/mark.svg` (широкая кромка сверху, узкая снизу);
 *  · глаза — две дуги, повторяющие вершину арки из знака.
 *
 * Палитра — фирменная: корпус `#EDF1EE`, визор `#0E2B25`, камень и глаза
 * `#C9B183`. Шампань здесь на глазах и на камне — это прямое требование
 * §7.2; правило пакета «золото только в замковом камне» касается логотипа,
 * а логотип маскот не подменяет и рядом с ним не ставится.
 *
 * Анимации: парение 3 с туда-обратно, моргание раз в 4–6 с со случайной
 * задержкой, лёгкий наклон при появлении. При `prefers-reduced-motion`
 * не остаётся ни одной, и выключение двойное — намеренно:
 *  · класс `chat-mascot-animated` не ставится вовсе, то есть в разметке нет
 *    ни одного правила, которое что-то двигало бы (это же состояние видит
 *    тест: он читает классы, а не вычисленный стиль, которого в jsdom нет);
 *  · общий медиазапрос в конце `index.css` гасит анимации всего документа.
 * Маскот становится статичным рисунком — ровно тот исход, который заказчик
 * предпочёл дёрганию.
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
  /** `true` — ни одной анимации: шапка панели (32 px, §7.2). */
  still = false,
  className = '',
}: {
  size?: number;
  still?: boolean;
  className?: string;
}): JSX.Element {
  const uid = useId().replace(/[^a-zA-Z0-9-]/g, '');
  const softId = `chat-mascot-soft-${uid}`;
  const glowId = `chat-mascot-glow-${uid}`;
  const groundId = `chat-mascot-ground-${uid}`;
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
        {/* Мягкая тень корпуса. Фильтр, а не слой-дубль: тень обязана
            повторять скругления корпуса, а не приближать их. */}
        <filter id={softId} x="-40%" y="-40%" width="180%" height="190%">
          <feDropShadow
            dx="0"
            dy="2.4"
            stdDeviation="2.2"
            floodColor="#0E2B25"
            floodOpacity="0.2"
          />
        </filter>
        {/* Свечение глаз: смещения нет, только размытие — это ореол, не тень. */}
        <filter id={glowId} x="-80%" y="-80%" width="260%" height="260%">
          <feDropShadow dx="0" dy="0" stdDeviation="1.6" floodColor="#C9B183" floodOpacity="0.85" />
        </filter>
        {/* Опора под фигурой: размывается, иначе на крупном размере
            она читается как отдельное тёмное пятно, а не как тень. */}
        <filter id={groundId} x="-60%" y="-200%" width="220%" height="500%">
          <feGaussianBlur stdDeviation="1.1" />
        </filter>
      </defs>

      <g className="chat-mascot-figure">
        <g className="chat-mascot-float">
          {/* Антенна с замковым камнем — деталь из знака компании. */}
          {/* Стойка заходит под камень: круглая кромка (strokeWidth 2 →
              +1 вверх) доводит её до y≈8, камень начинается с 8.1, и шва
              между ними не остаётся ни на 96 px, ни на 32 px. */}
          <path d="M32 16V9" stroke="#0E2B25" strokeWidth="2" strokeLinecap="round" />
          <path d="M27.7 3H36.3L35.4 8.1H28.6Z" fill="#C9B183" />

          {/* Корпус. */}
          <rect
            x="12"
            y="14"
            width="40"
            height="36"
            rx="14"
            fill="#EDF1EE"
            filter={`url(#${softId})`}
          />
          {/* Блик по верхней кромке — узкая полоса между кромкой корпуса
              (y = 14) и визором (y = 22). Весь блик лежит выше визора
              намеренно: визор рисуется следующим и закрыл бы собой всё,
              что заходит ниже y = 22, — блик обрывался бы на полуслове. */}
          <path
            d="M19.6 20.4A10.6 10.6 0 0 1 28.2 16.2h7.4"
            stroke="#FFFFFF"
            strokeOpacity="0.72"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
          />

          {/* Визор. */}
          <rect x="17" y="22" width="30" height="19" rx="9.5" fill="#0E2B25" />

          {/* Глаза — две дуги формы арки из знака. */}
          {/* Глаза — арка из знака: полукруглая вершина на коротких стойках.
              Вершина взята у знака буквально — там ширина арки 26 при радиусе
              13, то есть ровно полукруг; здесь хорда 7 при радиусе 3.5. Стойки
              укорочены до 1.8: у знака арка 26 × 33, и в такой пропорции глаз
              читался бы дверным проёмом, а не глазом. */}
          <g filter={`url(#${glowId})`}>
            <g className="chat-mascot-eyes">
              <path
                d="M21.5 35.8V34A3.5 3.5 0 0 1 28.5 34v1.8"
                stroke="#C9B183"
                strokeWidth="2.4"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M35.5 35.8V34A3.5 3.5 0 0 1 42.5 34v1.8"
                stroke="#C9B183"
                strokeWidth="2.4"
                strokeLinecap="round"
                fill="none"
              />
            </g>
          </g>
        </g>

        {/* Опора под корпусом: без неё парящая фигура выглядит обрезанной. */}
        <ellipse
          className="chat-mascot-shadow"
          cx="32"
          cy="54"
          rx="11.5"
          ry="2.2"
          fill="#0E2B25"
          filter={`url(#${groundId})`}
        />
      </g>
    </svg>
  );
}
