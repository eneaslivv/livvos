
export interface Milestone {
  id: string;
  title: string;
  description: string;
  status: 'completed' | 'current' | 'future';
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

export interface DashboardData {
  progress: number;
  startDate: string;
  etaDate: string;
  onTrack: boolean;
  budget: {
    total: number;
    paid: number;
  };
  milestones: Milestone[];
  logs: LogEntry[];
  credentials?: CredentialItem[];
  assets?: AssetItem[];
}
