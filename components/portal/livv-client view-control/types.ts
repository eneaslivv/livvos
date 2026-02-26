
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
}

export interface PaymentEntry {
  id: string;
  concept: string;
  amount: number;
  dueDate: string;
  paidDate?: string;
  status: 'paid' | 'pending' | 'overdue';
  number?: number;
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
    nextPayment?: { amount: number; dueDate: string; concept?: string };
    /** Full payment schedule */
    payments?: PaymentEntry[];
  };
  milestones: Milestone[];
  logs: LogEntry[];
  credentials?: CredentialItem[];
  assets?: AssetItem[];
}
