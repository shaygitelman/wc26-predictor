'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useGoogleLogin, useGoogleOAuth } from '@react-oauth/google'
import type { AuthUser } from '@/types/auth'

/** Reject non-relative or protocol-relative URLs to prevent open-redirect. */
function safeNext(raw: string | null): string {
  if (!raw) return '/'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/'
  return raw
}

type State = 'idle' | 'loading' | 'error'

// ─── innermost layer: only mounted when clientId is confirmed non-empty ───────
// This is the ONLY component that calls useGoogleLogin. Keeping it isolated
// guarantees initTokenClient is never called with an empty client_id because
// its parent (GoogleLoginGuard) won't render it until clientId is available.
function GoogleLoginButton({
  onSuccess,
  onError,
  loading,
}: {
  onSuccess: (accessToken: string) => void
  onError:   () => void
  loading:   boolean
}) {
  const login = useGoogleLogin({
    onSuccess: response => onSuccess(response.access_token),
    onError,
  })
  return <GoogleButton onClick={() => login()} loading={loading} />
}

// ─── guard layer: reads clientId from context, blocks mount if empty ──────────
// useGoogleOAuth() returns the live context value from GoogleOAuthProvider.
// If clientId is empty the button is rendered disabled and no SDK call is made.
function GoogleLoginGuard({
  onSuccess,
  onError,
  loading,
}: {
  onSuccess: (accessToken: string) => void
  onError:   () => void
  loading:   boolean
}) {
  const { clientId } = useGoogleOAuth()
  if (!clientId) {
    if (typeof window !== 'undefined') {
      console.error('[GoogleAuth] clientId is empty — Google sign-in unavailable. Check GOOGLE_CLIENT_ID env var in Vercel.')
    }
    return <GoogleButton onClick={() => {}} loading={false} disabled={true} />
  }
  return <GoogleLoginButton onSuccess={onSuccess} onError={onError} loading={loading} />
}

function LoginPageContent() {
  const [state,  setState]  = useState<State>('idle')
  const [errMsg, setErrMsg] = useState('')
  const searchParams = useSearchParams()
  const next         = safeNext(searchParams.get('next'))

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
      // Hard navigation: destroys client state so RootLayout re-runs server-side
      // with the new session cookie, giving AuthProvider a fresh initialUser on
      // mount. Same pattern as logout — avoids stale RSC payloads and the
      // refreshUser→setUser race condition that left user=null after soft nav.
      if (user.onboarding_completed === false) {
        window.location.href = `/onboarding?next=${encodeURIComponent(next)}`
      } else {
        window.location.href = next
      }
    } catch (err) {
      setState('error')
      setErrMsg(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  return (
    <div className="w-full max-w-sm flex flex-col items-center gap-9">

      {/* ── Brand hero ──────────────────────────────────── */}
      <div
        className="flex flex-col items-center gap-6 pt-2 animate-enter-up"
        style={{ animationFillMode: 'backwards' }}
      >
        {/* App icon with gold glow */}
        <div className="relative flex items-center justify-center">
          <div
            className="absolute animate-glow-breathe pointer-events-none"
            style={{
              width: 170, height: 170,
              background: 'radial-gradient(ellipse at center, rgba(240,168,12,0.22) 0%, transparent 65%)',
            }}
            aria-hidden="true"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/apple-icon.png"
            alt="MatchPoint26"
            width={88}
            height={88}
            className="relative rounded-[22%]"
            style={{ filter: 'drop-shadow(0 4px 20px rgba(240,168,12,0.35))' }}
          />
        </div>

        {/* Title + tagline */}
        <div
          className="text-center flex flex-col items-center gap-3 animate-enter-up"
          style={{ animationDelay: '70ms', animationFillMode: 'backwards' }}
        >
          <h1 className="text-[36px] font-black leading-none tracking-tight">
            <span className="text-foreground">MatchPoint</span>
            <span className="text-primary">26</span>
          </h1>

          <div className="flex items-center gap-2.5">
            <div
              className="h-px w-10"
              style={{ background: 'linear-gradient(to right, transparent, rgba(240,168,12,0.4))' }}
            />
            <span
              className="text-[10px] font-bold tracking-[0.22em] uppercase"
              style={{ color: 'var(--color-gold-dim)' }}
            >
              FIFA · World Cup · 2026
            </span>
            <div
              className="h-px w-10"
              style={{ background: 'linear-gradient(to left, transparent, rgba(240,168,12,0.4))' }}
            />
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">
            Predict the World Cup.{' '}
            <span className="text-foreground/75 font-semibold">Compete with friends.</span>
          </p>
        </div>
      </div>

      {/* ── Auth CTA ────────────────────────────────────── */}
      <div
        className="w-full flex flex-col gap-3 animate-enter-up"
        style={{ animationDelay: '140ms', animationFillMode: 'backwards' }}
      >
        <GoogleLoginGuard
          onSuccess={handleGoogleSuccess}
          onError={() => { setState('error'); setErrMsg('Google sign-in was cancelled or failed.') }}
          loading={state === 'loading'}
        />
        {state === 'error' && (
          <p className="text-center text-xs text-status-lost animate-fade-in">{errMsg}</p>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────── */}
      <p
        className="text-center text-2xs text-muted-foreground/70 leading-relaxed px-6 animate-fade-in"
        style={{ animationDelay: '210ms', animationFillMode: 'backwards' }}
      >
        By continuing, you agree to our{' '}
        <span className="text-foreground/70 font-medium">Terms of Service</span>
        {' '}and{' '}
        <span className="text-foreground/70 font-medium">Privacy Policy</span>.
      </p>

    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageContent />
    </Suspense>
  )
}

function GoogleButton({ onClick, loading, disabled }: { onClick: () => void; loading: boolean; disabled?: boolean }) {
  const isDisabled = loading || disabled
  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={[
        'w-full flex items-center justify-center gap-3',
        'bg-white/[0.05] border border-white/[0.12]',
        'rounded-2xl px-5 py-[18px]',
        'transition-all duration-200',
        isDisabled
          ? 'opacity-60 cursor-not-allowed'
          : 'hover:bg-white/[0.08] hover:border-primary/40 active:scale-[0.98]',
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
