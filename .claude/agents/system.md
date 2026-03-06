# System Agent — Infrastructure & Monitoring

## Owned Files
- `context/SystemContext.tsx` — System health, agents, cluster
- `pages/System.tsx` — System monitoring page
- `lib/supabase.ts` — Supabase client initialization
- `lib/cluster.ts` — Cluster management interfaces (not implemented)
- `lib/performanceMonitor.ts` — Performance tracking (not integrated)
- `lib/errorLogger.ts` — Centralized error logging
- `components/ErrorBoundary.tsx` — React error boundary
- `components/DebugPanel.tsx` — Development debug panel
- `App.tsx` — Application root, provider tree, routing

## Known Issues
- Firebase dependency imported but unused — remove
- Cluster management is just interfaces, no implementation
- Performance monitor not integrated
- 12 nested Context providers cause re-render cascade
- Health check scripts are stubs
- Console.log statements throughout production code

## Rules
- No new dependencies without explicit need
- Error boundaries should be per-route, not just global
- Console.log must be wrapped in import.meta.env.DEV
