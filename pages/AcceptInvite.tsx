import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { errorLogger } from '../lib/errorLogger';
import { Icons } from '../components/ui/Icons';

export const AcceptInvite: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isValidToken, setIsValidToken] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inviteType, setInviteType] = useState<string>('team');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [existingUserFlow, setExistingUserFlow] = useState(false);

  const queryParams = new URLSearchParams(window.location.search);
  const token = queryParams.get('token');
  const isClientInvite = queryParams.get('portal') === 'client' || inviteType === 'client';
  const [tenantName, setTenantName] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      setError('El link de invitación no es válido. Verificá la URL.');
      return;
    }

    const verifyToken = async () => {
      try {
        // Use SECURITY DEFINER RPC to verify token (works without tenant membership)
        const { data, error } = await supabase
          .rpc('verify_invitation_token', { p_token: token });

        const row = Array.isArray(data) ? data[0] : data;

        if (error || !row) {
          setError('Invitación no encontrada o expirada.');
        } else if (row.status === 'accepted') {
          setError('Esta invitación ya fue utilizada.');
        } else {
          setEmail(row.email);
          setInviteType(row.type || 'team');
          setTenantName(row.tenant_name || row.tenant || null);
          setIsValidToken(true);

          // Detect existing-user case up front so the form opens in the right mode
          // and we never surprise the user with a "switch to sign-in" mid-flow.
          try {
            const probe = await supabase.rpc('check_user_exists', { p_email: row.email });
            const exists = Array.isArray(probe.data) ? probe.data[0]?.exists : probe.data?.exists;
            if (exists === true) setExistingUserFlow(true);
          } catch { /* probe is best-effort; the signup-then-fallback path still works */ }
        }
      } catch {
        setError('Ocurrió un error al verificar la invitación.');
      } finally {
        setIsLoading(false);
      }
    };

    verifyToken();
  }, [token]);

  // Poll for profile creation after signup (handle_new_user trigger is async)
  const waitForProfile = async (userId: string): Promise<boolean> => {
    const MAX_RETRIES = 10;
    const POLL_INTERVAL = 500;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      const { data } = await supabase
        .from('profiles')
        .select('id, tenant_id')
        .eq('id', userId)
        .single();

      if (data?.tenant_id) return true;
    }
    return false;
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;

      if (authData.session) {
        // Wait for the handle_new_user trigger to create profile + assign role
        const profileReady = await waitForProfile(authData.session.user.id);

        if (!profileReady) {
          errorLogger.error('Profile not created after signup', {
            userId: authData.session.user.id,
            token,
          });
          setError('La cuenta se creó pero la configuración está demorando. Probá iniciar sesión en unos segundos.');
          setIsSubmitting(false);
          return;
        }

        // Safety: mark invitation as accepted (trigger already does this, but belt-and-suspenders)
        if (token) {
          await supabase
            .from('invitations')
            .update({ status: 'accepted', accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('token', token);
        }

        window.location.href = inviteType === 'client' ? '/?portal=client' : '/';
      } else if (authData.user && !authData.session) {
        // Email confirmation required — auto-confirm via Edge Function since user came from invitation
        try {
          const confirmRes = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/confirm-invite-signup`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
              body: JSON.stringify({ email, token }),
            }
          );
          const confirmData = await confirmRes.json();

          if (confirmData.ok) {
            // Email confirmed — now sign in automatically
            const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
            if (!signInErr) {
              const profileReady = await waitForProfile(authData.user.id);
              if (profileReady) {
                window.location.href = inviteType === 'client' ? '/?portal=client' : '/';
                return;
              }
            }
          }
        } catch {
          // Silent fail — show manual message as fallback
        }
        setSuccessMessage(
          'Cuenta creada. Revisá tu email para confirmar la cuenta antes de iniciar sesión.'
        );
        setIsSubmitting(false);
      } else {
        window.location.href = inviteType === 'client' ? '/?portal=client' : '/auth';
      }
    } catch (err: any) {
      const message = err.message || '';
      // Handle "already registered" — show sign-in flow instead
      if (message.toLowerCase().includes('already registered') || message.toLowerCase().includes('already been registered')) {
        setExistingUserFlow(true);
        setPassword('');
        setConfirmPassword('');
        setError(null);
      } else {
        setError(message || 'Error al crear la cuenta.');
      }
      setIsSubmitting(false);
    }
  };

  // Sign-in flow for existing users
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Ingresá tu contraseña.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;

      // Use RPC to accept the invitation (assigns role, updates tenant, marks accepted)
      if (token) {
        const { data: result } = await supabase.rpc('accept_invitation', { p_token: token });
        if (result?.error) {
          errorLogger.error('accept_invitation RPC error', result.error);
          setError(result.error);
          setIsSubmitting(false);
          return;
        }
      }

      const redirectType = inviteType === 'client' ? '/?portal=client' : '/';
      window.location.href = redirectType;
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión.');
      setIsSubmitting(false);
    }
  };

  /* ─── Loading ─── */
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="flex items-center gap-3 text-zinc-500">
          <div className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
          <span className="text-sm">Verificando invitación…</span>
        </div>
      </div>
    );
  }

  /* ─── Success (email confirmation needed) ─── */
  if (successMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black p-4">
        <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 text-center shadow-xl">
          <div className="w-14 h-14 bg-[#2C0405]/5 dark:bg-[#2C0405]/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Icons.Mail size={24} className="text-[#2C0405] dark:text-[#e8b4b4]" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Revisá tu email</h2>
          <p className="text-sm text-zinc-500 mb-6">{successMessage}</p>
          <a
            href={isClientInvite ? '/?portal=client' : '/auth'}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#2C0405] hover:text-[#1a0203] hover:underline"
          >
            Ir a iniciar sesión
            <Icons.ChevronRight size={14} />
          </a>
        </div>
      </div>
    );
  }

  /* ─── Error ─── */
  if (error && !isValidToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black p-4">
        <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 text-center shadow-xl">
          <div className="w-14 h-14 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Icons.AlertCircle size={24} className="text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Error en la invitación</h2>
          <p className="text-sm text-zinc-500 mb-6">{error}</p>
          <a
            href={isClientInvite ? '/?portal=client' : '/auth'}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:underline"
          >
            Ir a iniciar sesión
            <Icons.ChevronRight size={14} />
          </a>
        </div>
      </div>
    );
  }

  /* ─── Registration / Sign-in Form ─── */
  return (
    <div className="min-h-screen flex">
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{ backgroundColor: isClientInvite ? '#0a0a0a' : '#09090b' }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[#2C0405]/20 via-transparent to-transparent" />

        {/* Logo */}
        <div className="relative z-10">
          <span className="text-2xl font-light tracking-wider text-white" style={{ fontFamily: 'serif' }}>
            livv<span className="text-[#e8b4b4]">~</span>
          </span>
        </div>

        {/* Main content */}
        <div className="relative z-10 space-y-6">
          <div>
            <h1 className="text-4xl font-light leading-tight mb-4 text-white" style={{ fontFamily: 'serif' }}>
              {isClientInvite ? (
                <>Bienvenido a tu <span className="text-[#e8b4b4]">Portal</span></>
              ) : (
                <>Sumate al <span className="text-amber-500">equipo</span></>
              )}
            </h1>
            <p className="text-zinc-400 text-lg leading-relaxed max-w-md">
              {isClientInvite
                ? 'Accedé al seguimiento de tu proyecto en tiempo real. Progreso, pagos, documentos y comunicación directa con el equipo.'
                : tenantName
                  ? `Fuiste invitado a colaborar en ${tenantName}. Completá tu registro para comenzar.`
                  : 'Fuiste invitado a colaborar en Eneas OS. Completá tu registro para comenzar.'}
            </p>
          </div>

          {isClientInvite && (
            <div className="space-y-5 mt-8">
              {[
                { icon: '◎', title: 'Progreso en vivo', desc: 'Seguí el avance de tu proyecto con hitos y timeline.' },
                { icon: '◈', title: 'Pagos y finanzas', desc: 'Revisá tu plan de pagos y estado de facturación.' },
                { icon: '⌘', title: 'Documentos seguros', desc: 'Accedé a contratos, credenciales y archivos del proyecto.' },
              ].map((f, i) => (
                <div key={i} className="flex items-start gap-4 group">
                  <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[#e8b4b4] text-lg group-hover:border-[#e8b4b4]/30 transition-colors">
                    {f.icon}
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-[#e8b4b4]">{f.title}</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="relative z-10 flex items-center gap-2 text-xs text-zinc-600">
          <span className={isClientInvite ? 'text-[#e8b4b4]' : 'text-amber-600'}>PORTAL SEGURO</span>
          <span className="text-zinc-700">&bull;</span>
          <span>Datos encriptados</span>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-8 lg:p-12" style={{ backgroundColor: '#faf9f7' }}>
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-10">
            <div className={`w-14 h-14 ${isClientInvite ? 'bg-[#2C0405]/5' : 'bg-amber-50'} rounded-full flex items-center justify-center mx-auto mb-4`}>
              <Icons.Mail size={22} className={isClientInvite ? 'text-[#2C0405]' : 'text-amber-600'} />
            </div>
            <h2 className="text-3xl font-light text-zinc-800 mb-2" style={{ fontFamily: 'serif' }}>
              {existingUserFlow
                ? 'Iniciá sesión para aceptar'
                : isClientInvite
                  ? 'Creá tu cuenta'
                  : 'Completá tu registro'}
            </h2>
            <p className="text-zinc-500 text-sm">
              {existingUserFlow
                ? `Ya existe una cuenta con ${email}. Ingresá tu contraseña para aceptar la invitación${tenantName ? ` a ${tenantName}` : ''}.`
                : isClientInvite
                  ? `Creá una contraseña para acceder al portal${tenantName ? ` de ${tenantName}` : ''}. Te llevará 30 segundos.`
                  : `Creá una contraseña para sumarte al equipo${tenantName ? ` de ${tenantName}` : ''}. Te llevará 30 segundos.`}
            </p>
          </div>

          {/* Form — Sign-in flow for existing users */}
          {existingUserFlow ? (
            <form onSubmit={handleSignIn} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
                  Tu email
                </label>
                <div className="relative">
                  <Icons.Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="email"
                    value={email}
                    disabled
                    className="w-full pl-11 pr-4 py-3.5 bg-zinc-100 border border-zinc-200 rounded-xl text-zinc-500 cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
                  Contraseña
                </label>
                <div className="relative">
                  <Icons.Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(null); }}
                    placeholder="Ingresá tu contraseña"
                    className={`w-full pl-11 pr-4 py-3.5 bg-white border rounded-xl text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 transition-all ${
                      isClientInvite
                        ? 'border-zinc-200 focus:ring-[#2C0405]/15 focus:border-[#2C0405]'
                        : 'border-zinc-200 focus:ring-amber-500/20 focus:border-amber-500'
                    }`}
                    autoFocus
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl text-sm bg-red-50 border border-red-200 text-red-700 flex items-center gap-2">
                  <Icons.AlertCircle size={15} className="text-red-500 shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !password}
                className={`w-full py-3.5 mt-2 text-white font-medium rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 ${
                  isClientInvite
                    ? 'bg-[#2C0405] hover:bg-[#1a0203] shadow-lg shadow-[#2C0405]/20'
                    : 'bg-zinc-900 hover:bg-zinc-800'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Iniciando sesión…
                  </>
                ) : (
                  <>
                    Iniciar sesión y aceptar
                    <Icons.ChevronRight size={16} />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => { setExistingUserFlow(false); setPassword(''); setError(null); }}
                className="w-full text-center text-sm text-zinc-400 hover:text-zinc-700 transition-colors mt-2"
              >
                Volver al registro
              </button>
            </form>
          ) : (
            /* Form — Registration for new users */
            <form onSubmit={handleSignup} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
                  Tu email
                </label>
                <div className="relative">
                  <Icons.Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="email"
                    value={email}
                    disabled
                    className="w-full pl-11 pr-4 py-3.5 bg-zinc-100 border border-zinc-200 rounded-xl text-zinc-500 cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
                  Creá tu contraseña
                </label>
                <div className="relative">
                  <Icons.Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(null); }}
                    placeholder="Mínimo 6 caracteres"
                    className={`w-full pl-11 pr-4 py-3.5 bg-white border rounded-xl text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 transition-all ${
                      isClientInvite
                        ? 'border-zinc-200 focus:ring-[#2C0405]/15 focus:border-[#2C0405]'
                        : 'border-zinc-200 focus:ring-amber-500/20 focus:border-amber-500'
                    }`}
                    autoFocus
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
                  Repetir contraseña
                </label>
                <div className="relative">
                  <Icons.Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                    placeholder="Repetí la contraseña"
                    className={`w-full pl-11 pr-4 py-3.5 bg-white border rounded-xl text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 transition-all ${
                      isClientInvite
                        ? 'border-zinc-200 focus:ring-[#2C0405]/15 focus:border-[#2C0405]'
                        : 'border-zinc-200 focus:ring-amber-500/20 focus:border-amber-500'
                    }`}
                    required
                  />
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div className="p-3 rounded-xl text-sm bg-red-50 border border-red-200 text-red-700 flex items-center gap-2">
                  <Icons.AlertCircle size={15} className="text-red-500 shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !password || !confirmPassword}
                className={`w-full py-3.5 mt-2 text-white font-medium rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 ${
                  isClientInvite
                    ? 'bg-[#2C0405] hover:bg-[#1a0203] shadow-lg shadow-[#2C0405]/20'
                    : 'bg-zinc-900 hover:bg-zinc-800'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creando cuenta…
                  </>
                ) : (
                  <>
                    Crear cuenta y entrar
                    <Icons.ChevronRight size={16} />
                  </>
                )}
              </button>

              {/* Sign-in escape hatch — opt-in for users who realize they already
                  have an account before submitting. The post-submit fallback in
                  handleSignup also flips them to existingUserFlow if signup
                  errors with "already registered". */}
              <button
                type="button"
                onClick={() => { setExistingUserFlow(true); setPassword(''); setConfirmPassword(''); setError(null); }}
                className="w-full text-center text-xs text-zinc-400 hover:text-zinc-700 transition-colors mt-1"
              >
                ¿Ya tenés cuenta? Iniciá sesión
              </button>
            </form>
          )}

          {/* Footer */}
          <div className="mt-10 pt-8 border-t border-zinc-200 text-center">
            <p className="text-zinc-400 text-xs">
              {existingUserFlow
                ? '¿Necesitás una cuenta nueva? '
                : 'Acceso restringido · Solo por invitación'}
            </p>
            {existingUserFlow && (
              <button
                onClick={() => { setExistingUserFlow(false); setPassword(''); setError(null); }}
                className="text-xs text-[#2C0405] hover:text-[#1a0203] font-medium hover:underline"
              >
                Crear cuenta
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
