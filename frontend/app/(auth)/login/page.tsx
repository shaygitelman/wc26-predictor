'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useGoogleLogin } from '@react-oauth/google'
import { useAuth } from '@/providers/auth-provider'
import type { AuthUser } from '@/types/auth'

type State = 'idle' | 'loading' | 'error'

export default function LoginPage() {
  const [state,  setState]  = useState<State>('idle')
  const [errMsg, setErrMsg] = useState('')
  const router       = useRouter()
  const searchParams = useSearchParams()
  const next         = searchParams.get('next') ?? '/'
  const { refreshUser } = useAuth()

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
      const { user }: { user: AuthUser & { onboarding_completed?: boolean } } = await res.json()
      if (user.onboarding_completed === false) {
        await refreshUser()
        router.push(`/onboarding?next=${encodeURIComponent(next)}`)
      } else {
        router.push(next)
        router.refresh()
      }
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

      {/* ── Brand hero ──────────────────────────────────── */}
      <div className="flex flex-col items-center gap-7 pt-2">

        {/* Trophy mark */}
        <div
          className="relative flex items-center justify-center animate-enter-up"
          style={{ animationFillMode: 'backwards' }}
        >
          {/* Gold glow behind trophy */}
          <div
            className="absolute animate-glow-breathe pointer-events-none"
            style={{
              width: 140, height: 140,
              background: 'radial-gradient(ellipse at center, rgba(240,168,12,0.18) 0%, transparent 65%)',
            }}
            aria-hidden="true"
          />
          <svg
            width="72" height="80"
            viewBox="0 0 80 90"
            aria-label="Trophy"
            role="img"
          >
            <defs>
              <linearGradient id="trophyGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#FFB91A" />
                <stop offset="55%"  stopColor="#F0A80C" />
                <stop offset="100%" stopColor="#C88A00" />
              </linearGradient>
            </defs>
            {/* Cup body */}
            <path
              d="M14 8 L66 8 L60 42 C57 54 49 62 40 62 C31 62 23 54 20 42 Z"
              fill="url(#trophyGrad)"
            />
            {/* Left handle */}
            <path
              d="M14 8 C6 8 2 15 2 22 C2 33 10 38 15 36"
              fill="none"
              stroke="url(#trophyGrad)"
              strokeWidth="4.5"
              strokeLinecap="round"
            />
            {/* Right handle */}
            <path
              d="M66 8 C74 8 78 15 78 22 C78 33 70 38 65 36"
              fill="none"
              stroke="url(#trophyGrad)"
              strokeWidth="4.5"
              strokeLinecap="round"
            />
            {/* Stem */}
            <rect x="35" y="62" width="10" height="15" rx="2" fill="url(#trophyGrad)" />
            {/* Base */}
            <rect x="21" y="77" width="38" height="8" rx="4" fill="url(#trophyGrad)" />
          </svg>
        </div>

        {/* Title + divider + tagline */}
        <div
          className="text-center flex flex-col items-center gap-3 animate-enter-up"
          style={{ animationDelay: '80ms', animationFillMode: 'backwards' }}
        >
          <h1 className="leading-none tracking-tight">
            <span className="text-[32px] font-black text-foreground">Match</span>
            <span className="text-[32px] font-black text-primary">Point</span>
          </h1>

          <div className="flex items-center gap-2.5">
            <div
              className="h-px w-10"
              style={{ background: 'linear-gradient(to right, transparent, rgba(240,168,12,0.45))' }}
            />
            <span
              className="text-[10px] font-bold tracking-[0.2em] uppercase"
              style={{ color: 'var(--color-gold-dim)' }}
            >World Cup 2026</span>
            <div
              className="h-px w-10"
              style={{ background: 'linear-gradient(to left, transparent, rgba(240,168,12,0.45))' }}
            />
          </div>

          <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
            Predict matches. Compete with friends.{' '}
            <span className="text-foreground/70 font-semibold">Win glory.</span>
          </p>
        </div>
      </div>

      {/* ── Auth CTA ────────────────────────────────────── */}
      <div
        className="w-full flex flex-col gap-4 animate-enter-up"
        style={{ animationDelay: '150ms', animationFillMode: 'backwards' }}
      >
        <GoogleButton
          onClick={() => { setState('idle'); setErrMsg(''); login() }}
          loading={state === 'loading'}
        />
        {state === 'error' && (
          <p className="text-center text-xs text-status-lost animate-fade-in">{errMsg}</p>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────── */}
      <p
        className="text-center text-2xs text-muted-foreground leading-relaxed px-4 animate-fade-in"
        style={{ animationDelay: '220ms', animationFillMode: 'backwards' }}
      >
        By continuing, you agree to our{' '}
        <span className="text-foreground/70 font-medium">Terms of Service</span>
        {' '}and{' '}
        <span className="text-foreground/70 font-medium">Privacy Policy</span>.
      </p>

    </div>
  )
}

function GoogleButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={[
        'w-full flex items-center justify-center gap-3',
        'bg-white/[0.04] border border-white/10',
        'rounded-2xl px-5 py-[18px]',
        'transition-all duration-200',
        loading
          ? 'opacity-60 cursor-not-allowed'
          : 'hover:bg-white/[0.07] hover:border-primary/40 active:scale-[0.98]',
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
