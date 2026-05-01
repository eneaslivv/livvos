import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { errorLogger } from '../lib/errorLogger';
import { Icons } from '../components/ui/Icons';

interface ConnectionInfo {
    parent_tenant_name: string;
    parent_tenant_logo: string | null;
    invited_email: string;
    invited_agency_name: string;
    status: string;
}

export const AcceptConnection: React.FC = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [info, setInfo] = useState<ConnectionInfo | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isAccepting, setIsAccepting] = useState(false);
    const [accepted, setAccepted] = useState(false);
    const [signedInEmail, setSignedInEmail] = useState<string | null>(null);

    const token = new URLSearchParams(window.location.search).get('token');

    useEffect(() => {
        if (!token) {
            setError('El link de invitación no tiene token.');
            setIsLoading(false);
            return;
        }

        const verify = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                setSignedInEmail(session?.user?.email ?? null);

                const { data, error: rpcError } = await supabase.rpc('verify_connection_token', { p_token: token });
                if (rpcError) throw rpcError;
                const row = Array.isArray(data) ? data[0] : data;
                if (!row) {
                    setError('Invitación no encontrada o expirada.');
                } else if (row.status !== 'pending') {
                    setError(
                        row.status === 'accepted'
                            ? 'Esta invitación ya fue aceptada.'
                            : `Esta invitación ya no está pendiente (status: ${row.status}).`
                    );
                    setInfo(row as ConnectionInfo);
                } else {
                    setInfo(row as ConnectionInfo);
                }
            } catch (err: any) {
                errorLogger.error('verify_connection_token failed:', err);
                setError(err?.message || 'No pude verificar la invitación.');
            } finally {
                setIsLoading(false);
            }
        };

        verify();
    }, [token]);

    const handleAccept = async () => {
        if (!token || isAccepting) return;
        setIsAccepting(true);
        setError(null);
        try {
            const { data, error: rpcError } = await supabase.rpc('accept_connection', { p_token: token });
            if (rpcError) throw rpcError;
            if ((data as any)?.ok) {
                // Stay on the success screen until the user clicks Continuar.
                // Auto-redirect 2s after acceptance was hiding the welcome
                // message that explains the workspace is brand-new.
                setAccepted(true);
            } else {
                throw new Error('Acceptance failed');
            }
        } catch (err: any) {
            errorLogger.error('accept_connection failed:', err);
            setError(err?.message || 'No pude aceptar la conexión.');
        } finally {
            setIsAccepting(false);
        }
    };

    const handleSignIn = () => {
        const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/auth?return_to=${returnTo}`;
    };

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

    if (accepted) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black p-4">
                <div className="w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-xl">
                    <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Icons.CheckCircle size={24} className="text-emerald-600" />
                    </div>
                    <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 text-center mb-2">
                        ¡Bienvenido{info?.invited_agency_name ? `, ${info.invited_agency_name}` : ''}!
                    </h2>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center mb-6">
                        Tu agencia está conectada con <strong>{info?.parent_tenant_name}</strong>.
                    </p>

                    {/* Explain exactly what the user can/can't see. The previous version
                        just said "redirecting" and confused new agency owners who landed
                        in an empty workspace expecting to see the parent's data. */}
                    <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 mb-6 space-y-3 text-xs">
                        <div className="flex items-start gap-2">
                            <Icons.Check size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                            <div>
                                <div className="font-semibold text-zinc-900 dark:text-zinc-100">Tu workspace empieza vacío</div>
                                <div className="text-zinc-500 dark:text-zinc-400 mt-0.5">
                                    Vas a tener tus propios clientes, proyectos, finanzas y equipo. Nada se mezcla con {info?.parent_tenant_name}.
                                </div>
                            </div>
                        </div>
                        <div className="flex items-start gap-2">
                            <Icons.Check size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                            <div>
                                <div className="font-semibold text-zinc-900 dark:text-zinc-100">{info?.parent_tenant_name} puede entrar a tu workspace</div>
                                <div className="text-zinc-500 dark:text-zinc-400 mt-0.5">
                                    Como agencia padre puede ver y gestionar lo que vos hagas acá. Vos NO ves lo de ellos.
                                </div>
                            </div>
                        </div>
                        <div className="flex items-start gap-2">
                            <Icons.Check size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                            <div>
                                <div className="font-semibold text-zinc-900 dark:text-zinc-100">Próximo paso: invitá a tu equipo</div>
                                <div className="text-zinc-500 dark:text-zinc-400 mt-0.5">
                                    Desde Settings → Team podés sumar a las personas que trabajan con vos.
                                </div>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={() => { window.location.href = '/'; }}
                        className="w-full py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-sm font-semibold hover:opacity-90 flex items-center justify-center gap-2"
                    >
                        Entrar a mi workspace
                        <Icons.ChevronRight size={14} />
                    </button>
                </div>
            </div>
        );
    }

    if (error && !info) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black p-4">
                <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 text-center shadow-xl">
                    <div className="w-14 h-14 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Icons.AlertCircle size={24} className="text-red-500" />
                    </div>
                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Error en la invitación</h2>
                    <p className="text-sm text-zinc-500 mb-6">{error}</p>
                    <a href="/" className="text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:underline">
                        Volver al inicio
                    </a>
                </div>
            </div>
        );
    }

    if (!info) return null;

    const isSignedIn = !!signedInEmail;
    const wrongEmail = isSignedIn && signedInEmail!.toLowerCase() !== info.invited_email.toLowerCase();
    const isAlreadyResolved = info.status !== 'pending';

    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black p-4">
            <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-xl">
                {/* Header */}
                <div className="flex items-center justify-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden">
                        {info.parent_tenant_logo ? (
                            <img src={info.parent_tenant_logo} alt={info.parent_tenant_name} className="max-w-full max-h-full object-contain" />
                        ) : (
                            <span className="text-sm font-bold text-zinc-600 dark:text-zinc-300">
                                {info.parent_tenant_name.slice(0, 2).toUpperCase()}
                            </span>
                        )}
                    </div>
                    <Icons.ChevronRight size={18} className="text-zinc-300 dark:text-zinc-600" />
                    <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                        <Icons.Briefcase size={20} className="text-zinc-500" />
                    </div>
                </div>

                <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 text-center mb-2">
                    {info.parent_tenant_name} te invita a conectarte
                </h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center mb-6">
                    Te invitaron como agencia <strong>{info.invited_agency_name}</strong> ({info.invited_email}) para que tu workspace quede vinculado al de ellos.
                </p>

                {/* Permissions — be explicit about who sees what so the new agency
                    owner does NOT expect to see the parent's data after accepting. */}
                <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 mb-6 space-y-2.5">
                    <div className="flex items-start gap-2.5">
                        <Icons.Check size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                        <span className="text-xs text-zinc-700 dark:text-zinc-300">
                            Tu workspace empieza <strong>vacío</strong> — vas a tener tus propios clientes, proyectos y finanzas.
                        </span>
                    </div>
                    <div className="flex items-start gap-2.5">
                        <Icons.Check size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                        <span className="text-xs text-zinc-700 dark:text-zinc-300">
                            <strong>{info.parent_tenant_name}</strong> puede entrar a tu workspace como admin (es la agencia padre).
                        </span>
                    </div>
                    <div className="flex items-start gap-2.5">
                        <Icons.Close size={14} className="text-zinc-400 mt-0.5 shrink-0" />
                        <span className="text-xs text-zinc-700 dark:text-zinc-300">
                            Vos NO ves los datos de {info.parent_tenant_name}, ni de otras agencias conectadas.
                        </span>
                    </div>
                </div>

                {error && (
                    <div className="mb-4 p-3 rounded-xl text-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 flex items-center gap-2">
                        <Icons.AlertCircle size={14} className="shrink-0" />
                        {error}
                    </div>
                )}

                {isAlreadyResolved ? (
                    <div className="text-center text-sm text-zinc-500">
                        Estado: <span className="font-semibold uppercase tracking-wider">{info.status}</span>
                    </div>
                ) : !isSignedIn ? (
                    <div className="space-y-3">
                        <p className="text-xs text-zinc-500 text-center">
                            Iniciá sesión como <strong>{info.invited_email}</strong> para continuar. Si no tenés cuenta, primero creala con ese email.
                        </p>
                        <button
                            onClick={handleSignIn}
                            className="w-full py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-sm font-semibold hover:opacity-90 flex items-center justify-center gap-2"
                        >
                            Iniciar sesión y aceptar
                            <Icons.ChevronRight size={14} />
                        </button>
                    </div>
                ) : wrongEmail ? (
                    <div className="space-y-3">
                        <div className="p-3 rounded-xl text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
                            Estás logueado como <strong>{signedInEmail}</strong> pero esta invitación es para <strong>{info.invited_email}</strong>.
                        </div>
                        <button
                            onClick={async () => { await supabase.auth.signOut(); handleSignIn(); }}
                            className="w-full py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-sm font-semibold hover:opacity-90"
                        >
                            Cerrar sesión y cambiar de cuenta
                        </button>
                    </div>
                ) : (
                    <div className="flex gap-2">
                        <button
                            onClick={() => { window.location.href = '/'; }}
                            className="flex-1 py-3 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700"
                        >
                            Rechazar
                        </button>
                        <button
                            onClick={handleAccept}
                            disabled={isAccepting}
                            className="flex-1 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isAccepting ? (
                                <>
                                    <Icons.Loader size={14} className="animate-spin" />
                                    Aceptando…
                                </>
                            ) : (
                                <>
                                    Aceptar conexión
                                    <Icons.Check size={14} />
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
