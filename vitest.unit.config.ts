/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        name: 'unit',
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./tests/setup.ts'],
        include: [
            'tests/**/*.test.{ts,tsx}',
            'lib/**/*.test.{ts,tsx}',
            'context/**/*.test.{ts,tsx}',
            'components/**/*.test.{ts,tsx}',
        ],
        exclude: [
            'node_modules',
            'dist',
            'tests/**/*.integration.test.{ts,tsx}',
            'tests/**/*.e2e.test.{ts,tsx}',
        ],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['lib/**', 'context/**', 'components/**'],
        },
    },
    resolve: {
        alias: {
            '@': '.',
        },
    },
});
