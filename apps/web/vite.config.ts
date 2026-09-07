/// <reference types="vitest" />
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwindConfig from './tailwind.config';

/**
 * Псевдонимы совпадают с tsconfig.json. `pricing-core` резолвится на исходники:
 * один и тот же движок расчёта попадает в бандл клиента без шага сборки пакета.
 */
export default defineConfig({
  plugins: [react()],
  css: {
    postcss: {
      plugins: [
        tailwindcss({
          ...tailwindConfig,
          content: [resolve(__dirname, 'index.html'), resolve(__dirname, 'src/**/*.{ts,tsx}')],
        }),
        autoprefixer(),
      ],
    },
  },
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: resolve(__dirname, 'src/$1') },
      {
        find: /^@renovateam\/pricing-core$/,
        replacement: resolve(__dirname, '../../packages/pricing-core/src/index.ts'),
      },
    ],
  },
  server: { port: 5173, host: '0.0.0.0', allowedHosts: ['terminal.local'] },
  build: { outDir: 'dist', sourcemap: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.test.ts', 'test/**/*.test.tsx'],
    css: false,
  },
});
