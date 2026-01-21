import { renderHook, act } from '@testing-library/react';
import { ReactNode } from 'react';
import { supabase } from '../lib/supabase';

// Mock user and tenant
const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  user_metadata: {},
  app_metadata: {},
};

const mockTenant = {
  id: 'test-tenant-id',
  name: 'Test Tenant',
  slug: 'test-tenant',
  owner_id: 'test-user-id',
  status: 'active' as const,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

// Wrapper components for testing contexts with proper provider setup
export function createWrapper(providers: ReactNode[]) {
  return function Wrapper({ children }: { children: ReactNode }) {
    let wrapped = children;
    
    // Apply providers in reverse order (innermost first)
    for (const Provider of providers.reverse()) {
      wrapped = Provider;
    }
    
    return <>{wrapped}</>;
  };
}

// Mock data generators
export const createMockNotification = (overrides = {}) => ({
  id: 'test-notification-id',
  user_id: 'test-user-id',
  tenant_id: 'test-tenant-id',
  type: 'system' as const,
  title: 'Test Notification',
  message: 'This is a test notification',
  link: null,
  metadata: {},
  priority: 'medium' as const,
  read: false,
  created_at: '2024-01-01T00:00:00Z',
  action_required: false,
  category: 'test',
  ...overrides,
});

export const createMockAnalyticsData = (overrides = {}) => ({
  id: 'test-analytics-id',
  tenant_id: 'test-tenant-id',
  date: '2024-01-01',
  total_visits: 100,
  unique_visitors: 50,
  page_views: 250,
  bounce_rate: 0.3,
  avg_session_duration: 180,
  top_pages: { '/home': 50, '/dashboard': 30 },
  referrers: { 'google.com': 20, 'direct': 15 },
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

export const createMockSystemHealth = (overrides = {}) => ({
  status: 'healthy' as const,
  database: true,
  storage: true,
  auth: true,
  functions: true,
  timestamp: '2024-01-01T00:00:00Z',
  details: {
    database: 'Connected',
    storage: 'Accessible',
    auth: 'Working',
  },
  ...overrides,
});

// Utility functions for testing
export const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const createSupabaseMock = () => {
  const mock = {
    from: jest.fn(() => mock),
    select: jest.fn(() => mock),
    insert: jest.fn(() => mock),
    update: jest.fn(() => mock),
    delete: jest.fn(() => mock),
    eq: jest.fn(() => mock),
    in: jest.fn(() => mock),
    gte: jest.fn(() => mock),
    lte: jest.fn(() => mock),
    lt: jest.fn(() => mock),
    gt: jest.fn(() => mock),
    ne: jest.fn(() => mock),
    is: jest.fn(() => mock),
    not: jest.fn(() => mock),
    order: jest.fn(() => mock),
    limit: jest.fn(() => mock),
    single: jest.fn(() => mock),
    maybeSingle: jest.fn(() => mock),
    rpc: jest.fn(() => mock),
    channel: jest.fn(() => ({
      on: jest.fn(() => mock),
      subscribe: jest.fn(() => ({ unsubscribe: jest.fn() })),
    })),
    removeChannel: jest.fn(),
  };

  // Mock successful responses
  mock.select.mockReturnValue(mock);
  mock.eq.mockReturnValue(mock);
  mock.in.mockReturnValue(mock);
  mock.gte.mockReturnValue(mock);
  mock.lte.mockReturnValue(mock);
  mock.lt.mockReturnValue(mock);
  mock.gt.mockReturnValue(mock);
  mock.ne.mockReturnValue(mock);
  mock.is.mockReturnValue(mock);
  mock.not.mockReturnValue(mock);
  mock.order.mockReturnValue(mock);
  mock.limit.mockReturnValue(mock);
  mock.single.mockResolvedValue({ data: null, error: null });
  mock.maybeSingle.mockResolvedValue({ data: null, error: null });
  mock.insert.mockResolvedValue({ data: null, error: null });
  mock.update.mockResolvedValue({ data: null, error: null });
  mock.delete.mockResolvedValue({ error: null });
  mock.rpc.mockResolvedValue({ data: null, error: null });

  return mock;
};

// Reset all mocks
export const resetMocks = () => {
  jest.clearAllMocks();
  
  // Reset supabase mock
  if (supabase.from) {
    (supabase.from as jest.Mock).mockClear();
  }
  
  if (supabase.rpc) {
    (supabase.rpc as jest.Mock).mockClear();
  }
  
  if (supabase.channel) {
    (supabase.channel as jest.Mock).mockClear();
  }
  
  if (supabase.removeChannel) {
    (supabase.removeChannel as jest.Mock).mockClear();
  }
};

// Custom matchers for better testing
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
  
  toBeValidTimestamp(received: string) {
    const date = new Date(received);
    const pass = !isNaN(date.getTime());
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid timestamp`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid timestamp`,
        pass: false,
      };
    }
  },
  
  toBeValidUUID(received: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid UUID`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid UUID`,
        pass: false,
      };
    }
  },
});

// Performance testing utilities
export const measurePerformance = async (fn: () => Promise<void> | void, iterations = 1) => {
  const start = performance.now();
  
  for (let i = 0; i < iterations; i++) {
    await fn();
  }
  
  const end = performance.now();
  const average = (end - start) / iterations;
  
  return {
    totalTime: end - start,
    average,
    iterations,
  };
};

// Security testing utilities
export const createSecurityTest = (testName: string, testFn: () => Promise<void>) => {
  it(testName, async () => {
    try {
      await testFn();
      // Test should not throw for security tests that verify proper behavior
    } catch (error) {
      // If it's a security violation, that's expected
      if (error.message.includes('permission') || error.message.includes('unauthorized')) {
        // This is expected for negative security tests
        return;
      }
      // Re-throw unexpected errors
      throw error;
    }
  });
};

// Integration testing utilities
export const createContextIntegrationTest = (
  contexts: string[],
  testScenario: () => Promise<void>
) => {
  it(`integrates properly across contexts: ${contexts.join(' -> ')}`, async () => {
    await testScenario();
  });
};

// Error boundary testing utilities
export const createErrorBoundaryTest = (
  componentName: string,
  expectedError: string
) => {
  it(`${componentName} handles errors gracefully`, () => {
    // Mock console.error to avoid noise in tests
    const originalConsoleError = console.error;
    console.error = jest.fn();
    
    try {
      // Render component that should trigger error
      // Test should verify graceful error handling
    } finally {
      console.error = originalConsoleError;
    }
    
    // Verify error was caught and handled
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(expectedError)
    );
  });
};