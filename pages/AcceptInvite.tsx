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
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const queryParams = new URLSearchParams(window.location.search);
  const token = queryParams.get('token');
  const isClientInvite = queryParams.get('portal') === 'client' || inviteType === 'client';

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      setError('The invitation link is not valid. Check the URL.');
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
          setError('Invitation not found or expired.');
        } else if (data.status === 'accepted') {
          setError('This invitation has already been used.');
        } else {
          setEmail(data.email);
          setInviteType(data.type || 'team');
          setIsValidToken(true);
        }
      } catch {
        setError('An error occurred while verifying the invitation.');
      } finally {
        setIsLoading(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
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
        // Session created immediately — wait briefly for the trigger to complete
        // (handle_new_user creates profile, assigns role, links client)
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Verify the profile was created
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, tenant_id')
          .eq('id', authData.session.user.id)
          .single();

        if (!profile) {
          if (import.meta.env.DEV) console.warn('Profile not found after signup — trigger may still be running');
        }

        // Mark invitation as accepted
        if (token) {
          await supabase
            .from('invitations')
            .update({ status: 'accepted', accepted_at: new Date().toISOString() })
            .eq('token', token);
        }

        window.location.href = inviteType === 'client' ? '/?portal=client' : '/';
      } else if (authData.user && !authData.session) {
        // Email confirmation required
        setSuccessMessage(
          'Account created. Check your email to confirm your account before signing in.'
        );
        setIsSubmitting(false);
      } else {
        window.location.href = inviteType === 'client' ? '/?portal=client' : '/auth';
      }
    } catch (err: any) {
      setError(err.message || 'Error registering the account.');
      setIsSubmitting(false);
    }
  };

  /* ─── Loading ─── */
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="flex items-center gap-3 text-zinc-500">
          <div className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
          <span className="text-sm">Verifying invitation...</span>
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
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Check your email</h2>
          <p className="text-sm text-zinc-500 mb-6">{successMessage}</p>
          <a
            href={isClientInvite ? '/?portal=client' : '/auth'}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#2C0405] hover:text-[#1a0203] hover:underline"
          >
            Go to sign in
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
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Invitation error</h2>
          <p className="text-sm text-zinc-500 mb-6">{error}</p>
          <a
            href={isClientInvite ? '/?portal=client' : '/auth'}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:underline"
          >
            Go to sign in
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
                <>Welcome to your <span className="text-[#e8b4b4]">Portal</span></>
              ) : (
                <>Join the <span className="text-amber-500">team</span></>
              )}
            </h1>
            <p className="text-zinc-400 text-lg leading-relaxed max-w-md">
              {isClientInvite
                ? 'Access real-time project tracking. Progress, payments, documents and direct communication with the team.'
                : 'You were invited to collaborate on Eneas OS. Complete your registration to get started.'}
            </p>
          </div>

          {isClientInvite && (
            <div className="space-y-5 mt-8">
              {[
                { icon: '◎', title: 'Live Progress', desc: 'Track your project progress with milestones and timeline.' },
                { icon: '◈', title: 'Payments & Finance', desc: 'Check your payment plan and billing status.' },
                { icon: '⌘', title: 'Secure Documents', desc: 'Access contracts, credentials and project files.' },
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
          <span className={isClientInvite ? 'text-[#e8b4b4]' : 'text-amber-600'}>SECURE PORTAL</span>
          <span className="text-zinc-700">&bull;</span>
          <span>Encrypted data</span>
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
              {isClientInvite ? 'Create your account' : 'Complete your registration'}
            </h2>
            <p className="text-zinc-500 text-sm">
              {isClientInvite
                ? 'Set up your client portal access.'
                : 'You were invited to join the team.'}
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
                Password
              </label>
              <div className="relative">
                <Icons.Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  placeholder="Minimum 6 characters"
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
                Confirm password
              </label>
              <div className="relative">
                <Icons.Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                  placeholder="Repeat password"
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
                  Creating account...
                </>
              ) : (
                <>
                  Create account and access
                  <Icons.ChevronRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-10 pt-8 border-t border-zinc-200 text-center">
            <p className="text-zinc-400 text-xs">
              {isClientInvite
                ? 'Already have an account? '
                : 'Restricted access · Invite only'}
            </p>
            {isClientInvite && (
              <a
                href="/?portal=client"
                className="text-xs text-[#2C0405] hover:text-[#1a0203] font-medium hover:underline"
              >
                Sign in
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
