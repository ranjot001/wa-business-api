import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Shared flat config preset. Each package re-exports this from its own
 * eslint.config.js and appends package specific overrides.
 */
export const ignores = {
  ignores: [
    '**/node_modules/**',
    '**/dist/**',
    '**/.next/**',
    '**/coverage/**',
    '**/*.d.ts',
    '**/generated/**',
  ],
};

export const base = [
  ignores,
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
    },
  },
  prettier,
];

export default base;
