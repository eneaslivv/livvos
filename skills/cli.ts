/**
 * Skill CLI for Eneas-OS Agents
 * Command-line interface for loading and executing agent skills
 */

import { skillLoader } from './loader';
import type { SkillInfo, SkillExecutionResult } from './types';

interface CommandDefinition {
  name: string;
  description: string;
  handler: (args: string[], options: Record<string, any>) => Promise<void>;
  options: Array<{
    name: string;
    flags: string;
    description: string;
    hasValue?: boolean;
  }>;
}

class SimpleCLI {
  private commands: Map<string, CommandDefinition> = new Map();

  registerCommand(command: CommandDefinition) {
    this.commands.set(command.name, command);
  }

  async execute() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
      this.showHelp();
      return;
    }

    const commandName = args[0];
    const command = this.commands.get(commandName);

    if (!command) {
      console.error(`Unknown command: ${commandName}`);
      this.showHelp();
      process.exit(1);
    }

    // Parse options
    const options: Record<string, any> = {};
    const positionalArgs: string[] = [];

    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith('-')) {
        const optionDef = command.options.find(opt =>
          arg.includes(opt.name) || arg.startsWith(opt.flags.split(' ')[0])
        );

        if (optionDef) {
          if (optionDef.hasValue) {
            const value = args[i + 1];
            if (value && !value.startsWith('-')) {
              options[optionDef.name] = value;
              i++; // Skip the value
            }
          } else {
            options[optionDef.name] = true;
          }
        }
      } else {
        positionalArgs.push(arg);
      }
    }

    try {
      await command.handler(positionalArgs, options);
    } catch (error) {
      console.error(`Error executing command: ${error.message}`);
      process.exit(1);
    }
  }

  private showHelp() {
    console.log('Eneas-OS Agent Skill Management CLI');
    console.log('');
    console.log('Commands:');
    for (const command of this.commands.values()) {
      console.log(`  ${command.name.padEnd(15)} ${command.description}`);
    }
    console.log('');
    console.log('Use "skill <command> --help" for more information on a specific command.');
  }
}

const cli = new SimpleCLI();

// Helper functions
function getPriorityIcon(priority: string): string {
  switch (priority) {
    case 'CRITICAL': return '🔴';
    case 'HIGH': return '🔶';
    case 'MEDIUM': return '🟡';
    case 'LOW': return '🟢';
    default: return '⚪';
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'running': return '🔄';
    case 'completed': return '✅';
    case 'failed': return '❌';
    case 'cancelled': return '⏹️';
    case 'pending': return '⏳';
    default: return '❓';
  }
}

// List all available skills
cli.registerCommand({
  name: 'list',
  description: 'List all available skills',
  options: [
    { name: 'category', flags: '-c, --category', description: 'Filter by category', hasValue: true },
    { name: 'priority', flags: '-p, --priority', description: 'Filter by priority', hasValue: true },
    { name: 'agent', flags: '-a, --agent', description: 'Filter by agent', hasValue: true },
    { name: 'keyword', flags: '-k, --keyword', description: 'Search by keyword', hasValue: true }
  ],
  handler: async (args, options) => {
    const skills = await skillLoader.searchSkills(options);

    if (skills.length === 0) {
      console.log('No skills found matching your criteria.');
      return;
    }

    console.log('\nAvailable Skills:');
    console.log('==================');

    skills.forEach((skill: SkillInfo) => {
      const priorityIcon = getPriorityIcon(skill.priority);
      console.log(`${priorityIcon} ${skill.name}`);
      console.log(`   Description: ${skill.description}`);
      console.log(`   Category: ${skill.category} | Priority: ${skill.priority}`);
      console.log(`   Duration: ${skill.duration} | Agents: ${skill.requiredAgents.join(', ')}`);
      console.log(`   Path: ${skill.path}`);
      console.log('');
    });

    // Summary
    console.log(`Total: ${skills.length} skills found`);
    if (options.category) console.log(`Category: ${options.category}`);
    if (options.priority) console.log(`Priority: ${options.priority}`);
    if (options.agent) console.log(`Agent: ${options.agent}`);
    if (options.keyword) console.log(`Keyword: ${options.keyword}`);
  }
});

// Get detailed information about a skill
cli.registerCommand({
  name: 'info',
  description: 'Get detailed information about a specific skill',
  options: [],
  handler: async (args) => {
    const skillName = args[0];
    if (!skillName) {
      console.error('Error: Skill name is required');
      console.log('Usage: skill info <skill-name>');
      return;
    }

    const skill = await skillLoader.loadSkill(skillName);

    console.log(`\nSkill: ${skill.name}`);
    console.log('='.repeat(skill.name.length + 6));
    console.log(`Description: ${skill.description}`);
    console.log(`Priority: ${skill.priority}`);
    console.log(`Expected Duration: ${skill.expectedDuration}`);

    console.log('\nRequired Agents:');
    skill.requiredAgents.forEach(agent => console.log(`  - ${agent}`));

    console.log('\nRequired Permissions:');
    skill.requiredPermissions.forEach(permission => console.log(`  - ${permission}`));

    console.log('\nDependencies:');
    skill.dependencies.forEach(dep => console.log(`  - ${dep}`));

    console.log('\nObjectives:');
    skill.objectives.forEach(obj => console.log(`  ✓ ${obj}`));

    console.log('\nPrerequisites:');
    skill.prerequisites.forEach(prereq => console.log(`  • ${prereq}`));

    console.log(`\nProcedure (${skill.procedure.length} steps):`);
    skill.procedure.forEach((step, index) => {
      console.log(`  ${index + 1}. ${step.action}`);
      console.log(`     ${step.description}`);
      if (step.agent && step.agent !== skill.requiredAgents[0]) {
        const agents = Array.isArray(step.agent) ? step.agent.join(', ') : step.agent;
        console.log(`     Agent: ${agents}`);
      }
    });

    console.log('\nExpected Outputs:');
    skill.expectedOutputs.forEach(output => {
      console.log(`  • ${output.name} (${output.type})`);
      if (output.location) console.log(`    Location: ${output.location}`);
    });

    console.log('\nSuccess Metrics:');
    skill.successMetrics.forEach(metric => {
      console.log(`  • ${metric.name}: ${metric.target} (${metric.measurement})`);
    });
  }
});

// Load and execute a skill
cli.registerCommand({
  name: 'load',
  description: 'Load and execute a skill',
  options: [
    { name: 'agent', flags: '-a, --agent', description: 'Agent executing the skill (required)', hasValue: true },
    { name: 'dryRun', flags: '-d, --dry-run', description: 'Show what would be executed without running' }
  ],
  handler: async (args, options) => {
    const skillName = args[0];
    if (!skillName) {
      console.error('Error: Skill name is required');
      console.log('Usage: skill load <skill-name> --agent <agent>');
      return;
    }

    if (!options.agent) {
      console.error('Error: --agent option is required');
      console.log('Usage: skill load <skill-name> --agent <agent>');
      return;
    }

    const skill = await skillLoader.loadSkill(skillName);

    // Validate agent permissions
    if (!skill.requiredAgents.includes(options.agent) &&
      !skill.requiredAgents.includes('all-domain-agents')) {
      console.error(`Error: Agent '${options.agent}' is not authorized to execute skill '${skillName}'`);
      console.error(`Required agents: ${skill.requiredAgents.join(', ')}`);
      return;
    }

    console.log(`\nLoading skill: ${skillName}`);
    console.log(`Agent: ${options.agent}`);
    console.log(`Priority: ${skill.priority}`);
    console.log(`Expected Duration: ${skill.expectedDuration}`);

    if (options.dryRun) {
      console.log('\nDry run - showing execution plan:');
      console.log('===================================');
      skill.procedure.forEach((step, index) => {
        console.log(`\nStep ${index + 1}: ${step.action}`);
        console.log(`Description: ${step.description}`);
        console.log(`Commands: ${step.commands.join(', ')}`);
        console.log(`Expected Output: ${step.expectedOutput}`);
        const agents = Array.isArray(step.agent) ? step.agent.join(', ') : step.agent;
        console.log(`Agent: ${agents}`);
      });
      return;
    }

    console.log('\nExecuting skill...');
    console.log('==================');

    const startTime = Date.now();
    const result = await skillLoader.executeSkill(skillName, options.agent);
    const endTime = Date.now();

    console.log(`\nExecution completed in ${endTime - startTime}ms`);
    console.log(`Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);

    if (result.success) {
      console.log(`Steps completed: ${result.stepsCompleted}/${skill.procedure.length}`);

      if (Object.keys(result.outputs).length > 0) {
        console.log('\nOutputs:');
        Object.entries(result.outputs).forEach(([key, value]) => {
          console.log(`  ${key}: ${JSON.stringify(value, null, 2)}`);
        });
      }

      if (Object.keys(result.validationResults).length > 0) {
        console.log('\nValidation Results:');
        console.log(JSON.stringify(result.validationResults, null, 2));
      }
    } else {
      console.log(`Steps completed: ${result.stepsCompleted}/${skill.procedure.length}`);

      if (result.errors.length > 0) {
        console.log('\nErrors:');
        result.errors.forEach(error => console.log(`  ❌ ${error}`));
      }
    }
  }
});

// Show active executions
cli.registerCommand({
  name: 'status',
  description: 'Show active skill executions',
  options: [
    { name: 'agent', flags: '-a, --agent', description: 'Filter by agent', hasValue: true }
  ],
  handler: async (args, options) => {
    const executions = await skillLoader.getActiveExecutions();

    let filteredExecutions = executions;
    if (options.agent) {
      filteredExecutions = executions.filter(exec => exec.agent === options.agent);
    }

    if (filteredExecutions.length === 0) {
      console.log('No active executions found.');
      return;
    }

    console.log('\nActive Executions:');
    console.log('==================');

    filteredExecutions.forEach(execution => {
      const statusIcon = getStatusIcon(execution.status);
      const duration = execution.startTime ?
        `${Math.round((Date.now() - execution.startTime.getTime()) / 1000)}s` : 'N/A';

      console.log(`${statusIcon} ${execution.skillName} (${execution.agent})`);
      console.log(`   Status: ${execution.status}`);
      console.log(`   Progress: ${execution.currentStep}/${execution.totalSteps} steps`);
      console.log(`   Duration: ${duration}`);

      if (execution.logs.length > 0) {
        console.log(`   Last log: ${execution.logs[execution.logs.length - 1]}`);
      }
      console.log('');
    });
  }
});

// Show execution history
cli.registerCommand({
  name: 'history',
  description: 'Show execution history',
  options: [
    { name: 'agent', flags: '-a, --agent', description: 'Filter by agent', hasValue: true },
    { name: 'limit', flags: '-n, --limit', description: 'Limit number of results', hasValue: true },
    { name: 'failedOnly', flags: '--failed-only', description: 'Show only failed executions' }
  ],
  handler: async (args, options) => {
    const limit = parseInt(options.limit) || 10;
    const history = await skillLoader.getExecutionHistory(options.agent);

    let filteredHistory = history;
    if (options.failedOnly) {
      filteredHistory = history.filter(result => !result.success);
    }

    const limitedHistory = filteredHistory.slice(-limit).reverse();

    if (limitedHistory.length === 0) {
      console.log('No execution history found.');
      return;
    }

    console.log('\nExecution History:');
    console.log('==================');

    limitedHistory.forEach((result: SkillExecutionResult) => {
      const statusIcon = result.success ? '✅' : '❌';
      const timestamp = new Date(Date.now() - result.duration).toLocaleString();

      console.log(`${statusIcon} ${result.skillName} (${result.agent}) - ${timestamp}`);
      console.log(`   Duration: ${result.duration}ms | Steps: ${result.stepsCompleted}`);

      if (!result.success && result.errors.length > 0) {
        console.log(`   Error: ${result.errors[0]}`);
      }
      console.log('');
    });
  }
});

// Show system metadata
cli.registerCommand({
  name: 'metadata',
  description: 'Show system metadata (categories, priorities, agents)',
  options: [],
  handler: async () => {
    console.log('\nSkill Categories:');
    console.log('=================');
    skillLoader.getCategories().forEach(cat => console.log(`  • ${cat}`));

    console.log('\nPriorities:');
    console.log('===========');
    skillLoader.getPriorities().forEach(priority => {
      const icon = getPriorityIcon(priority);
      console.log(`  ${icon} ${priority}`);
    });

    console.log('\nAgents:');
    console.log('=======');
    skillLoader.getAgents().forEach(agent => console.log(`  • ${agent}`));
  }
});

// Execute the CLI
cli.execute();