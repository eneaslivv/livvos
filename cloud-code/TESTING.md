# TESTING.md — Testing Requirements

## Philosophy

> No feature is complete without tests.
> No agent is trusted without validation.
> No deployment without green tests.

---

## Test Categories

### 1. Unit Tests
- Individual agent methods
- Tool functions
- Validation logic
- Utility helpers

### 2. Integration Tests
- Agent + Supabase interactions
- Cross-agent communication
- Workflow end-to-end

### 3. Isolation Tests (CRITICAL)
- Tenant isolation verification
- RBAC enforcement
- RLS policy validation

### 4. Regression Tests
- Known bug scenarios
- Fixed issue verification
- Edge cases

---

## Coverage Requirements

| Category | Minimum |
|----------|---------|
| Agent Core Logic | 90% |
| Tools/Utilities | 85% |
| Workflows | 80% |
| API Endpoints | 85% |
| Security Functions | 95% |

---

## Critical Test Cases

### Tenant Isolation (MUST PASS)
```
TEST-ISO-001: Query with tenant_id=A must not return tenant_id=B data
TEST-ISO-002: Insert without tenant_id must fail or inject correct tenant
TEST-ISO-003: Update cannot change tenant_id
TEST-ISO-004: Cross-tenant join must fail
TEST-ISO-005: RLS policy blocks unauthorized access
```

### RBAC Enforcement (MUST PASS)
```
TEST-RBAC-001: User without 'write' permission cannot insert
TEST-RBAC-002: User without 'admin' role cannot modify roles
TEST-RBAC-003: Permission check uses server validation
TEST-RBAC-004: Role assignment respects tenant boundary
TEST-RBAC-005: Owner role has full access within tenant
```

### Data Integrity (MUST PASS)
```
TEST-INT-001: Foreign key constraints are enforced
TEST-INT-002: Required fields cannot be null
TEST-INT-003: Enum fields only accept valid values
TEST-INT-004: Timestamps are auto-managed
TEST-INT-005: Soft delete preserves data
```

---

## Test Data Management

### Fixtures
- Isolated test tenant: `test-tenant-000`
- Isolated test user: `test-user-000`
- Clean up after each test
- Never use production data

### Mocking
- Mock external services (email, AI)
- Mock time-dependent functions
- Use deterministic random seeds

---

## Test Execution Commands

```bash
# Unit tests
pytest tests/unit/ -v

# Integration tests
pytest tests/integration/ -v

# Isolation tests (critical)
pytest tests/isolation/ -v --tenant-id=test-tenant

# Full suite with coverage
pytest tests/ -v --cov=agents --cov=tools --cov-report=html

# Security-specific
pytest tests/security/ -v --strict
```