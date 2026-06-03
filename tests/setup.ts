import { vi, beforeAll, afterEach, afterAll } from 'vitest';
import '@testing-library/jest-dom';

const makeQuery = (table = '', result?: any) => {
    const baseResult = result || {
        data: table === 'pg_policies'
            ? [{ policydef: 'USING (tenant_id = current_user_tenant())' }]
            : [],
        error: null,
    };
    let inserted: any = null;
    let selectedEq: { column: string; value: any } | null = null;
    const resolveSingle = () => {
        if (inserted) {
            const row = Array.isArray(inserted) ? inserted[0] : inserted;
            return { data: { id: row.id || 'test-id', ...row }, error: null };
        }
        if (table === 'pg_proc') {
            return { data: { proname: selectedEq?.value }, error: null };
        }
        if (table === 'pg_indexes') {
            return { data: { indexname: selectedEq?.value }, error: null };
        }
        return { data: null, error: null };
    };
    const query: any = {
        select: vi.fn(() => query),
        insert: vi.fn((payload) => {
            inserted = payload;
            return query;
        }),
        upsert: vi.fn((payload) => {
            inserted = payload;
            return query;
        }),
        update: vi.fn(() => query),
        delete: vi.fn(() => query),
        eq: vi.fn((column, value) => {
            selectedEq = { column, value };
            return query;
        }),
        neq: vi.fn(() => query),
        in: vi.fn(() => query),
        gte: vi.fn(() => query),
        lte: vi.fn(() => query),
        lt: vi.fn(() => query),
        gt: vi.fn(() => query),
        is: vi.fn(() => query),
        not: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        single: vi.fn().mockImplementation(async () => resolveSingle()),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        then: (resolve: any, reject: any) => Promise.resolve(baseResult).then(resolve, reject),
        catch: (reject: any) => Promise.resolve(baseResult).catch(reject),
        finally: (handler: any) => Promise.resolve(baseResult).finally(handler),
    };
    return query;
};

// Mock Supabase client for testing
vi.mock('../lib/supabase', () => ({
    supabase: {
        auth: {
            getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
            getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
            onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
            signInWithPassword: vi.fn(),
            signOut: vi.fn(),
            signInAnonymously: vi.fn().mockResolvedValue({ data: {}, error: null }),
        },
        from: vi.fn((table: string) => makeQuery(table)),
        rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'unauthenticated' } }),
        channel: vi.fn().mockReturnValue({
            on: vi.fn().mockReturnThis(),
            subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
        }),
        removeChannel: vi.fn(),
    },
    supabaseAdmin: {},
    cleanupLocalStorage: vi.fn(),
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
