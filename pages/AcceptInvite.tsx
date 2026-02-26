import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
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

  const queryParams = new URLSearchParams(window.location.search);
  const token = queryParams.get('token');
  const isClientInvite = queryParams.get('portal') === 'client' || inviteType === 'client';

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      setError('El enlace de invitación no es válido. Verificá la URL.');
      return;
    }

    const verifyToken = async () => {
      try {
        const { data, error } = await supabase
          .from('invitations')
          .select('email, status, type')
          .eq('token', token)
          .single();

        if (error || !data) {
          setError('Invitación no encontrada o expirada.');
        } else if (data.status === 'accepted') {
          setError('Esta invitación ya fue utilizada.');
        } else {
          setEmail(data.email);
          setInviteType(data.type || 'team');
          setIsValidToken(true);
        }
      } catch {
        setError('Ocurrió un error al verificar la invitación.');
      } finally {
        setIsLoading(false);
      }
    };

    verifyToken();
  }, [token]);

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
        window.location.href = inviteType === 'client' ? '/?portal=client' : '/';
      } else {
        setError(null);
        window.location.href = inviteType === 'client' ? '/?portal=client' : '/auth';
      }
    } catch (err: any) {
      setError(err.message || 'Error al registrar la cuenta.');
      setIsSubmitting(false);
    }
  };

  /* ─── Loading ─── */
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="flex items-center gap-3 text-zinc-500">
          <div className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
          <span className="text-sm">Verificando invitación...</span>
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
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Error de invitación</h2>
          <p className="text-sm text-zinc-500 mb-6">{error}</p>
          <a
            href={isClientInvite ? '/?portal=client' : '/auth'}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:underline"
          >
            Ir al inicio de sesión
            <Icons.ChevronRight size={14} />
          </a>
        </div>
      </div>
    );
  }

  /* ─── Registration Form ─── */
  return (
    <div className="min-h-screen flex">
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{ backgroundColor: isClientInvite ? '#0a0a0a' : '#09090b' }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/10 via-transparent to-transparent" />

        {/* Logo */}
        <div className="relative z-10">
          <span className="text-2xl font-light tracking-wider text-white" style={{ fontFamily: 'serif' }}>
            livv<span className="text-emerald-500">~</span>
          </span>
        </div>

        {/* Main content */}
        <div className="relative z-10 space-y-6">
          <div>
            <h1 className="text-4xl font-light leading-tight mb-4 text-white" style={{ fontFamily: 'serif' }}>
              {isClientInvite ? (
                <>Bienvenido a tu <span className="text-emerald-500">Portal</span></>
              ) : (
                <>Únete al <span className="text-amber-500">equipo</span></>
              )}
            </h1>
            <p className="text-zinc-400 text-lg leading-relaxed max-w-md">
              {isClientInvite
                ? 'Accedé al seguimiento de tu proyecto en tiempo real. Progreso, pagos, documentos y comunicación directa con el equipo.'
                : 'Fuiste invitado a colaborar en Eneas OS. Completá tu registro para comenzar.'}
            </p>
          </div>

          {isClientInvite && (
            <div className="space-y-5 mt-8">
              {[
                { icon: '◎', title: 'Progreso en vivo', desc: 'Seguí el avance de tu proyecto con milestones y timeline.' },
                { icon: '◈', title: 'Pagos & Finanzas', desc: 'Consultá tu plan de pagos y estado de facturación.' },
                { icon: '⌘', title: 'Documentos seguros', desc: 'Accedé a contratos, credenciales y archivos del proyecto.' },
              ].map((f, i) => (
                <div key={i} className="flex items-start gap-4 group">
                  <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-emerald-500 text-lg group-hover:border-emerald-500/50 transition-colors">
                    {f.icon}
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-emerald-400">{f.title}</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="relative z-10 flex items-center gap-2 text-xs text-zinc-600">
          <span className={isClientInvite ? 'text-emerald-600' : 'text-amber-600'}>PORTAL SEGURO</span>
          <span className="text-zinc-700">&bull;</span>
          <span>Datos encriptados</span>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-8 lg:p-12" style={{ backgroundColor: '#faf9f7' }}>
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-10">
            <div className={`w-14 h-14 ${isClientInvite ? 'bg-emerald-50' : 'bg-amber-50'} rounded-full flex items-center justify-center mx-auto mb-4`}>
              <Icons.Mail size={22} className={isClientInvite ? 'text-emerald-600' : 'text-amber-600'} />
            </div>
            <h2 className="text-3xl font-light text-zinc-800 mb-2" style={{ fontFamily: 'serif' }}>
              {isClientInvite ? 'Creá tu cuenta' : 'Completá tu registro'}
            </h2>
            <p className="text-zinc-500 text-sm">
              {isClientInvite
                ? 'Configurá tu acceso al portal del cliente.'
                : 'Fuiste invitado a unirte al equipo.'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSignup} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
                Email
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
                  placeholder="Mínimo 6 caracteres"
                  className={`w-full pl-11 pr-4 py-3.5 bg-white border rounded-xl text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 transition-all ${
                    isClientInvite
                      ? 'border-zinc-200 focus:ring-emerald-500/20 focus:border-emerald-500'
                      : 'border-zinc-200 focus:ring-amber-500/20 focus:border-amber-500'
                  }`}
                  autoFocus
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
                Confirmar contraseña
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
                      ? 'border-zinc-200 focus:ring-emerald-500/20 focus:border-emerald-500'
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
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/20'
                  : 'bg-zinc-900 hover:bg-zinc-800'
              }`}
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creando cuenta...
                </>
              ) : (
                <>
                  Crear cuenta y acceder
                  <Icons.ChevronRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-10 pt-8 border-t border-zinc-200 text-center">
            <p className="text-zinc-400 text-xs">
              {isClientInvite
                ? '¿Ya tenés cuenta? '
                : 'Acceso restringido · Solo por invitación'}
            </p>
            {isClientInvite && (
              <a
                href="/?portal=client"
                className="text-xs text-emerald-600 hover:text-emerald-700 font-medium hover:underline"
              >
                Iniciar sesión
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
