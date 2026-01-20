# Eneas-OS Agent Skills System

A comprehensive skill template system for autonomous agents in the eneas-os multi-tenant SaaS platform. This system provides standardized, reusable skill templates that agents can load and execute to perform specific operational tasks.

## Overview

The skills system is designed to support the eneas-os agent architecture with:

- **Domain-specific agents** (auth, tenant, security, project, CRM, finance, calendar, document, team, analytics)
- **Standardized skill templates** with consistent structure
- **Cross-agent communication** protocols
- **Comprehensive error handling** and recovery
- **Security validation** and tenant isolation
- **Performance monitoring** and optimization

## Quick Start

### Using the CLI

```bash
# List all available skills
skill list

# Filter by priority
skill list --priority CRITICAL

# Get detailed information about a skill
skill info table-creation-with-rls

# Execute a skill (dry run first)
skill load table-creation-with-rls --agent security-agent --dry-run

# Execute the skill
skill load table-creation-with-rls --agent security-agent

# Check execution status
skill status

# View execution history
skill history --agent security-agent

# Show system metadata
skill metadata
```

### Programmatic Usage

```typescript
import { skillLoader } from './skills/loader';

// List available skills
const skills = await skillLoader.listSkills();

// Execute a skill
const result = await skillLoader.executeSkill(
  'table-creation-with-rls',
  'security-agent'
);

console.log(`Skill executed: ${result.success}`);
```

## Skill Categories

### 🔴 Critical Skills
Immediate action required for system security and stability:

- **table-creation-with-rls** - Create database tables with comprehensive Row Level Security
- **rls-policy-implementation** - Implement comprehensive RLS policies with tenant isolation
- **credential-encryption-implementation** - Encrypt sensitive credentials with secure key management
- **tenant-isolation-verification** - Verify complete tenant isolation across all systems

### 🔶 High Priority Skills
Important for core functionality and compliance:

- **data-migration-between-tables** - Safely migrate data between tables with validation
- **lead-status-transition-management** - Implement lead status transitions with validation
- **project-financial-calculation** - Implement comprehensive project financial calculations

### 🟡 Medium Priority Skills
Normal priority for feature development and maintenance:

- **document-storage-management** - Implement folder hierarchy and versioning for documents
- **calendar-event-scheduling** - Implement conflict detection and recurring events
- **agent-health-check-validation** - Implement comprehensive agent health monitoring
- **new-agent-creation** - Create and integrate new autonomous agents
- **cross-agent-communication-protocol** - Implement standardized agent communication

### 🟢 Low Priority Skills
Background tasks and optimization:
*(Coming soon)*

## Agent Skill Matrix

| Agent | Database | Security | Domain | System | Development |
|-------|----------|----------|---------|---------|-------------|
| auth-agent | ✓ | ✓ | ✓ | ✓ | ✗ |
| tenant-agent | ✓ | ✓ | ✓ | ✓ | ✓ |
| security-agent | ✓ | ✓ | ✓ | ✓ | ✓ |
| project-agent | ✓ | ✗ | ✓ | ✗ | ✗ |
| crm-agent | ✓ | ✗ | ✓ | ✗ | ✗ |
| finance-agent | ✓ | ✗ | ✓ | ✗ | ✗ |
| calendar-agent | ✗ | ✗ | ✓ | ✗ | ✗ |
| document-agent | ✗ | ✗ | ✓ | ✗ | ✗ |
| team-agent | ✗ | ✗ | ✓ | ✗ | ✗ |
| analytics-agent | ✗ | ✗ | ✗ | ✗ | ✗ |

## Skill Template Structure

Each skill follows a standardized structure:

```json
{
  "name": "skill-name",
  "description": "Detailed description of what the skill does",
  "priority": "CRITICAL|HIGH|MEDIUM|LOW",
  "expectedDuration": "Estimated execution time",
  
  "requiredAgents": ["agent-types-that-can-use-this-skill"],
  "requiredPermissions": ["required-permissions"],
  "dependencies": ["other-skills-or-systems-needed"],
  
  "objectives": ["clear-objectives"],
  "prerequisites": ["what-must-be-ready-before-execution"],
  "procedure": [
    {
      "step": 1,
      "action": "step-action-name",
      "description": "what-this-step-does",
      "commands": ["specific-commands-to-execute"],
      "agent": "agent-responsible",
      "expectedOutput": "expected-result"
    }
  ],
  
  "validation": {
    "criteria": ["success-criteria"],
    "testScenarios": [{"scenario": "...", "test": "...", "expected": "..."}],
    "successIndicators": ["what-indicates-success"]
  },
  
  "errorHandling": {
    "commonErrors": [{"error": "...", "solution": "..."}],
    "rollbackProcedure": ["rollback-steps"],
    "escalationCriteria": ["when-to-escalate"]
  },
  
  "successMetrics": [
    {
      "name": "metric-name",
      "target": "target-value",
      "measurement": "how-to-measure"
    }
  ],
  
  "agentInterfaces": [
    {
      "fromAgent": "sender",
      "toAgent": "receiver",
      "message": "communication-purpose",
      "data": ["data-items"]
    }
  ],
  
  "expectedOutputs": [
    {
      "name": "output-name",
      "type": "output-type",
      "content": ["what-the-output-contains"]
    }
  ]
}
```

## Creating New Skills

### 1. Follow the Template Structure
Use the established template format to ensure consistency and compatibility.

### 2. Define Clear Objectives
Each skill should have:
- Specific, measurable objectives
- Clear success criteria
- Comprehensive error handling
- Detailed validation procedures

### 3. Specify Agent Requirements
Clearly define:
- Which agents can execute the skill
- Required permissions
- Dependencies on other skills
- Integration points with other agents

### 4. Include Comprehensive Testing
Provide:
- Test scenarios covering edge cases
- Validation criteria
- Success indicators
- Error case testing

### 5. Add to Registry
Update `skills/registry.json` with the new skill information.

## Integration with Agent System

### Agent Communication
Skills can communicate with other agents through standardized interfaces:

```typescript
// Send message to another agent
await skillLoader.sendMessage({
  fromAgent: 'security-agent',
  toAgent: 'tenant-agent',
  message: 'RLS policies implemented',
  data: ['policy_count', 'affected_tables'],
  skillName: 'rls-policy-implementation'
});
```

### Context Integration
Skills integrate with existing React contexts:

```typescript
// Access agent context during skill execution
const { hasPermission } = useRBAC();
const { currentTenant } = useTenant();
```

### Security Validation
All skills undergo security validation:

```typescript
// Validate skill execution permissions
const canExecute = await skillLoader.validateSkillPermissions(
  skillName,
  agentName,
  userPermissions
);
```

## Development Workflow

### 1. Development
```bash
# Create new skill file
touch skills/database/my-new-skill.json

# Validate skill structure
npm run validate

# Test skill execution
skill load my-new-skill --agent security-agent --dry-run
```

### 2. Testing
```bash
# Run comprehensive tests
npm test

# Test with different agents
skill load my-new-skill --agent tenant-agent
skill load my-new-skill --agent security-agent
```

### 3. Integration
```bash
# Update registry
vim skills/registry.json

# Update documentation
vim README.md

# Commit changes
git add .
git commit -m "Add new skill: my-new-skill"
```

## Monitoring and Observability

### Execution Monitoring
```bash
# Monitor active executions
skill status

# Check execution history
skill history --limit 50 --failed-only

# Monitor specific agent
skill history --agent security-agent
```

### Performance Metrics
Skills automatically track:
- Execution duration
- Success/failure rates
- Resource usage
- Agent communication patterns

### Alerting
System alerts on:
- Critical skill failures
- Performance degradation
- Security violations
- Dependency failures

## Security Considerations

### Tenant Isolation
All skills must maintain strict tenant isolation:
- RLS policies enforced
- Cross-tenant access blocked
- Resource limits respected
- Audit logging maintained

### Permission Validation
Skills validate permissions at multiple levels:
- Agent authorization
- User role verification
- Resource access validation
- Operation-level security

### Audit Trail
Comprehensive logging includes:
- Skill execution details
- Agent interactions
- Data modifications
- Security events

## Troubleshooting

### Common Issues

1. **Skill Not Found**
   ```bash
   skill list  # Check if skill exists
   skill info skill-name  # Verify skill details
   ```

2. **Permission Denied**
   ```bash
   skill info skill-name  # Check required agents
   # Ensure correct agent is specified
   ```

3. **Prerequisites Not Met**
   ```bash
   skill info skill-name  # Check dependencies
   # Execute dependency skills first
   ```

4. **Execution Failures**
   ```bash
   skill history --failed-only  # Check failure patterns
   skill status  # Check current executions
   ```

### Getting Help

```bash
# Show all commands
skill

# Get help for specific command
skill load --help

# Show system information
skill metadata
```

## Contributing

1. **Fork the repository**
2. **Create a feature branch**
3. **Follow the skill template structure**
4. **Add comprehensive tests**
5. **Update documentation**
6. **Submit a pull request**

### Development Setup

```bash
# Clone repository
git clone https://github.com/eneas-os/skills
cd skills

# Install dependencies
npm install

# Start development
npm run dev

# Run tests
npm test

# Validate all skills
npm run validate
```

## License

MIT License - see LICENSE file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/eneas-os/skills/issues)
- **Documentation**: [Eneas-OS Docs](https://docs.eneas-os.com)
- **Community**: [Discord Server](https://discord.gg/eneas-os)