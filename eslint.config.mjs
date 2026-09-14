import { base } from '@crm/config/eslint';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/*.d.ts',
      'apps/web/.next/**',
      'packages/db/prisma/migrations/**',
    ],
  },
  ...base,
  {
    // Nest resolves constructor dependencies from emitted decorator metadata,
    // which disappears if a provider is imported with `import type`.
    files: ['apps/api/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    files: ['**/*.config.js', '**/*.config.mjs', '**/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-undef': 'off',
    },
  },
];
