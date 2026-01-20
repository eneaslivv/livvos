/**
 * Skill Template Interface
 * Defines the structure for all eneas-os agent skills
 */

export interface SkillStep {
  step: number;
  action: string;
  description: string;
  commands: string[];
  agent: string | string[];
  expectedOutput: string;
}

export interface ValidationCriteria {
  criteria: string[];
  testScenarios?: Array<{
    scenario: string;
    test: string;
    expected: string;
  }>;
  testQueries?: string[];
  successIndicators: string[];
}

export interface ErrorProcedure {
  commonErrors: Array<{
    error: string;
    solution: string;
  }>;
  rollbackProcedure: string[];
  escalationCriteria: string[];
}

export interface SuccessMetric {
  name: string;
  target: string;
  measurement: string;
}

export interface AgentInterface {
  fromAgent: string;
  toAgent: string | string[];
  message: string;
  data: string[];
}

export interface OutputDefinition {
  name: string;
  type: string;
  location?: string;
  content: string[] | string;
}

export interface PostExecution {
  cleanup: string[];
  monitoring: string[];
  maintenance?: string[];
}

export interface SkillTemplate {
  // Metadata
  name: string;
  description: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  expectedDuration: string;
  
  // Agent Requirements
  requiredAgents: string[];
  requiredPermissions: string[];
  dependencies: string[];
  
  // Execution Details
  objectives: string[];
  prerequisites: string[];
  procedure: SkillStep[];
  validation: ValidationCriteria;
  errorHandling: ErrorProcedure;
  successMetrics: SuccessMetric[];
  
  // Integration Points
  agentInterfaces: AgentInterface[];
  expectedOutputs: OutputDefinition[];
  postExecution?: PostExecution;
}

/**
 * Skill Registry Interface
 * Manages available skills and their metadata
 */

export interface SkillInfo {
  name: string;
  category: string;
  priority: string;
  path: string;
  requiredAgents: string[];
  duration: string;
  description: string;
}

export interface SkillRegistry {
  skills: SkillInfo[];
  categories: string[];
  priorities: string[];
  agents: string[];
}

/**
 * Skill Execution Interface
 * Manages skill execution state and results
 */

export interface SkillExecutionState {
  skillName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStep: number;
  totalSteps: number;
  startTime?: Date;
  endTime?: Date;
  agent: string;
  logs: string[];
  results?: any;
}

export interface SkillExecutionResult {
  success: boolean;
  skillName: string;
  agent: string;
  duration: number;
  stepsCompleted: number;
  outputs: Record<string, any>;
  errors: string[];
  validationResults: Record<string, any>;
}

/**
 * Skill Manager Interface
 * Core skill management functionality
 */

export interface SkillManager {
  // Skill discovery and loading
  loadSkill(name: string): Promise<SkillTemplate>;
  listSkills(): Promise<SkillInfo[]>;
  getSkillInfo(name: string): Promise<SkillInfo | null>;
  
  // Skill execution
  executeSkill(name: string, agent: string): Promise<SkillExecutionResult>;
  cancelExecution(executionId: string): Promise<boolean>;
  getExecutionStatus(executionId: string): Promise<SkillExecutionState>;
  
  // Skill validation
  validateSkill(skill: SkillTemplate): Promise<boolean>;
  checkPrerequisites(skill: SkillTemplate): Promise<boolean>;
  
  // Skill monitoring
  getActiveExecutions(): Promise<SkillExecutionState[]>;
  getExecutionHistory(agent?: string): Promise<SkillExecutionResult[]>;
}

/**
 * Skill Communication Interface
 * Handles inter-agent communication during skill execution
 */

export interface SkillMessage {
  id: string;
  fromAgent: string;
  toAgent: string;
  message: string;
  data: any;
  timestamp: Date;
  skillName?: string;
  step?: number;
}

export interface SkillCommunication {
  sendMessage(message: SkillMessage): Promise<void>;
  receiveMessages(agent: string): Promise<SkillMessage[]>;
  subscribeToSkill(skillName: string, agent: string): Promise<void>;
  unsubscribeFromSkill(skillName: string, agent: string): Promise<void>;
}

/**
 * Types for specific skill categories
 */

export type DatabaseSkill = SkillTemplate & {
  category: 'database';
  tableOperations?: string[];
  migrationInfo?: {
    sourceTable?: string;
    targetTable?: string;
    estimatedRows?: number;
  };
};

export type SecuritySkill = SkillTemplate & {
  category: 'security';
  securityLevel: 'critical' | 'high' | 'medium' | 'low';
  complianceFrameworks?: string[];
  auditRequirements?: string[];
};

export type DomainSkill = SkillTemplate & {
  category: 'domain';
  domain: string;
  businessImpact: string;
  kpiMetrics?: string[];
};

export type SystemSkill = SkillTemplate & {
  category: 'system';
  systemComponent: string;
  impactScope: 'local' | 'tenant' | 'global';
  availabilityImpact?: 'none' | 'minimal' | 'significant' | 'critical';
};

export type DevelopmentSkill = SkillTemplate & {
  category: 'development';
  developmentType: 'creation' | 'integration' | 'testing' | 'optimization';
  targetComponent?: string;
  testingRequirements?: string[];
};

export type AnySkill = DatabaseSkill | SecuritySkill | DomainSkill | SystemSkill | DevelopmentSkill;

/**
 * Utility Types
 */

export type SkillCategory = 'database' | 'security' | 'domain' | 'system' | 'development';
export type SkillPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type SkillStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Constants
 */

export const SKILL_CATEGORIES: SkillCategory[] = ['database', 'security', 'domain', 'system', 'development'];
export const SKILL_PRIORITIES: SkillPriority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
export const SKILL_STATUSES: SkillStatus[] = ['pending', 'running', 'completed', 'failed', 'cancelled'];