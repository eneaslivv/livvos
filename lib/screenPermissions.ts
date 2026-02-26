// Single source of truth: maps each app screen to its required permission.
// Used by the invite form (checkboxes) and could be used by Layout.tsx navigation.

export interface ScreenPermission {
  id: string;
  label: string;
  module: string;
  action: string;
  mode: 'os' | 'sales';
}

export const SCREEN_PERMISSIONS: ScreenPermission[] = [
  // OS Mode
  { id: 'projects',        label: 'Projects',          module: 'projects',  action: 'view',           mode: 'os' },
  { id: 'team_clients',    label: 'Team / Clients',    module: 'team',      action: 'view',           mode: 'os' },
  { id: 'calendar',        label: 'Calendar',          module: 'calendar',  action: 'view',           mode: 'os' },
  { id: 'activity',        label: 'Activity',          module: 'activity',  action: 'view',           mode: 'os' },
  { id: 'docs',            label: 'Documents',         module: 'documents', action: 'view',           mode: 'os' },
  // Sales Mode
  { id: 'sales_dashboard', label: 'Sales Overview',    module: 'sales',     action: 'view_dashboard', mode: 'sales' },
  { id: 'sales_leads',     label: 'Leads Inbox',       module: 'sales',     action: 'view_leads',     mode: 'sales' },
  { id: 'finance',         label: 'Financial Center',  module: 'finance',   action: 'view',           mode: 'sales' },
  { id: 'sales_analytics', label: 'Analytics',         module: 'sales',     action: 'view_analytics', mode: 'sales' },
];

// All screen permission IDs
export const ALL_SCREEN_IDS = SCREEN_PERMISSIONS.map(sp => sp.id);
export const OS_SCREENS = SCREEN_PERMISSIONS.filter(sp => sp.mode === 'os');
export const SALES_SCREENS = SCREEN_PERMISSIONS.filter(sp => sp.mode === 'sales');
