import React, { useEffect, useState } from 'react';
import { useGoogleCalendar } from '../hooks/useGoogleCalendar';

interface GoogleCallbackProps {
  code: string;
  onComplete: () => void;
}

export const GoogleCallback: React.FC<GoogleCallbackProps> = ({ code, onComplete }) => {
  const { exchangeCode } = useGoogleCalendar();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!code) {
      setStatus('error');
      setErrorMsg('No se recibió código de autorización');
      return;
    }

    exchangeCode(code)
      .then(() => {
        setStatus('success');
        // Clean URL params
        window.history.replaceState({}, '', window.location.pathname);
        // Redirect after brief delay
        setTimeout(() => onComplete(), 1500);
      })
      .catch((err) => {
        setStatus('error');
        setErrorMsg(err.message || 'Error al conectar');
        // Clean URL params even on error
        window.history.replaceState({}, '', window.location.pathname);
      });
  }, [code, exchangeCode, onComplete]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="text-center p-8 max-w-sm">
        {status === 'loading' && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
            <p className="text-zinc-900 dark:text-zinc-100 font-semibold">Conectando Google Calendar...</p>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-2">
              Intercambiando credenciales de forma segura
            </p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-zinc-900 dark:text-zinc-100 font-semibold">Google Calendar conectado</p>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-2">Redirigiendo al calendario...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-zinc-900 dark:text-zinc-100 font-semibold">Error al conectar</p>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-2">{errorMsg}</p>
            <button
              onClick={onComplete}
              className="mt-4 px-4 py-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 underline"
            >
              Volver al calendario
            </button>
          </>
        )}
      </div>
    </div>
  );
};
