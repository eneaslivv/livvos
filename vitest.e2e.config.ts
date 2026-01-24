/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        name: 'e2e',
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./tests/setup.ts'],
        include: [
            'tests/**/*.e2e.test.{ts,tsx}',
            'tests/e2e/**/*.test.{ts,tsx}',
        ],
        exclude: [
            'node_modules',
            'dist',
        ],
        testTimeout: 60000, // E2E tests need more time
        hookTimeout: 60000,
        retry: 2, // Retry flaky e2e tests
        sequence: {
            shuffle: false, // E2E tests often depend on order
        },
    },
    resolve: {
        alias: {
            '@': '.',
        },
    },
});
