// @ts-nocheck
// Shared types for the Aurora edge function runtime.

export interface ToolContext {
  supabase: any;       // SupabaseClient bound to the user's JWT (RLS applies)
  supabaseAdmin: any;  // service-role client — use ONLY when you need cross-tenant data (Pulse) or to bypass RLS for a specific computed result (e.g. cost dashboards)
  tenantId: string;
  userId: string;
}

export type ToolHandler = (args: any, ctx: ToolContext) => Promise<any>;

export interface ToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
}

export interface AgentDef {
  slug: string;
  model: string;
  systemPrompt: string;
  tools: ToolDef[];
  toolHandlers: Record<string, ToolHandler>;
  /** Optional: restrict who can talk to this agent. Pulse only for platform admins. */
  guard?: (ctx: ToolContext) => Promise<boolean>;
}

export interface AgentResponseLite {
  text: string;
  canvas: any | null;
}
