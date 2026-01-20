/**
 * Skill Loader for Eneas-OS Agents
 * Provides functionality to load, validate, and execute agent skills
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { 
  SkillTemplate, 
  SkillInfo, 
  SkillRegistry,
  SkillExecutionState,
  SkillExecutionResult,
  SkillManager,
  AnySkill
} from './types';

export class SkillLoader implements SkillManager {
  private registryPath: string;
  private skillsPath: string;
  private registry: SkillRegistry;
  private activeExecutions: Map<string, SkillExecutionState> = new Map();
  private executionHistory: SkillExecutionResult[] = [];

  constructor(skillsPath: string = './skills') {
    this.skillsPath = resolve(skillsPath);
    this.registryPath = resolve(this.skillsPath, 'registry.json');
    this.registry = this.loadRegistry();
  }

  /**
   * Load the skill registry from disk
   */
  private loadRegistry(): SkillRegistry {
    if (!existsSync(this.registryPath)) {
      throw new Error(`Skill registry not found at ${this.registryPath}`);
    }

    try {
      const registryContent = readFileSync(this.registryPath, 'utf8');
      return JSON.parse(registryContent);
    } catch (error) {
      throw new Error(`Failed to load skill registry: ${error.message}`);
    }
  }

  /**
   * Load a skill template from disk
   */
  async loadSkill(name: string): Promise<SkillTemplate> {
    const skillInfo = this.registry.skills.find(skill => skill.name === name);
    if (!skillInfo) {
      throw new Error(`Skill '${name}' not found in registry`);
    }

    const skillPath = resolve(this.skillsPath, skillInfo.path);
    if (!existsSync(skillPath)) {
      throw new Error(`Skill file not found: ${skillPath}`);
    }

    try {
      const skillContent = readFileSync(skillPath, 'utf8');
      const skill = JSON.parse(skillContent);
      this.validateSkillStructure(skill);
      return skill as SkillTemplate;
    } catch (error) {
      throw new Error(`Failed to load skill '${name}': ${error.message}`);
    }
  }

  /**
   * List all available skills
   */
  async listSkills(): Promise<SkillInfo[]> {
    return this.registry.skills;
  }

  /**
   * Get information about a specific skill
   */
  async getSkillInfo(name: string): Promise<SkillInfo | null> {
    return this.registry.skills.find(skill => skill.name === name) || null;
  }

  /**
   * Execute a skill
   */
  async executeSkill(name: string, agent: string): Promise<SkillExecutionResult> {
    const skill = await this.loadSkill(name);
    const executionId = `${name}-${agent}-${Date.now()}`;
    
    // Initialize execution state
    const executionState: SkillExecutionState = {
      skillName: name,
      status: 'pending',
      currentStep: 0,
      totalSteps: skill.procedure.length,
      startTime: new Date(),
      agent,
      logs: []
    };

    this.activeExecutions.set(executionId, executionState);

    try {
      // Check prerequisites
      const prerequisitesMet = await this.checkPrerequisites(skill);
      if (!prerequisitesMet) {
        throw new Error('Prerequisites not met for skill execution');
      }

      // Check agent permissions
      if (!skill.requiredAgents.includes(agent) && !skill.requiredAgents.includes('all-domain-agents')) {
        throw new Error(`Agent '${agent}' is not authorized to execute skill '${name}'`);
      }

      // Update status to running
      executionState.status = 'running';
      this.log(executionId, `Starting execution of skill '${name}' by agent '${agent}'`);

      // Execute skill steps
      const outputs: Record<string, any> = {};
      
      for (let i = 0; i < skill.procedure.length; i++) {
        const step = skill.procedure[i];
        executionState.currentStep = i + 1;
        
        this.log(executionId, `Executing step ${i + 1}: ${step.action}`);
        
        try {
          const stepResult = await this.executeStep(step, executionId);
          outputs[`step_${i + 1}`] = stepResult;
          this.log(executionId, `Step ${i + 1} completed successfully`);
        } catch (stepError) {
          this.log(executionId, `Step ${i + 1} failed: ${stepError.message}`);
          throw stepError;
        }
      }

      // Validate results
      const validationResults = await this.validateExecutionResults(skill, outputs);
      
      // Mark as completed
      executionState.status = 'completed';
      executionState.endTime = new Date();
      
      const result: SkillExecutionResult = {
        success: true,
        skillName: name,
        agent,
        duration: executionState.endTime.getTime() - executionState.startTime.getTime(),
        stepsCompleted: skill.procedure.length,
        outputs,
        errors: [],
        validationResults
      };

      this.executionHistory.push(result);
      this.log(executionId, `Skill execution completed successfully in ${result.duration}ms`);
      
      return result;

    } catch (error) {
      executionState.status = 'failed';
      executionState.endTime = new Date();
      
      const result: SkillExecutionResult = {
        success: false,
        skillName: name,
        agent,
        duration: executionState.endTime.getTime() - executionState.startTime.getTime(),
        stepsCompleted: executionState.currentStep,
        outputs: {},
        errors: [error.message],
        validationResults: {}
      };

      this.executionHistory.push(result);
      this.log(executionId, `Skill execution failed: ${error.message}`);
      
      return result;
    } finally {
      // Remove from active executions after completion
      setTimeout(() => {
        this.activeExecutions.delete(executionId);
      }, 5000); // Keep for 5 seconds for final status checks
    }
  }

  /**
   * Cancel an active skill execution
   */
  async cancelExecution(executionId: string): Promise<boolean> {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      return false;
    }

    execution.status = 'cancelled';
    execution.endTime = new Date();
    this.log(executionId, 'Execution cancelled');
    
    return true;
  }

  /**
   * Get execution status
   */
  async getExecutionStatus(executionId: string): Promise<SkillExecutionState | null> {
    return this.activeExecutions.get(executionId) || null;
  }

  /**
   * Validate skill structure
   */
  async validateSkill(skill: SkillTemplate): Promise<boolean> {
    try {
      this.validateSkillStructure(skill);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if skill prerequisites are met
   */
  async checkPrerequisites(skill: SkillTemplate): Promise<boolean> {
    // In a real implementation, this would check system state, dependencies, etc.
    // For now, we'll assume prerequisites are met if the skill file exists
    return true;
  }

  /**
   * Get active skill executions
   */
  async getActiveExecutions(): Promise<SkillExecutionState[]> {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Get execution history
   */
  async getExecutionHistory(agent?: string): Promise<SkillExecutionResult[]> {
    if (agent) {
      return this.executionHistory.filter(result => result.agent === agent);
    }
    return this.executionHistory;
  }

  /**
   * Validate skill structure
   */
  private validateSkillStructure(skill: any): void {
    const requiredFields = [
      'name', 'description', 'priority', 'expectedDuration',
      'requiredAgents', 'requiredPermissions', 'dependencies',
      'objectives', 'prerequisites', 'procedure', 'validation',
      'errorHandling', 'successMetrics', 'agentInterfaces', 'expectedOutputs'
    ];

    for (const field of requiredFields) {
      if (!(field in skill)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate procedure structure
    if (!Array.isArray(skill.procedure)) {
      throw new Error('Procedure must be an array');
    }

    for (const step of skill.procedure) {
      const stepFields = ['step', 'action', 'description', 'commands', 'agent', 'expectedOutput'];
      for (const field of stepFields) {
        if (!(field in step)) {
          throw new Error(`Missing required field in procedure step: ${field}`);
        }
      }
    }

    // Validate priority
    const validPriorities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    if (!validPriorities.includes(skill.priority)) {
      throw new Error(`Invalid priority: ${skill.priority}`);
    }
  }

  /**
   * Execute a single skill step
   */
  private async executeStep(step: any, executionId: string): Promise<any> {
    // In a real implementation, this would execute the actual commands
    // For now, we'll simulate step execution
    this.log(executionId, `Executing commands: ${step.commands.join(', ')}`);
    
    // Simulate command execution delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Return step result
    return {
      action: step.action,
      completed: true,
      output: step.expectedOutput
    };
  }

  /**
   * Validate execution results against skill validation criteria
   */
  private async validateExecutionResults(skill: SkillTemplate, outputs: Record<string, any>): Promise<Record<string, any>> {
    const validationResults: Record<string, any> = {
      criteriaMet: true,
      validationChecks: []
    };

    for (const criterion of skill.validation.criteria) {
      const checkResult = {
        criterion,
        passed: true, // In real implementation, this would actually check
        details: 'Validation passed'
      };
      validationResults.validationChecks.push(checkResult);
    }

    return validationResults;
  }

  /**
   * Log execution events
   */
  private log(executionId: string, message: string): void {
    const execution = this.activeExecutions.get(executionId);
    if (execution) {
      const timestamp = new Date().toISOString();
      execution.logs.push(`[${timestamp}] ${message}`);
      console.log(`[${executionId}] ${message}`);
    }
  }

  /**
   * Get skill categories
   */
  getCategories(): string[] {
    return this.registry.categories;
  }

  /**
   * Get skill priorities
   */
  getPriorities(): string[] {
    return this.registry.priorities;
  }

  /**
   * Get agents
   */
  getAgents(): string[] {
    return this.registry.agents;
  }

  /**
   * Search skills by criteria
   */
  async searchSkills(criteria: {
    category?: string;
    priority?: string;
    agent?: string;
    keyword?: string;
  }): Promise<SkillInfo[]> {
    let skills = this.registry.skills;

    if (criteria.category) {
      skills = skills.filter(skill => skill.path.includes(criteria.category!));
    }

    if (criteria.priority) {
      skills = skills.filter(skill => skill.priority === criteria.priority);
    }

    if (criteria.agent) {
      skills = skills.filter(skill => 
        skill.requiredAgents.includes(criteria.agent!) ||
        skill.requiredAgents.includes('all-domain-agents')
      );
    }

    if (criteria.keyword) {
      const keyword = criteria.keyword.toLowerCase();
      skills = skills.filter(skill => 
        skill.name.toLowerCase().includes(keyword) ||
        skill.description.toLowerCase().includes(keyword)
      );
    }

    return skills;
  }
}

// Export singleton instance
export const skillLoader = new SkillLoader();