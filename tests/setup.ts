import { vi, beforeAll, afterEach, afterAll } from 'vitest';
import '@testing-library/jest-dom';

// Mock Supabase client for testing
vi.mock('../lib/supabase', () => ({
    supabase: {
        auth: {
            getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
            onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
            signInWithPassword: vi.fn(),
            signOut: vi.fn(),
        },
        from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: null, error: null }),
                    order: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
            update: vi.fn().mockResolvedValue({ data: null, error: null }),
            delete: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
        channel: vi.fn().mockReturnValue({
            on: vi.fn().mockReturnThis(),
            subscribe: vi.fn(),
        }),
    },
    default: {},
}));

// Mock crypto for encryption tests
vi.mock('crypto', async () => {
    const actual = await vi.importActual('crypto');
    return {
        ...actual,
    };
});

// Global test configuration
beforeAll(() => {
    // Setup any global test state
});

afterEach(() => {
    // Clean up after each test
    vi.clearAllMocks();
});

afterAll(() => {
    // Cleanup after all tests
    vi.restoreAllMocks();
});

// Custom matchers or utilities can be added here
export { };
