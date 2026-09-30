import { defineConfig } from 'vitest/config';

// Run focused CLI checks; the full suite also checks schemas and the compiled workflow.
export default defineConfig({
  root: import.meta.dirname,
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/schemas.test.ts', 'test/workflow.test.ts'],
  },
});
