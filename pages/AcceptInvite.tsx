import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { errorLogger } from '../lib/errorLogger';
import { AuthSplitLayout, type AuthFeature } from '../components/auth/AuthSplitLayout';
import { Eye, EyeOff, ArrowRight, Check, Mail, AlertCircle, ChevronRight } from 'lucide-react';

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
  const [show, setShow] = useState(false);
  const [agree, setAgree] = useState(true);

  const queryParams = new URLSearchParams(window.location.search);
  const token = queryParams.get('token');
  const isClientInvite = queryParams.get('portal') === 'client' || inviteType === 'client';
  const [tenantName, setTenantName] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      setError('This invitation link is invalid. Please check the URL.');
      return;
    }

    const verifyToken = async () => {
      try {
        // Use SECURITY DEFINER RPC to verify token (works without tenant membership)
        const { data, error } = await supabase
          .rpc('verify_invitation_token', { p_token: token });

        const row = Array.isArray(data) ? data[0] : data;

        if (error || !row) {
          setError('Invitation not found or expired.');
        } else if (row.status === 'accepted') {
          // Google/OAuth signups land back here AFTER the handle_new_user
          // trigger already accepted the invitation — that's success.
          const { data: sess } = await supabase.auth.getSession();
          const sessEmail = sess?.session?.user?.email?.toLowerCase();
          if (sessEmail && sessEmail === (row.email || '').toLowerCase()) {
            window.location.href = (row.type === 'client') ? '/?portal=client' : '/';
            return;
          }
          setError('This invitation has already been used.');
        } else {
          setEmail(row.email);
          setInviteType(row.type || 'team');
          setTenantName(row.tenant_name || row.tenant || null);
          setIsValidToken(true);

          // Already signed in (e.g. back from the Google redirect, or an open
          // session for the invited email) — accept directly, no password step.
          const { data: sess } = await supabase.auth.getSession();
          const sessEmail = sess?.session?.user?.email?.toLowerCase();
          if (sessEmail && sessEmail === (row.email || '').toLowerCase()) {
            const { data: result } = await supabase.rpc('accept_invitation', { p_token: token });
            if (result?.success || result?.error === 'Invitation not found or already used') {
              window.location.href = (row.type === 'client') ? '/?portal=client' : '/';
              return;
            }
            setError(result?.error || 'Could not accept the invitation.');
          } else if (sessEmail) {
            setError(`You are signed in as ${sessEmail}, but this invitation is for ${row.email}. Sign out and use the invited account.`);
          }

          // Detect existing-user case up front so the form opens in the right mode
          // and we never surprise the user with a "switch to sign-in" mid-flow.
          try {
            const probe = await supabase.rpc('check_user_exists', { p_email: row.email });
            const exists = Array.isArray(probe.data) ? probe.data[0]?.exists : probe.data?.exists;
            if (exists === true) setExistingUserFlow(true);
          } catch { /* probe is best-effort; the signup-then-fallback path still works */ }
        }
      } catch {
        setError('Something went wrong verifying the invitation.');
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
        // Wait for the handle_new_user trigger to create profile + assign role
        const profileReady = await waitForProfile(authData.session.user.id);

        if (!profileReady) {
          errorLogger.error('Profile not created after signup', {
            userId: authData.session.user.id,
            token,
          });
          setError('Your account was created but setup is taking a moment. Try signing in again in a few seconds.');
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
          'Account created. Check your email to confirm it before signing in.'
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
        setError(message || 'Could not create the account.');
      }
      setIsSubmitting(false);
    }
  };

  // Google OAuth — redirects back to this page with a session; the mount
  // effect (or the handle_new_user trigger for brand-new users) finishes
  // the acceptance.
  const handleGoogle = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/accept-invite?token=${token}` },
      });
      if (oauthError) throw oauthError;
      // The browser navigates away to Google from here.
    } catch (err: any) {
      setError(err.message || 'Could not start Google sign-in.');
      setIsSubmitting(false);
    }
  };

  // Sign-in flow for existing users
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Enter your password.');
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
      setError(err.message || 'Could not sign in.');
      setIsSubmitting(false);
    }
  };

  const initials = (email || '?').replace(/@.*/, '').slice(0, 2).toUpperCase() || (email || '?').slice(0, 2).toUpperCase();

  /* ─── Centered status card (loading / success / error) ─── */
  const StatusCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#FDFBF7', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 380, textAlign: 'center', background: '#fff', border: '1px solid #E6E2D8', borderRadius: 24, padding: 36, boxShadow: '0 1px 2px rgba(44,4,5,0.04)' }}>
        {children}
      </div>
    </div>
  );

  /* ─── Loading ─── */
  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#FDFBF7' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#78736A' }}>
          <div className="animate-spin" style={{ width: 20, height: 20, border: '2px solid #E6E2D8', borderTopColor: '#2C0405', borderRadius: 9999 }} />
          <span style={{ fontSize: 14 }}>Verifying invitation…</span>
        </div>
      </div>
    );
  }

  /* ─── Success (email confirmation needed) ─── */
  if (successMessage) {
    return (
      <StatusCard>
        <div style={{ width: 56, height: 56, borderRadius: 9999, background: 'rgba(44,4,5,0.05)', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
          <Mail size={24} className="text-[#2C0405]" />
        </div>
        <h2 className="pa-h" style={{ fontSize: 22, marginBottom: 8 }}>Check your email</h2>
        <p className="pa-sub" style={{ color: '#78736A', marginBottom: 24 }}>{successMessage}</p>
        <a href={isClientInvite ? '/?portal=client' : '/auth'} className="pa-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
          Go to sign in <ChevronRight size={14} />
        </a>
      </StatusCard>
    );
  }

  /* ─── Error (invalid token) ─── */
  if (error && !isValidToken) {
    return (
      <StatusCard>
        <div style={{ width: 56, height: 56, borderRadius: 9999, background: '#FBEAEA', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
          <AlertCircle size={24} className="text-rose-500" />
        </div>
        <h2 className="pa-h" style={{ fontSize: 22, marginBottom: 8 }}>Invitation problem</h2>
        <p className="pa-sub" style={{ color: '#78736A', marginBottom: 24 }}>{error}</p>
        <a href={isClientInvite ? '/?portal=client' : '/auth'} className="pa-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
          Go to sign in <ChevronRight size={14} />
        </a>
      </StatusCard>
    );
  }

  /* ─── Invite form (split layout) ─── */
  const clientFeatures: AuthFeature[] = [
    { icon: 'progress', title: 'Live progress', desc: 'Follow every phase, task, and milestone in real time.' },
    { icon: 'payments', title: 'Payments', desc: "Your full schedule — what's paid, pending, and next." },
    { icon: 'docs', title: 'Secure documents', desc: 'Contracts, deliverables, and credentials in one place.' },
  ];
  const teamFeatures: AuthFeature[] = [
    { icon: 'command', title: 'Project command', desc: 'Boards, tasks, and timelines across every client.' },
    { icon: 'finance', title: 'Finance & clients', desc: 'Pipeline, payments, and the full client picture.' },
    { icon: 'infra', title: 'One workspace', desc: 'Calendar, docs, and the team in a single place.' },
  ];

  const errorBox = error ? (
    <div style={{ padding: '10px 12px', borderRadius: 12, fontSize: 13, background: '#FBEAEA', border: '1px solid #F2C9C9', color: '#9B2C2C', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
      <AlertCircle size={15} style={{ flex: 'none' }} />
      {error}
    </div>
  ) : null;

  const spinner = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span className="animate-spin" style={{ width: 16, height: 16, border: '2px solid rgba(237,229,216,0.4)', borderTopColor: '#EDE5D8', borderRadius: 9999, display: 'inline-block' }} />
      {existingUserFlow ? 'Signing in…' : 'Creating account…'}
    </span>
  );

  const googleButton = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 14px' }}>
        <span style={{ flex: 1, height: 1, background: '#E6E2D8' }} />
        <span style={{ fontSize: 11, color: '#78736A', letterSpacing: '0.08em' }}>OR</span>
        <span style={{ flex: 1, height: 1, background: '#E6E2D8' }} />
      </div>
      <button
        type="button" onClick={handleGoogle} disabled={isSubmitting}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          padding: '12px 16px', borderRadius: 12, border: '1px solid #E6E2D8', background: '#fff',
          color: '#09090B', fontSize: 14, fontWeight: 500, cursor: 'pointer',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
          <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
          <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z" />
          <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 12.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
        </svg>
        Continue with Google
      </button>
      <p style={{ fontSize: 11.5, color: '#78736A', marginTop: 8, textAlign: 'center' }}>
        Use the Google account for {email}
      </p>
    </>
  );

  return (
    <AuthSplitLayout
      eyebrow={isClientInvite ? '© CLIENT PORTAL ポータル' : '© JOIN THE TEAM ポータル'}
      headline={isClientInvite ? <>Your studio space,<br />built around you.</> : <>Build alongside<br />the team.</>}
      subtitle={isClientInvite
        ? 'A calm, single place to follow your project with Livv — progress, payments, files, and a direct line to the team.'
        : `You've been invited to collaborate${tenantName ? ` in ${tenantName}` : ''}. One workspace for projects, clients, and the team.`}
      features={isClientInvite ? clientFeatures : teamFeatures}
    >
      {/* Invited-as chip */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 26 }}>
        <span className="pa-avatar" style={{ width: 32, height: 32, background: '#F5F2EB', color: '#2C0405', border: '1px solid #E6E2D8' }}>{initials}</span>
        <div style={{ fontSize: 12.5, color: '#78736A', lineHeight: 1.35 }}>
          Invited as<br /><strong style={{ color: '#09090B', fontWeight: 500 }}>{email}</strong>
        </div>
      </div>

      <p className="pa-eyebrow" style={{ marginBottom: 10 }}>
        {existingUserFlow ? 'SIGN IN TO ACCEPT' : isClientInvite ? 'WELCOME TO YOUR PORTAL' : 'COMPLETE YOUR SIGN-UP'}
      </p>
      <h2 className="pa-h" style={{ fontSize: 32 }}>
        {existingUserFlow ? 'Sign in to accept' : 'Create your password'}
      </h2>
      <p className="pa-sub" style={{ color: '#5A3E3E', marginTop: 8, marginBottom: 28 }}>
        {existingUserFlow
          ? `There's already an account for ${email}. Enter your password to accept${tenantName ? ` the invitation to ${tenantName}` : ''}.`
          : isClientInvite
            ? `One last step to access${tenantName ? ` the ${tenantName}` : ' your'} project space.`
            : `Create a password to join${tenantName ? ` ${tenantName}` : ' the team'}. Takes 30 seconds.`}
      </p>

      {existingUserFlow ? (
        /* Existing-user sign-in */
        <form onSubmit={handleSignIn}>
          <label className="pa-eyebrow" style={{ display: 'block', marginBottom: 8 }}>EMAIL</label>
          <input className="pa-field" type="email" value={email} disabled style={{ marginBottom: 16, opacity: 0.7 }} />
          <label className="pa-eyebrow" style={{ display: 'block', marginBottom: 8 }}>PASSWORD</label>
          <input
            className="pa-field" type="password" value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            placeholder="Your password" style={{ marginBottom: 18 }} autoFocus required
          />
          {errorBox}
          <button type="submit" className="pa-btn pa-btn-wine" disabled={isSubmitting || !password}>
            {isSubmitting ? spinner : <>Sign in & accept <ArrowRight size={16} /></>}
          </button>
          {googleButton}
          <button type="button" className="pa-link" style={{ display: 'block', margin: '16px auto 0', fontSize: 12.5 }}
            onClick={() => { setExistingUserFlow(false); setPassword(''); setError(null); }}>
            Back to sign-up
          </button>
        </form>
      ) : (
        /* New-user create-password */
        <form onSubmit={handleSignup}>
          <label className="pa-eyebrow" style={{ display: 'block', marginBottom: 8 }}>PASSWORD</label>
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <input
              className="pa-field" type={show ? 'text' : 'password'} value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              placeholder="At least 6 characters" style={{ paddingRight: 44 }} autoFocus required
            />
            <button type="button" className="pa-icon-btn" onClick={() => setShow(s => !s)} aria-label="Toggle password"
              style={{ position: 'absolute', right: 6, top: 6 }}>
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <label className="pa-eyebrow" style={{ display: 'block', marginBottom: 8 }}>CONFIRM PASSWORD</label>
          <input
            className="pa-field" type={show ? 'text' : 'password'} value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
            placeholder="Re-enter password" style={{ marginBottom: 18 }} required
          />
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 24 }}>
            <span className="pa-checkc" data-done={agree} onClick={() => setAgree(a => !a)} style={{ marginTop: 1 }}>
              <Check size={11} strokeWidth={3} />
            </span>
            <span style={{ fontSize: 12.5, color: '#5A3E3E', lineHeight: 1.5 }}>
              I agree to the <span className="pa-link">Terms</span> and acknowledge the <span className="pa-link">Privacy Policy</span>.
            </span>
          </label>
          {errorBox}
          <button type="submit" className="pa-btn pa-btn-wine" disabled={isSubmitting || !password || !confirmPassword || !agree}>
            {isSubmitting ? spinner : <>Enter your portal <ArrowRight size={16} /></>}
          </button>
          {googleButton}
          <p style={{ textAlign: 'center', fontSize: 12.5, color: '#78736A', marginTop: 18 }}>
            Already set up? <button type="button" className="pa-link" onClick={() => { setExistingUserFlow(true); setPassword(''); setConfirmPassword(''); setError(null); }}>Sign in</button>
          </p>
        </form>
      )}
    </AuthSplitLayout>
  );
};
