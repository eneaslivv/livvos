# DECISIONS.md — Architecture Decision Log

## Format

```
## DEC-XXX: Title
- **Date:** YYYY-MM-DD
- **Status:** Proposed | Accepted | Rejected | Superseded
- **Deciders:** [who decided]
- **Context:** [why this decision was needed]
- **Decision:** [what was decided]
- **Consequences:** [impact of decision]
```

---

## Decisions Log

### DEC-001: Agent-Based Architecture
- **Date:** 2024-XX-XX
- **Status:** Accepted
- **Deciders:** System Architect
- **Context:** Need autonomous system that respects domain boundaries
- **Decision:** Implement 12 specialized agents + 1 orchestrator
- **Consequences:** Clear ownership, but requires coordination protocol

### DEC-002: Read-Only Mode for Blocked Agents
- **Date:** 2024-XX-XX
- **Status:** Accepted
- **Deciders:** Core Guardian, Security Agent
- **Context:** Critical security issues exist (plain-text credentials, RLS gaps)
- **Decision:** Agents with blockers operate in read-only mode until resolved
- **Consequences:** Slower automation rollout, but safer

### DEC-003: Human Approval for Sensitive Operations
- **Date:** 2024-XX-XX
- **Status:** Accepted
- **Deciders:** Core Guardian
- **Context:** Need to prevent unintended destructive operations
- **Decision:** Require human approval for writes to security tables, bulk ops, cross-domain
- **Consequences:** Slower execution, higher safety

---

## Pending Decisions

See: `memory/pending-decisions.md`