export enum Status {
  Active = 'Active',
  Pending = 'Pending',
  Review = 'Review',
  Completed = 'Completed',
  Archived = 'Archived'
}

export enum Priority {
  High = 'High',
  Medium = 'Medium',
  Low = 'Low'
}

export type AppMode = 'os' | 'sales' | 'master';
export type PageView = 'home' | 'brief' | 'projects' | 'clients' | 'team' | 'team_clients' | 'calendar' | 'docs' | 'activity' | 'communications' | 'finance' | 'sales_dashboard' | 'sales_leads' | 'sales_analytics' | 'sales_pipeline' | 'tenant_settings' | 'client_portal' | 'shared_project' | 'content_cms' | 'platform_admin' | 'platform_customers' | 'platform_roles' | 'platform_features' | 'platform_audit' | 'platform_slack_agent' | 'platform_sales_agent' | 'strategy_hub' | 'content_engine' | 'team_scaling' | 'growth_dashboard' | 'strategy_toolkit' | 'bundle_preview' | 'agent' | 'products' | 'build_hub' | 'project_architect';

export interface NavParams {
  projectId?: string;
  clientId?: string;
  /** When set on a navigate to 'calendar', the task panel auto-opens. */
  taskId?: string;
  /** Internal — set by handleNavigate so consumer useEffects always see
   *  a dep change, even when the underlying ids are identical to the
   *  previous nav. Do not set this manually from caller code. */
  _nonce?: number;
}
