// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Lint rules for the whole repository.
 *
 * Source files are linted with type information from both TypeScript projects,
 * so promises nobody awaits are caught. Tests use the rules that need no types,
 * because they sit outside both projects. Formatting is Prettier's job, so every
 * rule that would argue with it is switched off last.
 */
export default tseslint.config(
  {
    ignores: [
      'dist/',
      'node_modules/',
      'coverage/',
      'test-results/',
      'playwright-report/',
      'blob-report/',
      'config/',
      'data/',
      'tests/e2e/.work/',
      'tests/e2e/.data/',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      // A leading underscore marks a parameter a callback's signature requires but the body does not use.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-expect-error': 'allow-with-description' }],
    },
  },

  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.client.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Every promise is awaited, returned, or deliberately discarded with `void`.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { arguments: false, attributes: false } },
      ],
    },
  },

  {
    // The core imports nothing from the outside world (CODING_STANDARDS.md §1).
    files: ['src/domain/**/*.ts', 'src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/infrastructure/**', '**/presentation/**'],
              message: 'The core must not depend on an outer layer.',
            },
            {
              group: ['@modelcontextprotocol/*', 'express', 'zod', 'yaml', 'pino'],
              message: 'The core must not depend on an SDK or a library at the boundary.',
            },
            { group: ['node:*'], message: 'The core has no I/O; take what you need through a port.' },
          ],
        },
      ],
    },
  },

  {
    files: ['src/presentation/web/client/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },

  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { globals: globals.node },
  },

  prettier,
);
