import { Status, Priority } from './common';

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority?: Priority;
  projectId?: string;
  dueDate?: string;
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
  color?: string;
}

export interface Collaborator {
  id: string;
  name: string;
  role: string;
  avatarInitials: string;
  status: 'online' | 'offline' | 'busy';
  pendingTasks: number;
}

export interface WeeklyGoal {
  id: string;
  text: string;
  completed: boolean;
}
