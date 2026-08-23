// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Границы модулей держатся на механических правилах (docs/ARCHITECTURE.md §2.1):
 *  1. чужой модуль доступен только через `@modules/<name>/public`
 *     (исключение — импорт самого NestJS-модуля `@modules/<name>/<name>.module`
 *     для сборки графа зависимостей: он не даёт доступа к внутренностям);
 *  2. кросс-модульные относительные импорты запрещены в принципе;
 *  3. рантайм Prisma-клиента доступен только файлам `*.repository.ts` —
 *     модуль физически не может прочитать чужую таблицу.
 *
 * Владение таблицами дополнительно проверяет scripts/check-module-boundaries.mjs.
 */
const FOREIGN_MODULE = {
  group: ['@modules/*/!(public|*.module)', '@modules/*/!(public)/**'],
  message: 'Чужой модуль доступен только через @modules/<name>/public.',
};

const PRIVATE_INTERNALS = {
  group: ['@modules/*/*.repository', '@modules/*/*.service'],
  message: 'Репозиторий и внутренний сервис приватны для своего модуля.',
};

const CROSS_MODULE_RELATIVE = {
  group: ['../../**', '../*/*'],
  message:
    'Кросс-модульные импорты — только через @modules/<name>/public, общее — через @common/*.',
};

/** Точное совпадение «@db»: перечисления «@db/enums» — общий словарь домена и разрешены. */
const PRISMA_CLIENT = {
  name: '@db',
  message: 'Рантайм Prisma-клиента доступен только *.repository.ts (одна таблица — один владелец).',
  allowTypeImports: true,
};

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'apps/api/src/generated/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  // --- Никто не лезет внутрь чужого модуля ------------------------------------
  {
    files: ['apps/api/src/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: [FOREIGN_MODULE, PRIVATE_INTERNALS] },
      ],
    },
  },
  // --- Модуль не выходит за свои границы относительными путями ----------------
  // и не трогает Prisma-клиент нигде, кроме собственного репозитория.
  {
    files: ['apps/api/src/modules/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [PRISMA_CLIENT],
          patterns: [FOREIGN_MODULE, PRIVATE_INTERNALS, CROSS_MODULE_RELATIVE],
        },
      ],
    },
  },
  {
    files: ['apps/api/src/modules/**/*.repository.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: [FOREIGN_MODULE, PRIVATE_INTERNALS, CROSS_MODULE_RELATIVE] },
      ],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts', 'apps/api/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.mjs', '**/*.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
