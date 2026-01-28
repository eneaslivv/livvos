
// Data Models

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

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority?: Priority;
  projectId?: string; // Link to project
  dueDate?: string; // ISO String
}

export interface Subtask {
  id: string;
  text: string;
  completed: boolean;
}

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  userInitials: string;
  text: string;
  createdAt: string;
}

export interface CalendarTask extends Task {
  startDate?: string; // ISO String (YYYY-MM-DD)
  endDate?: string;   // ISO String (YYYY-MM-DD)
  startTime?: string; // e.g. "10:00"
  duration?: number; // minutes
  description?: string;
  assignee?: Collaborator; // Now used as the selected user object
  assigneeId?: string;
  subtasks?: Subtask[];
  comments?: Comment[];
}

export interface Project {
  id: string;
  title: string;
  description: string;
  progress: number;
  status: Status;
  client?: string;
  tasks: Task[];
  nextSteps: string;
  updatedAt: string;
  color?: string; // UI Color
}

export interface Collaborator {
  id: string;
  name: string;
  role: string;
  avatarInitials: string;
  status: 'online' | 'offline' | 'busy';
  pendingTasks: number;
}



export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // ISO date
  type: 'meeting' | 'work-block' | 'deadline';
  projectLink?: string;
}

export interface WeeklyGoal {
  id: string;
  text: string;
  completed: boolean;
}

// New Activity Types
export type ActivityType = 'task_completed' | 'comment' | 'project_created' | 'file_uploaded' | 'status_change';

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string; // initials
  action: string;
  target: string; // e.g. "Homepage Design"
  projectId?: string;
  projectTitle?: string;
  type: ActivityType;
  timestamp: string; // ISO or relative
  details?: string; // Comment text or extra info
  meta?: {
    fileType?: string;
    prevStatus?: string;
    newStatus?: string;
  };
}

// --- SALES & LEADS TYPES ---

export type LeadStatus = 'new' | 'contacted' | 'following' | 'closed' | 'lost';
export type LeadTemperature = 'cold' | 'warm' | 'hot';
export type LeadCategory = 'branding' | 'web-design' | 'ecommerce' | 'saas' | 'creators' | 'other';

export interface Lead {
  id: string;
  name: string;
  email: string;
  message: string;
  origin: string; // 'Web Form', 'Instagram', etc.
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
  };
  status: LeadStatus;
  createdAt: string; // ISO
  lastInteraction: string;

  // Optional fields for richer lead data
  company?: string;
  phone?: string;
  source?: string;
  budget?: number;
  category?: LeadCategory;
  temperature?: LeadTemperature;

  // REME AI Fields
  aiAnalysis?: {
    category: LeadCategory;
    temperature: LeadTemperature;
    summary: string;
    recommendation: string;
  };

  history: {
    id: string;
    type: 'email' | 'note' | 'status_change' | 'system';
    content: string;
    date: string;
  }[];

  // Conversion tracking
  converted_to_project_id?: string;
  converted_at?: string;
}

export interface WebAnalytics {
  totalVisits: number;
  uniqueVisitors: number;
  bounceRate: number;
  conversions: number;
  topPages: { path: string; views: number }[];
  dailyVisits: { date: string; value: number }[]; // For charts
}

export type ProposalStatus = 'draft' | 'sent' | 'approved' | 'rejected';

export interface Proposal {
  id: string;
  tenant_id: string;
  lead_id?: string | null;
  client_id?: string | null;
  title: string;
  summary?: string | null;
  status: ProposalStatus;
  content?: string | null;
  pricing_snapshot?: Record<string, any>;
  timeline?: Record<string, any>;
  currency?: string | null;
  project_type?: string | null;
  language?: string | null;
  brief_text?: string | null;
  portfolio_ids?: string[] | null;
  complexity?: string | null;
  complexity_factor?: number | null;
  pricing_total?: number | null;
  consent_text?: string | null;
  public_token?: string | null;
  public_enabled?: boolean;
  sent_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type AppMode = 'os' | 'sales';
export type PageView = 'home' | 'projects' | 'clients' | 'team' | 'team_clients' | 'calendar' | 'docs' | 'activity' | 'finance' | 'sales_dashboard' | 'sales_leads' | 'sales_analytics' | 'tenant_settings' | 'client_portal';
