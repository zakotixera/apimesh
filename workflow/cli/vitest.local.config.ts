import { defineConfig } from 'vitest/config';

// Run CLI tests with synthetic fixtures; the full suite also checks repository schemas.
export default defineConfig({
  root: import.meta.dirname,
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/schemas.test.ts'],
  },
});
