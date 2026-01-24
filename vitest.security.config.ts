/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        name: 'security',
        globals: true,
        environment: 'node', // Security tests often run in Node
        setupFiles: ['./tests/setup.ts'],
        include: [
            'tests/**/*.security.test.{ts,tsx}',
            'tests/security/**/*.test.{ts,tsx}',
            'tests/encryption.test.ts',
            'tests/rls-policies.test.ts',
        ],
        exclude: [
            'node_modules',
            'dist',
        ],
        testTimeout: 30000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['lib/encryption.ts', 'lib/auth.ts', 'context/SecurityContext.tsx', 'context/RBACContext.tsx'],
        },
    },
    resolve: {
        alias: {
            '@': '.',
        },
    },
});
