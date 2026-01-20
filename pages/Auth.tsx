import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Icons } from '../components/ui/Icons'
import { defaultBranding } from '../config/whitelabel'

export const Auth: React.FC<{ onAuthenticated: () => void }> = ({ onAuthenticated }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup' | 'magic'>('signin')
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) onAuthenticated()
    })
    return () => {
      sub.subscription.unsubscribe()
    }
  }, [])

  const handleSubmit = async () => {
    setLoading(true)
    setMessage(null)
    try {
      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({ email })
        if (error) throw error
        setMessage({ text: 'Te enviamos un magic link. Revisá tu email.', type: 'success' })
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMessage({ text: 'Cuenta creada exitosamente. Ya podés iniciar sesión.', type: 'success' })
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        onAuthenticated()
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit()
  }

  const features = [
    { icon: '⌘', title: 'Project Command', desc: 'Real-time KPI tracking and lifecycle management.' },
    { icon: '◈', title: 'Financial Oversight', desc: 'Wall-list monitoring and operational expenses.' },
    { icon: '◎', title: 'Client Infrastructure', desc: 'Secure vaults, legal assets, and portal configuration.' },
  ]

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Dark with branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-zinc-950 text-white flex-col justify-between p-12 relative overflow-hidden">
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-amber-900/10 via-transparent to-transparent" />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-light tracking-wider" style={{ fontFamily: 'serif' }}>
              livv<span className="text-amber-500">~</span>
            </span>
          </div>
        </div>

        {/* Main content */}
        <div className="relative z-10 space-y-8">
          <div>
            <h1
              className="text-4xl font-light leading-tight mb-4"
              style={{ fontFamily: 'serif' }}
            >
              <span className="text-amber-500">Mission</span> Control Center
            </h1>
            <p className="text-zinc-400 text-lg leading-relaxed max-w-md">
              Orchestrate projects, track finances, and manage client infrastructure from a central command node.
            </p>
          </div>

          {/* Features */}
          <div className="space-y-6 mt-12">
            {features.map((feature, idx) => (
              <div key={idx} className="flex items-start gap-4 group">
                <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-amber-500 text-lg group-hover:border-amber-500/50 transition-colors">
                  {feature.icon}
                </div>
                <div>
                  <h3 className="text-sm font-medium text-amber-500">{feature.title}</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 flex items-center gap-2 text-xs text-zinc-600">
          <span>v3.4.0</span>
          <span className="text-zinc-700">•</span>
          <span className="text-amber-600">SYSTEMS OPERATIONAL</span>
        </div>
      </div>

      {/* Right Panel - Cream/beige with form */}
      <div className="flex-1 flex items-center justify-center p-8 lg:p-12" style={{ backgroundColor: '#faf9f7' }}>
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-10">
            <h2
              className="text-3xl font-light text-zinc-800 mb-2"
              style={{ fontFamily: 'serif' }}
            >
              Welcome back
            </h2>
            <p className="text-zinc-500 text-sm">
              Please enter your credentials to continue.
            </p>
          </div>

          {/* Mode tabs - subtle */}
          <div className="flex justify-center gap-6 mb-8">
            {(['signin', 'signup', 'magic'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`text-sm transition-all pb-1 border-b-2 ${mode === m
                    ? 'text-zinc-900 border-amber-500'
                    : 'text-zinc-400 border-transparent hover:text-zinc-600'
                  }`}
              >
                {m === 'signin' ? 'Sign In' : m === 'signup' ? 'Create Account' : 'Magic Link'}
              </button>
            ))}
          </div>

          {/* Form */}
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
                Email
              </label>
              <div className="relative">
                <Icons.Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="admin@livv.studio"
                  className="w-full pl-11 pr-4 py-3.5 bg-white border border-zinc-200 rounded-xl text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                />
              </div>
            </div>

            {mode !== 'magic' && (
              <div className="animate-fade-in">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Password
                  </label>
                  <button className="text-xs text-amber-600 hover:text-amber-700">
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Icons.Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="••••••••••••"
                    className="w-full pl-11 pr-4 py-3.5 bg-white border border-zinc-200 rounded-xl text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full py-3.5 mt-4 bg-zinc-900 text-white font-medium rounded-full hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Processing...
                </>
              ) : (
                <>
                  {mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Magic Link'}
                  <Icons.ChevronRight size={16} />
                </>
              )}
            </button>

            {/* Message display */}
            {message && (
              <div
                className={`p-4 rounded-xl text-sm ${message.type === 'success'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                    : 'bg-red-50 border border-red-200 text-red-700'
                  }`}
              >
                <div className="flex items-center gap-2">
                  {message.type === 'success' ? (
                    <Icons.CheckCircle size={16} className="text-emerald-500" />
                  ) : (
                    <Icons.AlertCircle size={16} className="text-red-500" />
                  )}
                  {message.text}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-10 pt-8 border-t border-zinc-200 text-center">
            <p className="text-zinc-400 text-xs">
              Restricted Access • Invite Only
            </p>
          </div>
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}
