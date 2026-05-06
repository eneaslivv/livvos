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

export type AppMode = 'os' | 'sales';
export type PageView = 'home' | 'projects' | 'clients' | 'team' | 'team_clients' | 'calendar' | 'docs' | 'activity' | 'communications' | 'finance' | 'sales_dashboard' | 'sales_leads' | 'sales_analytics' | 'tenant_settings' | 'client_portal' | 'shared_project' | 'content_cms' | 'platform_admin';

export interface NavParams {
  projectId?: string;
  clientId?: string;
  /** When set on a navigate to 'calendar', the task panel auto-opens. */
  taskId?: string;
}
