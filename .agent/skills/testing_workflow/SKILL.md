---
name: testing_workflow
description: Procedures for running and maintaining the test suite (Vitest).
---

# Testing Workflow Skill

Use this skill to run tests, add new test cases, and ensure system stability. The project uses **Vitest**.

## Running Tests

### Standard Commands
- **Run All Tests**: `npm test` (alias for `vitest run`)
- **Watch Mode**: `npm run test:watch`
- **Coverage**: `npm run test:coverage`

### Specialized Suites
- **Unit Tests**: `npm run test:unit`
- **Integration Tests**: `npm run test:integration`
- **E2E Tests**: `npm run test:e2e`
- **Security Tests**: `npm run test:security`
- **Performance Tests**: `npm run test:performance`

## Writing Tests

### Unit Tests
Place in `tests/` or alongside components (e.g., `Button.test.tsx`).

```tsx
import { render, screen } from '@testing-library/react';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent title="Test" />);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
});
```

### Integration Tests
Focus on interactions between components or hooks.

## Validation Workflow

When making changes:
1. Run relevant tests *before* changes to establish baseline.
2. Implement changes.
3. Run tests again to verify fix and ensure no regressions.
4. If adding new functionality, add new test cases.
