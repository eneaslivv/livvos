export type ActivityType = 'task_completed' | 'comment' | 'project_created' | 'file_uploaded' | 'status_change';

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  action: string;
  target: string;
  projectId?: string;
  projectTitle?: string;
  type: ActivityType;
  timestamp: string;
  details?: string;
  meta?: {
    fileType?: string;
    prevStatus?: string;
    newStatus?: string;
  };
}
