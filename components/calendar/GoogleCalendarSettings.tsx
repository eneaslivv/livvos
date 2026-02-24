import React, { useState } from 'react';
import { Icons } from '../ui/Icons';
import { useGoogleCalendar } from '../../hooks/useGoogleCalendar';

export const GoogleCalendarSettings: React.FC = () => {
  const {
    isConnected,
    email,
    lastSyncedAt,
    syncError,
    loading,
    syncing,
    connect,
    disconnect,
    sync,
  } = useGoogleCalendar();

  const [disconnecting, setDisconnecting] = useState(false);

  const handleConnect = async () => {
    try {
      await connect();
    } catch (err) {
      console.error('Error connecting Google Calendar:', err);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnect();
    } catch (err) {
      console.error('Error disconnecting Google Calendar:', err);
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSync = async () => {
    try {
      await sync();
    } catch (err) {
      console.error('Error syncing Google Calendar:', err);
    }
  };

  if (loading) {
    return (
      <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 animate-pulse">
        <div className="h-5 w-40 bg-zinc-200 dark:bg-zinc-700 rounded mb-3" />
        <div className="h-4 w-64 bg-zinc-200 dark:bg-zinc-700 rounded" />
      </div>
    );
  }

  return (
    <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Google Calendar
            </h4>
            {isConnected && email && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{email}</p>
            )}
          </div>
        </div>

        {isConnected ? (
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 border border-zinc-200 dark:border-zinc-700 rounded-lg transition-colors"
            >
              <Icons.RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Sincronizando...' : 'Sincronizar'}
            </button>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 border border-red-200 dark:border-red-800 rounded-lg transition-colors"
            >
              {disconnecting ? 'Desconectando...' : 'Desconectar'}
            </button>
          </div>
        ) : (
          <button
            onClick={handleConnect}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Icons.Plus size={14} />
            Conectar
          </button>
        )}
      </div>

      {/* Status info */}
      {isConnected && (
        <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-1.5">
          {lastSyncedAt && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Última sincronización: {new Date(lastSyncedAt).toLocaleString('es-ES')}
            </p>
          )}
          {syncError && (
            <p className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
              <Icons.AlertTriangle size={12} />
              {syncError}
            </p>
          )}
          {!lastSyncedAt && !syncError && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Conectado. Haz click en &quot;Sincronizar&quot; para importar eventos.
            </p>
          )}
        </div>
      )}

      {!isConnected && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">
          Conecta tu Google Calendar para ver tus eventos aquí (solo lectura).
        </p>
      )}
    </div>
  );
};
