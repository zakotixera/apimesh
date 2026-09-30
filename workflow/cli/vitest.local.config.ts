import { defineConfig } from 'vitest/config';

// This suite uses only CLI-local code and synthetic fixtures, not the parent API corpus.
export default defineConfig({
  root: import.meta.dirname,
  test: { include: [
    'test/security-masker.test.ts',
    'test/extract-output.test.ts',
    'test/body-drift.test.ts',
    'test/body-capture.test.ts',
    'test/replay.test.ts',
    'test/commands.test.ts',
    'test/test-command.test.ts',
  ] },
});
