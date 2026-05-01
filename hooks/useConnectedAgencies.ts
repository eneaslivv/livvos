import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';
import { errorLogger } from '../lib/errorLogger';

export interface ConnectedAgency {
  tenant_id: string;
  tenant_name: string;
  logo_url: string | null;
  relationship: 'parent' | 'child';
}

interface UseConnectedAgenciesReturn {
  agencies: ConnectedAgency[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useConnectedAgencies(): UseConnectedAgenciesReturn {
  const { currentTenant } = useTenant();
  const [agencies, setAgencies] = useState<ConnectedAgency[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!currentTenant?.id) {
      setAgencies([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_connected_agencies');
      if (error) throw error;
      setAgencies((data || []) as ConnectedAgency[]);
    } catch (err) {
      errorLogger.error('useConnectedAgencies failed:', err);
      setAgencies([]);
    } finally {
      setLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  return { agencies, loading, refresh };
}
