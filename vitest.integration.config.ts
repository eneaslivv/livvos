/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        name: 'integration',
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./tests/setup.ts'],
        include: [
            'tests/**/*.integration.test.{ts,tsx}',
        ],
        exclude: [
            'node_modules',
            'dist',
        ],
        testTimeout: 30000, // Integration tests may take longer
        hookTimeout: 30000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json'],
        },
    },
    resolve: {
        alias: {
            '@': '.',
        },
    },
});
