import React from 'react';

interface DebugPanelProps {
  visible?: boolean;
}

export const DebugPanel: React.FC<DebugPanelProps> = ({ visible = false }) => {
  const [logs, setLogs] = React.useState<string[]>([]);
  const [isOpen, setIsOpen] = React.useState(visible);

  React.useEffect(() => {
    // Capturar logs del console
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    const addLog = (type: string, args: any[]) => {
      const timestamp = new Date().toLocaleTimeString();
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      
      const logEntry = `[${timestamp}] ${type}: ${message}`;
      setLogs(prev => [...prev.slice(-50), logEntry]); // Mantener últimos 50 logs
    };

    console.log = (...args) => {
      addLog('LOG', args);
      originalLog.apply(console, args);
    };

    console.error = (...args) => {
      addLog('ERROR', args);
      originalError.apply(console, args);
    };

    console.warn = (...args) => {
      addLog('WARN', args);
      originalWarn.apply(console, args);
    };

    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 w-12 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center z-50 transition-colors"
        title="Abrir panel de debug"
      >
        🐛
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 h-80 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-zinc-200 dark:border-zinc-700">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Debug Console</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setLogs([])}
            className="text-xs px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700"
            title="Limpiar logs"
          >
            Limpiar
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            title="Cerrar"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-y-auto p-3 text-xs font-mono">
        {logs.length === 0 ? (
          <p className="text-zinc-500 dark:text-zinc-400">No hay logs aún...</p>
        ) : (
          logs.map((log, index) => (
            <div
              key={index}
              className={`mb-1 p-1 rounded ${
                log.includes('ERROR:')
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                  : log.includes('WARN:')
                  ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400'
                  : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
              }`}
            >
              {log}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-zinc-200 dark:border-zinc-700 text-xs text-zinc-500 dark:text-zinc-400">
        Logs: {logs.length} | Auto-scroll activado
      </div>
    </div>
  );
};