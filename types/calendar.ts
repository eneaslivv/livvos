import type { Task, Subtask, Comment, Collaborator } from './projects';

export interface CalendarTask extends Task {
  startDate?: string;
  endDate?: string;
  startTime?: string;
  duration?: number;
  description?: string;
  assignee?: Collaborator;
  assigneeId?: string;
  subtasks?: Subtask[];
  comments?: Comment[];
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: 'meeting' | 'work-block' | 'deadline';
  projectLink?: string;
}
