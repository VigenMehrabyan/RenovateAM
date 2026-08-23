import type { Config } from 'tailwindcss';

/**
 * Токены оформления. Тёмной темы в MVP нет, но ни один цвет не берётся
 * из дефолтной палитры Tailwind: продукт про деньги, оттенки должны быть
 * зафиксированы явно.
 *
 * База — прохладный нейтральный с синим уклоном (`ink`), акцент — чертёжный
 * синий (`accent`), семантика вынесена отдельно от акцента: янтарный —
 * «нужен ручной расчёт», зелёный — принято, приглушённый красный — отклонено.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f5f7fa',
          100: '#eaeef4',
          200: '#d5dde8',
          300: '#b3c1d4',
          400: '#8496b0',
          500: '#5d6f8b',
          600: '#46566e',
          700: '#354256',
          800: '#232d3c',
          900: '#151c26',
        },
        accent: {
          50: '#eef4fb',
          100: '#d7e6f6',
          200: '#adcbec',
          300: '#7aabdf',
          400: '#4685c6',
          500: '#1b5fa6',
          600: '#164e8a',
          700: '#123e6e',
          800: '#0e2f54',
          900: '#0a2140',
        },
        amber: {
          50: '#fdf6e7',
          100: '#f9e7bd',
          500: '#a8710a',
          600: '#8a5c06',
          700: '#6b4705',
        },
        success: {
          50: '#eaf5ee',
          100: '#c9e6d4',
          500: '#1f7a45',
          600: '#186237',
        },
        danger: {
          50: '#fbeeee',
          100: '#f3d2d2',
          500: '#9d3535',
          600: '#822b2b',
        },
      },
      fontFamily: {
        sans: ['var(--font-ui)', 'system-ui', 'sans-serif'],
        mono: ['"Noto Sans Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '2px',
        DEFAULT: '3px',
        md: '4px',
        lg: '6px',
      },
      maxWidth: {
        prose: '68ch',
      },
    },
  },
  plugins: [],
} satisfies Config;
