import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { AuthSplitLayout, type AuthFeature } from '../components/auth/AuthSplitLayout'
import { Eye, EyeOff, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react'

interface AuthProps {
  onAuthenticated: () => void
  isClientPortal?: boolean
}

export const Auth: React.FC<AuthProps> = ({ onAuthenticated, isClientPortal = false }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [mode, setMode] = useState<'signin' | 'signup' | 'magic' | 'forgot'>('signin')
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [loading, setLoading] = useState(false)
  const [tenantName, setTenantName] = useState<string | null>(null)

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) onAuthenticated()
    })
    return () => { sub.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    supabase.rpc('get_tenant_branding')
      .then(({ data }) => {
        const tenant = Array.isArray(data) ? data[0] : data
        if (tenant?.name) setTenantName(tenant.name)
      })
  }, [])

  // Read the optional ?return_to=… so OAuth (and any future SSO) can land
  // the user back on the exact page they came from.
  const returnTo = (() => {
    try {
      const raw = new URLSearchParams(window.location.search).get('return_to');
      if (!raw) return null;
      const decoded = decodeURIComponent(raw);
      return decoded.startsWith('/') ? decoded : null;
    } catch { return null; }
  })();

  const oauthRedirect = `${window.location.origin}${returnTo || (isClientPortal ? '/?portal=client' : '/')}`;

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: oauthRedirect,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setMessage({
        text: err?.message || 'Google sign-in unavailable — make sure the provider is enabled in Supabase Auth → Providers.',
        type: 'error',
      });
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setLoading(true)
    setMessage(null)
    try {
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}${isClientPortal ? '/?portal=client' : ''}`,
        })
        if (error) throw error
        setMessage({ text: 'We sent you a password reset link. Check your email.', type: 'success' })
      } else if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({ email })
        if (error) throw error
        setMessage({ text: 'We sent you a magic link. Check your email.', type: 'success' })
      } else if (mode === 'signup') {
        if (password.length < 6) throw new Error('Password must be at least 6 characters')
        const { data: signUpData, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (isClientPortal && signUpData?.user?.id) {
          await supabase
            .from('clients')
            .update({ auth_user_id: signUpData.user.id })
            .eq('email', email)
            .is('auth_user_id', null)
          if (signUpData.session) { onAuthenticated(); return }
        }
        setMessage({ text: 'Account created. You can now sign in.', type: 'success' })
      } else {
        const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        if (isClientPortal && signInData?.user?.id) {
          await supabase
            .from('clients')
            .update({ auth_user_id: signInData.user.id })
            .eq('email', email)
            .is('auth_user_id', null)
        }
        onAuthenticated()
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSubmit() }

  const clientFeatures: AuthFeature[] = [
    { icon: 'progress', title: 'Live progress', desc: 'Follow every phase, task, and milestone in real time.' },
    { icon: 'payments', title: 'Payments', desc: "Your full schedule — what's paid, pending, and next." },
    { icon: 'docs', title: 'Secure documents', desc: 'Contracts, deliverables, and credentials in one place.' },
  ]
  const platformFeatures: AuthFeature[] = [
    { icon: 'command', title: 'Project command', desc: 'Boards, tasks, and timelines across every client.' },
    { icon: 'finance', title: 'Finance & clients', desc: 'Pipeline, payments, and the full client picture.' },
    { icon: 'infra', title: 'One workspace', desc: 'Calendar, docs, portals, and the team in one place.' },
  ]

  const cfg = isClientPortal
    ? {
        eyebrow: '© CLIENT PORTAL ポータル',
        headline: <>Your studio space,<br />built around you.</>,
        subtitle: 'A calm, single place to follow your project with Livv — progress, payments, files, and a direct line to the team.',
        features: clientFeatures,
        formEyebrow: 'CLIENT PORTAL',
        formSubtitle: 'Sign in to access your project space.',
        emailPlaceholder: 'you@email.com',
        showMagic: false,
        footer: 'SECURE PORTAL · ENCRYPTED',
        primaryLabel: { signin: 'Enter your portal', signup: 'Create account', magic: 'Send magic link', forgot: 'Send reset link' } as const,
      }
    : {
        eyebrow: '© LIVV OS ポータル',
        headline: <>Run the studio,<br />end to end.</>,
        subtitle: 'Projects, clients, finance, and the team — one calm command surface for the whole studio.',
        features: platformFeatures,
        formEyebrow: tenantName ? tenantName.toUpperCase() : 'LIVV OS',
        formSubtitle: 'Enter your credentials to continue.',
        emailPlaceholder: 'you@livv.studio',
        showMagic: true,
        footer: 'RESTRICTED ACCESS · INVITE ONLY',
        primaryLabel: { signin: 'Sign in', signup: 'Create account', magic: 'Send magic link', forgot: 'Send reset link' } as const,
      }

  const tabs: ('signin' | 'signup' | 'magic')[] = cfg.showMagic ? ['signin', 'signup', 'magic'] : ['signin', 'signup']
  const tabLabel = (m: string) => (m === 'signin' ? 'Sign in' : m === 'signup' ? 'Create account' : 'Magic link')
  const showPassword = mode === 'signin' || mode === 'signup'

  const spinner = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span className="animate-spin" style={{ width: 16, height: 16, border: '2px solid rgba(237,229,216,0.4)', borderTopColor: '#EDE5D8', borderRadius: 9999, display: 'inline-block' }} />
      Processing…
    </span>
  )

  return (
    <AuthSplitLayout
      eyebrow={cfg.eyebrow}
      headline={cfg.headline}
      subtitle={cfg.subtitle}
      features={cfg.features}
      footer={cfg.footer}
    >
      <p className="pa-eyebrow" style={{ marginBottom: 10 }}>{cfg.formEyebrow}</p>
      <h2 className="pa-h" style={{ fontSize: 32 }}>Welcome back</h2>
      <p className="pa-sub" style={{ color: '#5A3E3E', marginTop: 8, marginBottom: 26 }}>{cfg.formSubtitle}</p>

      {/* Tabs */}
      {mode !== 'forgot' && (
        <div style={{ display: 'flex', gap: 22, marginBottom: 24 }}>
          {tabs.map((m) => (
            <button key={m} className="pa-tab" data-active={mode === m} onClick={() => { setMode(m); setMessage(null); }}>
              {tabLabel(m)}
            </button>
          ))}
        </div>
      )}

      {/* Google */}
      {mode !== 'forgot' && (
        <>
          <button type="button" className="pa-btn pa-btn-ghost" onClick={handleGoogleSignIn} disabled={loading} style={{ marginBottom: 14 }}>
            <GoogleLogo /> Continue with Google
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 18px' }}>
            <span style={{ flex: 1, height: 1, background: '#E6E2D8' }} />
            <span className="pa-eyebrow" style={{ fontSize: 9 }}>or with email</span>
            <span style={{ flex: 1, height: 1, background: '#E6E2D8' }} />
          </div>
        </>
      )}

      {/* Email */}
      <label className="pa-eyebrow" style={{ display: 'block', marginBottom: 8 }}>EMAIL</label>
      <input
        className="pa-field" type="email" value={email}
        onChange={(e) => setEmail(e.target.value)} onKeyDown={handleKeyDown}
        placeholder={cfg.emailPlaceholder} style={{ marginBottom: showPassword ? 16 : 18 }} autoFocus
      />

      {/* Password */}
      {showPassword && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label className="pa-eyebrow">PASSWORD</label>
            {mode === 'signin' && (
              <button type="button" className="pa-link" style={{ fontSize: 11, textDecoration: 'none' }} onClick={() => { setMode('forgot'); setMessage(null); }}>
                Forgot?
              </button>
            )}
          </div>
          <div style={{ position: 'relative', marginBottom: 18 }}>
            <input
              className="pa-field" type={show ? 'text' : 'password'} value={password}
              onChange={(e) => setPassword(e.target.value)} onKeyDown={handleKeyDown}
              placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••••••'} style={{ paddingRight: 44 }}
            />
            <button type="button" className="pa-icon-btn" onClick={() => setShow(s => !s)} aria-label="Toggle password" style={{ position: 'absolute', right: 6, top: 6 }}>
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </>
      )}

      {mode === 'forgot' && (
        <p className="pa-sub" style={{ color: '#78736A', fontSize: 13, marginBottom: 18 }}>
          Enter your email and we'll send a link to reset your password.
        </p>
      )}

      {/* Submit */}
      <button className="pa-btn pa-btn-wine" onClick={handleSubmit} disabled={loading}>
        {loading ? spinner : <>{cfg.primaryLabel[mode]} <ArrowRight size={16} /></>}
      </button>

      {/* Message */}
      {message && (
        <div style={{
          marginTop: 16, padding: '11px 13px', borderRadius: 12, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
          background: message.type === 'success' ? 'rgba(44,4,5,0.05)' : '#FBEAEA',
          border: message.type === 'success' ? '1px solid rgba(44,4,5,0.15)' : '1px solid #F2C9C9',
          color: message.type === 'success' ? '#2C0405' : '#9B2C2C',
        }}>
          {message.type === 'success' ? <CheckCircle2 size={15} style={{ flex: 'none' }} /> : <AlertCircle size={15} style={{ flex: 'none' }} />}
          {message.text}
        </div>
      )}

      {mode === 'forgot' && (
        <button type="button" className="pa-link" style={{ display: 'block', margin: '16px auto 0', fontSize: 12.5 }} onClick={() => { setMode('signin'); setMessage(null); }}>
          ← Back to sign in
        </button>
      )}

      <div style={{ marginTop: 28, paddingTop: 22, borderTop: '1px solid #E6E2D8', textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: '#A8A29A' }}>
          {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
          <button type="button" className="pa-link" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setMessage(null); }}>
            {mode === 'signup' ? 'Sign in' : 'Create one'}
          </button>
        </p>
      </div>
    </AuthSplitLayout>
  )
}

// Inline SVG of the official Google "G" mark.
const GoogleLogo: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
    <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
  </svg>
);
