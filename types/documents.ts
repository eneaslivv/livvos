export interface Document {
  id: string;
  tenant_id: string;
  owner_id: string;
  client_id: string | null;
  project_id: string | null;
  task_id: string | null;
  title: string;
  content: Record<string, any>;
  content_text: string;
  status: 'draft' | 'published';
  is_favorite: boolean;
  share_token: string | null;
  share_enabled: boolean;
  created_at: string;
  updated_at: string;
}
