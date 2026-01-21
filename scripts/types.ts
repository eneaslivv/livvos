// Basic type definitions for migration system
// This is a minimal interface to avoid import errors

export interface Json {
  [key: string]: any;
}

export type Database = {
  public: {
    Tables: {
      schema_migrations: {
        Row: {
          version: string;
          checksum: string;
          executed_at: string;
          execution_time_ms: number;
          success: boolean;
          error_message: string | null;
        };
        Insert: {
          version: string;
          checksum: string;
          executed_at?: string;
          execution_time_ms?: number;
          success?: boolean;
          error_message?: string | null;
        };
        Update: {
          version?: string;
          checksum?: string;
          executed_at?: string;
          execution_time_ms?: number;
          success?: boolean;
          error_message?: string | null;
        };
      };
      // Add other table definitions as needed
    };
    Views: {
      [key: string]: any;
    };
    Functions: {
      [key: string]: any;
    };
    Enums: {
      [key: string]: any;
    };
    CompositeTypes: {
      [key: string]: any;
    };
  };
};