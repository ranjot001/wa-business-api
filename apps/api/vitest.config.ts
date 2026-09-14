import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: './',
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
  },
  plugins: [
    // Nest relies on decorator metadata, which esbuild does not emit.
    swc.vite({ module: { type: 'es6' } }),
  ],
});
