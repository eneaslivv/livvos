import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

interface GoogleCalendarState {
  isConnected: boolean;
  email: string | null;
  lastSyncedAt: string | null;
  syncError: string | null;
  loading: boolean;
  syncing: boolean;
}

export function useGoogleCalendar() {
  const { user } = useAuth();
  const [state, setState] = useState<GoogleCalendarState>({
    isConnected: false,
    email: null,
    lastSyncedAt: null,
    syncError: null,
    loading: true,
    syncing: false,
  });

  // Check connection status from DB
  const checkConnection = useCallback(async () => {
    if (!user) {
      setState(prev => ({ ...prev, loading: false }));
      return;
    }
    setState(prev => ({ ...prev, loading: true }));

    try {
      const { data, error } = await supabase
        .from('integration_credentials')
        .select('external_email, last_synced_at, sync_error, is_active')
        .eq('user_id', user.id)
        .eq('provider', 'google_calendar')
        .maybeSingle();

      setState(prev => ({
        ...prev,
        loading: false,
        isConnected: !!data?.is_active,
        email: data?.external_email || null,
        lastSyncedAt: data?.last_synced_at || null,
        syncError: data?.sync_error || null,
      }));
    } catch {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [user]);

  // Auto-check on mount
  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  // Start OAuth flow - redirects the browser
  const connect = useCallback(async () => {
    const redirectUri = window.location.origin + window.location.pathname;

    const resp = await supabase.functions.invoke('google-calendar-auth', {
      body: {
        action: 'get-auth-url',
        redirect_uri: redirectUri,
      },
    });

    if (resp.error) throw resp.error;
    if (!resp.data?.url) throw new Error('No auth URL returned');

    // Full page redirect to Google OAuth
    window.location.href = resp.data.url;
  }, []);

  // Exchange authorization code after OAuth callback
  const exchangeCode = useCallback(async (code: string) => {
    const redirectUri = window.location.origin + window.location.pathname;

    const resp = await supabase.functions.invoke('google-calendar-auth', {
      body: {
        action: 'exchange-code',
        code,
        redirect_uri: redirectUri,
      },
    });

    if (resp.error) throw resp.error;

    setState(prev => ({
      ...prev,
      isConnected: true,
      email: resp.data?.email || null,
    }));

    return resp.data;
  }, []);

  // Trigger sync
  const sync = useCallback(async (timeMin?: string, timeMax?: string) => {
    setState(prev => ({ ...prev, syncing: true }));
    try {
      const resp = await supabase.functions.invoke('google-calendar-sync', {
        body: { time_min: timeMin, time_max: timeMax },
      });

      if (resp.error) throw resp.error;

      setState(prev => ({
        ...prev,
        syncing: false,
        lastSyncedAt: new Date().toISOString(),
        syncError: null,
      }));

      return resp.data;
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        syncing: false,
        syncError: err.message || 'Sync failed',
      }));
      throw err;
    }
  }, []);

  // Disconnect Google Calendar
  const disconnect = useCallback(async () => {
    const resp = await supabase.functions.invoke('google-calendar-auth', {
      body: { action: 'disconnect' },
    });

    if (resp.error) throw resp.error;

    setState({
      isConnected: false,
      email: null,
      lastSyncedAt: null,
      syncError: null,
      loading: false,
      syncing: false,
    });
  }, []);

  return {
    ...state,
    checkConnection,
    connect,
    exchangeCode,
    sync,
    disconnect,
  };
}
