import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Icons } from '../components/ui/Icons';

interface AcceptProjectShareProps {
  token: string;
  onAccepted?: (projectId: string) => void;
}

export const AcceptProjectShare: React.FC<AcceptProjectShareProps> = ({ token, onAccepted }) => {
  const [status, setStatus] = useState<'loading' | 'needs_auth' | 'accepting' | 'accepted' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    checkAuth();
  }, [token]);

  const checkAuth = async () => {
    // First verify the token exists
    const { data: share, error: shareErr } = await supabase
      .from('project_shares')
      .select('id, email, status, project_id')
      .eq('token', token)
      .single();

    if (shareErr || !share) {
      setStatus('error');
      setError('Invitación no encontrada o inválida.');
      return;
    }

    if (share.status === 'accepted') {
      setStatus('error');
      setError('Esta invitación ya fue aceptada.');
      return;
    }

    if (share.status === 'revoked') {
      setStatus('error');
      setError('Esta invitación fue revocada.');
      return;
    }

    setEmail(share.email);

    // Fetch project name
    const { data: project } = await supabase
      .from('projects')
      .select('title')
      .eq('id', share.project_id)
      .single();
    if (project) setProjectName(project.title);

    // Check if user is authenticated
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await acceptShare();
    } else {
      setStatus('needs_auth');
    }
  };

  const acceptShare = async () => {
    setStatus('accepting');
    try {
      const { data, error: rpcErr } = await supabase.rpc('accept_project_share', { p_token: token });
      if (rpcErr) throw rpcErr;
      if (data?.error) {
        setStatus('error');
        setError(data.error);
        return;
      }
      setStatus('accepted');
      // Redirect after brief delay
      setTimeout(() => {
        if (onAccepted && data?.project_id) {
          onAccepted(data.project_id);
        } else {
          window.location.href = `/?view_shared_project=${data?.project_id}`;
        }
      }, 1500);
    } catch (err: any) {
      setStatus('error');
      setError(err.message || 'Error al aceptar la invitación');
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setError(null);

    try {
      if (isSignup) {
        const { data, error: signupErr } = await supabase.auth.signUp({ email, password });
        if (signupErr) throw signupErr;
        if (data.session) {
          await new Promise(r => setTimeout(r, 1000));
          await acceptShare();
        } else {
          setError('Revisá tu email para confirmar tu cuenta, luego volvé a este link.');
          setAuthLoading(false);
        }
      } else {
        const { error: loginErr } = await supabase.auth.signInWithPassword({ email, password });
        if (loginErr) throw loginErr;
        await acceptShare();
      }
    } catch (err: any) {
      setError(err.message || 'Error de autenticación');
      setAuthLoading(false);
    }
  };

  if (status === 'loading' || status === 'accepting') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-zinc-300 border-t-emerald-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-zinc-500">
            {status === 'loading' ? 'Verificando invitación...' : 'Aceptando invitación...'}
          </p>
        </div>
      </div>
    );
  }

  if (status === 'accepted') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black p-4">
        <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 text-center shadow-xl">
          <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Icons.CheckCircle size={24} className="text-emerald-500" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Invitación aceptada</h2>
          <p className="text-sm text-zinc-500">Redirigiendo al proyecto{projectName ? `: ${projectName}` : ''}...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black p-4">
        <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 text-center shadow-xl">
          <div className="w-14 h-14 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Icons.AlertCircle size={24} className="text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Error</h2>
          <p className="text-sm text-zinc-500 mb-6">{error}</p>
          <a href="/" className="text-sm text-emerald-600 hover:underline">Volver al inicio</a>
        </div>
      </div>
    );
  }

  // needs_auth: show login/signup form
  return (
    <div className="min-h-screen flex">
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden bg-[#0a0a0a]">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/10 via-transparent to-transparent" />
        <div className="relative z-10">
          <span className="text-2xl font-light tracking-wider text-white" style={{ fontFamily: 'serif' }}>
            livv<span className="text-emerald-500">~</span>
          </span>
        </div>
        <div className="relative z-10 space-y-4">
          <h1 className="text-3xl font-light leading-tight text-white" style={{ fontFamily: 'serif' }}>
            Te invitaron a ver <span className="text-emerald-500">{projectName || 'un proyecto'}</span>
          </h1>
          <p className="text-zinc-400 text-base leading-relaxed max-w-md">
            Iniciá sesión o creá una cuenta para acceder al proyecto compartido. Vas a poder ver el progreso, archivos, y dejar comentarios.
          </p>
        </div>
        <div className="relative z-10 flex items-center gap-2 text-xs text-zinc-600">
          <span className="text-emerald-600">ACCESO COMPARTIDO</span>
          <span className="text-zinc-700">&bull;</span>
          <span>Solo por invitación</span>
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="flex-1 flex items-center justify-center p-8 lg:p-12 bg-[#faf9f7] dark:bg-zinc-950">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="lg:hidden mb-4">
              <h2 className="text-xl font-light text-zinc-800 dark:text-zinc-100" style={{ fontFamily: 'serif' }}>
                Accedé a <span className="text-emerald-600">{projectName || 'un proyecto'}</span>
              </h2>
            </div>
            <p className="text-zinc-500 text-sm">
              {isSignup ? 'Creá tu cuenta para acceder' : 'Iniciá sesión para acceder'}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={!!email}
                className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm disabled:opacity-60"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1.5">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(null); }}
                placeholder={isSignup ? 'Mínimo 6 caracteres' : 'Tu contraseña'}
                className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                required
                autoFocus
              />
            </div>

            {error && (
              <div className="p-3 rounded-xl text-sm bg-red-50 border border-red-200 text-red-700 flex items-center gap-2">
                <Icons.AlertCircle size={14} className="text-red-500 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading || !password}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-full disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
            >
              {authLoading ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Procesando...</>
              ) : (
                <>{isSignup ? 'Crear cuenta y acceder' : 'Iniciar sesión'} <Icons.ChevronRight size={16} /></>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => { setIsSignup(!isSignup); setError(null); }}
              className="text-xs text-emerald-600 hover:text-emerald-700 font-medium hover:underline"
            >
              {isSignup ? '¿Ya tenés cuenta? Iniciá sesión' : '¿No tenés cuenta? Registrate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
