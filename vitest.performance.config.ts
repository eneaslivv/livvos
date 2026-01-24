/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        name: 'performance',
        globals: true,
        environment: 'node',
        setupFiles: ['./tests/setup.ts'],
        include: [
            'tests/**/*.performance.test.{ts,tsx}',
            'tests/**/*.perf.test.{ts,tsx}',
            'tests/performance/**/*.test.{ts,tsx}',
        ],
        exclude: [
            'node_modules',
            'dist',
        ],
        testTimeout: 120000, // Performance tests may take longer
        hookTimeout: 60000,
        pool: 'forks', // Use separate processes for isolation
        poolOptions: {
            forks: {
                singleFork: true, // Run sequentially for accurate measurements
            },
        },
    },
    resolve: {
        alias: {
            '@': '.',
        },
    },
});
