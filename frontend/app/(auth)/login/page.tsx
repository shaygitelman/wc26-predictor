'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useGoogleLogin } from '@react-oauth/google'
import type { AuthUser } from '@/types/auth'

type State = 'idle' | 'loading' | 'error'

export default function LoginPage() {
  const [state,  setState]  = useState<State>('idle')
  const [errMsg, setErrMsg] = useState('')
  const router = useRouter()

  async function handleGoogleSuccess(accessToken: string) {
    setState('loading')
    setErrMsg('')

    try {
      const res = await fetch('/api/auth/google', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ accessToken }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Sign-in failed')
      }

      const { user }: { user: AuthUser } = await res.json()
      void user

      router.push('/')
      router.refresh()
    } catch (err) {
      setState('error')
      setErrMsg(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  const login = useGoogleLogin({
    onSuccess: response => handleGoogleSuccess(response.access_token),
    onError:   ()       => { setState('error'); setErrMsg('Google sign-in was cancelled or failed.') },
  })

  return (
    <div className="w-full max-w-sm flex flex-col items-center gap-10">

      {/* ── Brand ───────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-4 pt-4">
        <div className="size-20 rounded-2xl bg-primary-muted flex items-center justify-center border border-primary/20">
          <span className="text-4xl leading-none select-none">⚽</span>
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
            WC26 Predictor
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
            Predict matches. Compete with friends.<br />Win glory.
          </p>
        </div>
      </div>

      {/* ── Auth ────────────────────────────────────────── */}
      <div className="w-full flex flex-col gap-4">
        <GoogleButton
          onClick={() => { setState('idle'); setErrMsg(''); login() }}
          loading={state === 'loading'}
        />

        {state === 'error' && (
          <p className="text-center text-xs text-status-lost animate-fade-in">
            {errMsg}
          </p>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────── */}
      <p className="text-center text-2xs text-muted-foreground leading-relaxed px-4">
        By continuing, you agree to our{' '}
        <span className="text-foreground font-medium">Terms of Service</span>
        {' '}and{' '}
        <span className="text-foreground font-medium">Privacy Policy</span>.
      </p>

    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────

function GoogleButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={[
        'w-full flex items-center justify-center gap-3',
        'bg-card border border-border rounded-2xl',
        'px-5 py-4 transition-all duration-150',
        loading
          ? 'opacity-60 cursor-not-allowed'
          : 'hover:bg-surface-elevated hover:border-primary/30 active:scale-[0.98]',
      ].join(' ')}
    >
      {loading ? <Spinner /> : <GoogleLogo />}
      <span className="text-[15px] font-semibold text-foreground">
        {loading ? 'Signing in…' : 'Continue with Google'}
      </span>
    </button>
  )
}

function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.5 29.4 4.5 24 4.5 12.7 4.5 3.5 13.7 3.5 25S12.7 45.5 24 45.5c10.5 0 19.5-7.6 19.5-20.5 0-1.4-.1-2.7-.4-4z"/>
      <path fill="#FF3D00" d="M6.3 15.1l6.6 4.8C14.6 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.5 29.4 4.5 24 4.5c-7.7 0-14.4 4.4-17.7 10.6z"/>
      <path fill="#4CAF50" d="M24 45.5c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 37 26.8 38 24 38c-5.3 0-9.7-3.5-11.3-8.2l-6.6 5C9.6 41.1 16.3 45.5 24 45.5z"/>
      <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.5l6.2 5.2C40.9 35.3 44 30.6 44 25c0-1.4-.1-2.7-.4-4z"/>
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin size-5 text-muted-foreground" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/>
    </svg>
  )
}
