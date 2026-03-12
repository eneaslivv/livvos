
export interface Milestone {
  id: string;
  title: string;
  description: string;
  status: 'completed' | 'current' | 'future';
  /** Who owns this phase: 'team' | 'client' | 'review' */
  owner?: 'team' | 'client' | 'review';
  /** What the client needs to do (if owner='client') */
  clientAction?: string;
  /** Estimated completion date */
  eta?: string;
  /** When this milestone was completed */
  completedAt?: string;
  /** Linked payment info (if this delivery triggers a payment) */
  linkedPayment?: {
    amount: number;
    status: 'paid' | 'pending' | 'overdue';
    dueDate?: string;
  };
}

export interface Credential {
  id: string;
  service: string;
  user: string;
  pass: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  /** 'update' | 'milestone' | 'payment' | 'review' | 'delivery' */
  type?: string;
  projectTitle?: string;
}

export interface CredentialItem {
  id: string;
  service: string;
  user?: string;
  pass?: string;
}

export interface AssetItem {
  id: string;
  name: string;
  type?: string;
  size?: string;
  url?: string;
  projectTitle?: string;
}

export interface PaymentEntry {
  id: string;
  concept: string;
  amount: number;
  dueDate: string;
  paidDate?: string;
  status: 'paid' | 'pending' | 'overdue';
  number?: number;
  projectTitle?: string;
  linkedTaskId?: string;
  linkedTaskTitle?: string;
}

export interface ProjectBudget {
  projectId: string;
  projectTitle: string;
  total: number;
  paid: number;
  nextPayment?: { amount: number; dueDate: string; concept?: string; linkedTaskTitle?: string };
  payments: PaymentEntry[];
}

export interface PortalTask {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: string;
  startDate?: string;
  dueDate?: string;
  groupName: string;
  status?: string;
  priority?: string;
}

export interface PortalProject {
  id: string;
  title: string;
  status?: string;
}

export interface DashboardData {
  progress: number;
  startDate: string;
  etaDate: string;
  onTrack: boolean;
  budget: {
    total: number;
    paid: number;
    /** Optional next payment info */
    nextPayment?: { amount: number; dueDate: string; concept?: string; linkedTaskTitle?: string };
    /** Full payment schedule */
    payments?: PaymentEntry[];
  };
  milestones: Milestone[];
  logs: LogEntry[];
  credentials?: CredentialItem[];
  assets?: AssetItem[];
  tasks?: PortalTask[];
  projects?: PortalProject[];
  allProjectsBudget?: ProjectBudget[];
}
