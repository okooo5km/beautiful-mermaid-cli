import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    passWithNoTests: false,
    // Build dist/ once before any test file runs. Several test files spawn
    // dist/cli.js in parallel and would otherwise race on a fresh checkout.
    globalSetup: ['./tests/global-setup.ts'],
  },
});
