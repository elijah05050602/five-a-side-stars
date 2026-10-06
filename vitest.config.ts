import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/__tests__/setup.ts'],
    environment: 'node',
    // Several tests play whole matches, which takes a few seconds on a busy CI machine.
    testTimeout: 30_000,
  },
});
