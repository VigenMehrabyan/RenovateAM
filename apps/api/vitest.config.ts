import { resolve } from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/** Те же псевдонимы путей, что в tsconfig.json. */
const alias = [
  { find: /^@common\/(.*)$/, replacement: resolve(__dirname, 'src/common/$1') },
  { find: /^@modules\/(.*)$/, replacement: resolve(__dirname, 'src/modules/$1') },
  { find: /^@config$/, replacement: resolve(__dirname, 'src/config/configuration') },
  { find: /^@db\/(.*)$/, replacement: resolve(__dirname, 'src/generated/prisma/$1') },
  { find: /^@db$/, replacement: resolve(__dirname, 'src/generated/prisma/client') },
  {
    find: /^@renovateam\/pricing-core$/,
    replacement: resolve(__dirname, '../../packages/pricing-core/src/index.ts'),
  },
];

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: { alias },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globals: false,
    setupFiles: ['./test/setup-env.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
