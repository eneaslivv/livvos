# RULES.md — Operational Rules for eneas-os Agents

## CORE PRINCIPLES

### 1. Stability Over Speed
- No changes without analysis
- No writes without validation
- No automation without testing
- Analyze → Plan → Approve → Execute

### 2. Tenant Isolation is Sacred
- Every query MUST include tenant_id filter
- No cross-tenant data access under ANY circumstance
- RLS policies are the last line of defense, not the first
- Code must enforce isolation even if RLS fails

### 3. RBAC is Non-Negotiable
- All actions MUST pass permission checks
- UI gating is convenience, not security
- Server-side validation is mandatory
- Never trust client-side permission checks alone

### 4. Human Approval Required For
- Any write to security tables (roles, permissions)
- Bulk data modifications (>10 records)
- Cross-domain operations
- Schema changes
- Credential access
- Irreversible operations

### 5. Audit Everything
- All agent actions are logged
- All decisions are recorded
- All errors are tracked
- Audit logs are immutable

---

## FORBIDDEN ACTIONS (ALL AGENTS)

- [ ] Direct database access bypassing RLS
- [ ] Modifying tenant_id on any record
- [ ] Accessing data from other tenants
- [ ] Storing credentials in plain text
- [ ] Deleting audit logs
- [ ] Disabling RLS policies
- [ ] Auto-retrying failed write operations
- [ ] Executing without tenant context

---

## ESCALATION PROTOCOL

### Escalate to Core Guardian When:
1. Cross-domain operation required
2. Confidence below 80%
3. Conflicting business rules detected
4. Security concern identified
5. Unknown data state encountered

### Escalate to Human When:
1. Critical security decision
2. Data loss risk
3. Irreversible operation
4. Business rule ambiguity
5. Core Guardian uncertainty

---

## ERROR HANDLING

### On Error
1. Log error with full context
2. Do NOT retry automatically for writes
3. Notify appropriate agent/human
4. Preserve system state
5. Report to memory/known-bugs.md if new

### On Unknown State
1. Stop processing immediately
2. Log state snapshot
3. Escalate to Core Guardian
4. Wait for resolution
5. Do not assume or invent data

---

## CHANGE MANAGEMENT

### Before Any Code Change
1. Document current state
2. Identify affected components
3. Assess risk level (LOW/MEDIUM/HIGH/CRITICAL)
4. Get approval if required
5. Write tests first

### After Any Code Change
1. Run affected tests
2. Verify no regression
3. Update documentation
4. Log the change in DECISIONS.md
5. Update memory files if needed

---

## AGENT COMMUNICATION RULES

1. Agents communicate through Core Guardian for cross-domain
2. Same-domain operations can be direct
3. All cross-domain operations are logged
4. Approval requests go through notification system
5. Results are always returned to caller