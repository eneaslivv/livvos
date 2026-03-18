import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { errorLogger } from '../lib/errorLogger';
import { useRBAC } from './RBACContext';
import {
  credentialManager,
  DecryptedCredential,
  CredentialCreateInput,
  CredentialUpdateInput,
  CREDENTIAL_TYPES
} from '../lib/credentialManager';

/**
 * SecurityContext — Manages encrypted credentials and security event logging.
 *
 * Permission checks (hasPermission, hasRole, isAdmin, isOwner) are delegated
 * to RBACContext as the single source of truth. Do NOT duplicate them here.
 */

interface SecurityContextType {
  // Credential management
  credentials: DecryptedCredential[];
  credentialsLoading: boolean;
  createCredential: (input: CredentialCreateInput) => Promise<DecryptedCredential>;
  updateCredential: (id: string, updates: CredentialUpdateInput) => Promise<DecryptedCredential>;
  deleteCredential: (id: string) => Promise<void>;
  getCredentials: (projectId?: string) => Promise<void>;
  getCredential: (id: string) => Promise<DecryptedCredential>;

  // Security utilities
  refreshSecurityData: () => Promise<void>;
  logSecurityEvent: (event: string, details?: any) => Promise<void>;
  checkCredentialAccess: (credentialId: string) => Promise<boolean>;

  // State
  loading: boolean;
  error: string | null;
}

const SecurityContext = createContext<SecurityContextType | undefined>(undefined);

export const SecurityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, hasPermission } = useRBAC();

  // Credential state
  const [credentials, setCredentials] = useState<DecryptedCredential[]>([]);
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Credential management
  const getCredentials = useCallback(async (projectId?: string): Promise<void> => {
    try {
      setCredentialsLoading(true);

      if (!projectId) {
        const { data: userProjects } = await supabase
          .from('projects')
          .select('id')
          .or(`owner_id.eq.${user?.id}`);

        if (!userProjects || userProjects.length === 0) {
          setCredentials([]);
          return;
        }

        const projectIds = userProjects.map(p => p.id);
        const allCredentials: DecryptedCredential[] = [];

        for (const pid of projectIds) {
          const projectCredentials = await credentialManager.getProjectCredentials(pid);
          allCredentials.push(...projectCredentials);
        }

        setCredentials(allCredentials);
      } else {
        const projectCredentials = await credentialManager.getProjectCredentials(projectId);
        setCredentials(projectCredentials);
      }
    } catch (error) {
      errorLogger.error('Error getting credentials', error);
    } finally {
      setCredentialsLoading(false);
    }
  }, [user?.id]);

  const createCredential = useCallback(async (input: CredentialCreateInput): Promise<DecryptedCredential> => {
    try {
      const result = await credentialManager.createCredential(input);
      await getCredentials();
      return result;
    } catch (error) {
      errorLogger.error('Error creating credential', error);
      throw error;
    }
  }, [getCredentials]);

  const updateCredential = useCallback(async (id: string, updates: CredentialUpdateInput): Promise<DecryptedCredential> => {
    try {
      const result = await credentialManager.updateCredential(id, updates);
      await getCredentials();
      return result;
    } catch (error) {
      errorLogger.error('Error updating credential', error);
      throw error;
    }
  }, [getCredentials]);

  const deleteCredential = useCallback(async (id: string): Promise<void> => {
    try {
      await credentialManager.deleteCredential(id);
      await getCredentials();
    } catch (error) {
      errorLogger.error('Error deleting credential', error);
      throw error;
    }
  }, [getCredentials]);

  const getCredential = useCallback(async (id: string): Promise<DecryptedCredential> => {
    try {
      return await credentialManager.getCredential(id);
    } catch (error) {
      errorLogger.error('Error getting credential', error);
      throw error;
    }
  }, []);

  // Security utilities
  const refreshSecurityData = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      await getCredentials();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getCredentials]);

  const logSecurityEvent = useCallback(async (event: string, details?: any): Promise<void> => {
    try {
      await supabase.from('activity_logs').insert({
        action: event,
        target: user?.email || 'unknown',
        type: 'security',
        details: details || {},
        user_id: user?.id || null,
      });
    } catch (error) {
      errorLogger.error('Error logging security event', error);
    }
  }, [user?.email, user?.id]);

  const checkCredentialAccess = useCallback(async (credentialId: string): Promise<boolean> => {
    try {
      const { data: credential } = await supabase
        .from('project_credentials')
        .select('project_id')
        .eq('id', credentialId)
        .single();

      if (!credential) return false;

      const { data: project } = await supabase
        .from('projects')
        .select('owner_id')
        .eq('id', credential.project_id)
        .single();

      if (!project) return false;

      return project.owner_id === user?.id || hasPermission('security', 'manage');
    } catch (error) {
      errorLogger.error('Error checking credential access', error);
      return false;
    }
  }, [user?.id, hasPermission]);

  const value: SecurityContextType = {
    credentials,
    credentialsLoading,
    createCredential,
    updateCredential,
    deleteCredential,
    getCredentials,
    getCredential,
    refreshSecurityData,
    logSecurityEvent,
    checkCredentialAccess,
    loading,
    error
  };

  return (
    <SecurityContext.Provider value={value}>
      {children}
    </SecurityContext.Provider>
  );
};

export const useSecurity = (): SecurityContextType => {
  const context = useContext(SecurityContext);
  if (context === undefined) {
    throw new Error('useSecurity must be used within a SecurityProvider');
  }
  return context;
};

export { CREDENTIAL_TYPES };
