/**
 * Фирменные носители. Все файлы берутся готовыми из `brand/` (скопированы
 * в `public/brand/`): логотип не пересобирается в разметке и не перерисовывается.
 *
 * Минимальные размеры соблюдены (brand/README.md): горизонтальный логотип —
 * не уже 205 px, отдельный знак — не ниже 24 px. На узких ширинах, где
 * надпись не помещается, показывается только знак — это штатный вариант.
 */
import { useTranslation } from 'react-i18next';

/** Логотип в шапку: знак на мобильной ширине, полная подпись с sm. */
export function HeaderLogo(): JSX.Element {
  const { t } = useTranslation();
  const alt = t('common.appName');
  return (
    <>
      {/* 36 px, а не 32: на 32 px и ниже пакет предписывает готовую
          упрощённую отрисовку (`favicon.svg`) — у `mark.svg` на этом кегле
          замыливается разрыв в вершине и камень слипается с дугами. */}
      <img
        src="/brand/mark.svg"
        alt={alt}
        className="h-9 w-auto sm:hidden"
        width={48}
        height={48}
      />
      <img
        src="/brand/logo-horizontal.svg"
        alt={alt}
        className="hidden h-9 w-auto sm:block"
        width={219}
        height={35}
      />
    </>
  );
}

/** Логотип на тёмной подложке — светлый моновариант из пакета. */
export function FooterLogo(): JSX.Element {
  const { t } = useTranslation();
  return (
    <img
      src="/brand/logo-mono-light.svg"
      alt={t('common.appName')}
      className="h-9 w-auto"
      width={219}
      height={35}
    />
  );
}

/**
 * Сборка арки — ведущий приём анимации героя.
 *
 * Геометрия взята из `brand/mark.svg` без изменений: те же три контура —
 * две половины кладки и замковый камень. Разбиение на группы нужно только
 * для того, чтобы половины выехали снизу, а камень опустился сверху и встал
 * в разрыв. Зазор в вершине при этом не закрывается: конечное состояние —
 * ровно исходный знак.
 *
 * Анимация одноразовая, идёт на загрузке и не задерживает ни строки текста:
 * блок декоративный и скрыт от программ чтения с экрана.
 */
export function ArchAssembly({
  className = '',
  stroke = '#E9EEEB',
}: {
  className?: string;
  stroke?: string;
}): JSX.Element {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
      role="presentation"
    >
      <g className="arch-leg">
        <path
          d="M11 43V23A13 13 0 0 1 19.13 10.947"
          fill="none"
          stroke={stroke}
          strokeWidth="3"
          strokeLinecap="butt"
        />
      </g>
      <g className="arch-leg arch-leg-right">
        <path
          d="M28.87 10.947A13 13 0 0 1 37 23V43"
          fill="none"
          stroke={stroke}
          strokeWidth="3"
          strokeLinecap="butt"
        />
      </g>
      <g className="arch-key">
        <path d="M19.7 7.8H28.3L27.4 12.9H20.6Z" fill="#C9B183" />
      </g>
    </svg>
  );
}

/**
 * Размерная линия чертежа: тонкая линия с засечками по краям. Прочерчивается
 * при появлении секции. Декоративная, из потока чтения исключена.
 */
export function DimensionLine({
  className = '',
  revealRef,
}: {
  className?: string;
  revealRef?: (node: SVGLineElement | null) => void;
}): JSX.Element {
  return (
    <svg
      viewBox="0 0 400 12"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
      focusable="false"
      role="presentation"
    >
      <line x1="1" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="1" />
      <line x1="399" y1="1" x2="399" y2="11" stroke="currentColor" strokeWidth="1" />
      <line
        ref={revealRef ?? null}
        className="dimension-line"
        x1="1"
        y1="6"
        x2="399"
        y2="6"
        stroke="currentColor"
        strokeWidth="1"
        style={{ ['--dim-length' as string]: '400' }}
      />
    </svg>
  );
}
