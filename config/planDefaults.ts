// Plan-based feature defaults and labels for tenant feature gating

export type FeatureKey =
  | 'projects_module'
  | 'team_management'
  | 'sales_module'
  | 'finance_module'
  | 'documents_module'
  | 'notifications'
  | 'ai_assistant'
  | 'analytics'
  | 'calendar_integration'
  | 'client_portal'
  | 'document_versioning'
  | 'advanced_permissions';

export type PlanName = 'starter' | 'professional' | 'enterprise';

export type PlanFeatures = Record<FeatureKey, boolean>;

export type PlanResourceLimits = {
  max_users: number;
  max_projects: number;
  max_storage_mb: number;
  max_api_calls_per_month: number;
};

export const ALL_FEATURES: FeatureKey[] = [
  'projects_module',
  'team_management',
  'sales_module',
  'finance_module',
  'documents_module',
  'notifications',
  'analytics',
  'calendar_integration',
  'client_portal',
  'ai_assistant',
  'document_versioning',
  'advanced_permissions',
];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  projects_module: 'Projects',
  team_management: 'Team & Clients',
  sales_module: 'Sales / CRM',
  finance_module: 'Finance',
  documents_module: 'Documents',
  notifications: 'Notifications',
  ai_assistant: 'AI Assistant',
  analytics: 'Analytics',
  calendar_integration: 'Calendar',
  client_portal: 'Client Portal',
  document_versioning: 'Document Versioning',
  advanced_permissions: 'Advanced Permissions',
};

export const PLAN_FEATURE_DEFAULTS: Record<PlanName, PlanFeatures> = {
  starter: {
    projects_module: true,
    team_management: true,
    sales_module: true,
    finance_module: true,
    documents_module: true,
    notifications: true,
    analytics: true,
    calendar_integration: false,
    client_portal: false,
    ai_assistant: false,
    document_versioning: false,
    advanced_permissions: false,
  },
  professional: {
    projects_module: true,
    team_management: true,
    sales_module: true,
    finance_module: true,
    documents_module: true,
    notifications: true,
    analytics: true,
    calendar_integration: true,
    client_portal: true,
    ai_assistant: true,
    document_versioning: false,
    advanced_permissions: false,
  },
  enterprise: {
    projects_module: true,
    team_management: true,
    sales_module: true,
    finance_module: true,
    documents_module: true,
    notifications: true,
    analytics: true,
    calendar_integration: true,
    client_portal: true,
    ai_assistant: true,
    document_versioning: true,
    advanced_permissions: true,
  },
};

export const PLAN_RESOURCE_DEFAULTS: Record<PlanName, PlanResourceLimits> = {
  starter: {
    max_users: 5,
    max_projects: 20,
    max_storage_mb: 1024,
    max_api_calls_per_month: 10000,
  },
  professional: {
    max_users: 25,
    max_projects: 100,
    max_storage_mb: 5120,
    max_api_calls_per_month: 50000,
  },
  enterprise: {
    max_users: 100,
    max_projects: 500,
    max_storage_mb: 51200,
    max_api_calls_per_month: 500000,
  },
};

export const PLAN_LABELS: Record<PlanName, string> = {
  starter: 'Starter',
  professional: 'Professional',
  enterprise: 'Enterprise',
};

export function getFeaturesForPlan(plan: string): PlanFeatures {
  return PLAN_FEATURE_DEFAULTS[plan as PlanName] ?? PLAN_FEATURE_DEFAULTS.starter;
}

export function getResourceLimitsForPlan(plan: string): PlanResourceLimits {
  return PLAN_RESOURCE_DEFAULTS[plan as PlanName] ?? PLAN_RESOURCE_DEFAULTS.starter;
}
