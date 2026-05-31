'use client'

import { useState, useEffect, use, Suspense } from 'react'
import { useGoogleLogin, useGoogleOAuth } from '@react-oauth/google'
import { Trophy, Users, ExternalLink } from 'lucide-react'
import type { AuthUser } from '@/types/auth'
import { trackSignIn, trackLoginPageViewed, trackInviteContextShown } from '@/lib/analytics'

// ─── In-app browser detection ────────────────────────────────
// Google OAuth is intentionally blocked in WebView/in-app browsers
// (LinkedIn, Instagram, Facebook, etc.) — detect and prompt to open externally.
function useIsInAppBrowser(): boolean {
  const [inApp, setInApp] = useState(false)
  useEffect(() => {
    const ua = navigator.userAgent
    setInApp(/LinkedIn|FBAN|FBAV|Instagram|FB_IAB|BytedanceWebview|TikTok|Twitter|Snapchat/.test(ua))
  }, [])
  return inApp
}

function openInExternalBrowser(url: string) {
  const ua = navigator.userAgent
  if (/Android/.test(ua)) {
    // intent:// opens Chrome directly on Android; falls back to system browser
    const clean = url.replace(/^https?:\/\//, '')
    window.location.href =
      `intent://${clean}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`
  } else {
    // x-safari-https:// opens Safari on iOS
    window.location.href = `x-safari-https://${url.replace(/^https?:\/\//, '')}`
  }
}

function InAppBrowserBanner() {
  const url = typeof window !== 'undefined' ? window.location.href : ''
  const [copied, setCopied] = useState(false)

  // Attempt automatic redirect on mount — if the URL scheme is supported the
  // user leaves immediately. If not (scheme blocked), the banner stays visible.
  useEffect(() => {
    if (url) openInExternalBrowser(url)
  // Run once on mount only
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function copyLink() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleOpenBrowser() {
    openInExternalBrowser(url)
  }

  return (
    <div className="w-full max-w-sm flex flex-col items-center gap-6 pt-2">
      {/* Icon */}
      <div className="relative flex items-center justify-center">
        <div
          className="absolute pointer-events-none"
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

      {/* Message */}
      <div className="w-full bg-card border border-primary/25 rounded-2xl overflow-hidden shadow-lg">
        <div className="h-0.5 w-full bg-gradient-to-r from-primary/40 via-primary to-primary/40" />
        <div className="px-5 pt-4 pb-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <ExternalLink className="size-4 text-primary flex-shrink-0" strokeWidth={2} />
            <p className="text-sm font-black text-foreground">Open in your browser to sign in</p>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Google Sign-In doesn&apos;t work inside the LinkedIn app.
            Tap the button below to open in <span className="text-foreground/80 font-semibold">Safari</span> or <span className="text-foreground/80 font-semibold">Chrome</span>.
          </p>
          <button
            onClick={handleOpenBrowser}
            className="w-full mt-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold transition-opacity hover:opacity-90 active:scale-[0.98]"
          >
            Open in Browser
          </button>
          <button
            onClick={copyLink}
            className="w-full py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.12] text-foreground/70 text-sm font-medium transition-opacity hover:opacity-80 active:scale-[0.98]"
          >
            {copied ? '✓ Link Copied!' : 'Copy Link'}
          </button>
        </div>
      </div>

      <p className="text-center text-2xs text-muted-foreground/60 leading-relaxed px-6">
        On iPhone: tap the <span className="font-semibold text-foreground/60">···</span> menu → &quot;Open in Safari&quot;
      </p>
    </div>
  )
}

export interface LeaguePreview {
  name:            string
  memberCount:     number
  creatorUsername: string
  inviteCode:      string
}

function safeNext(raw: string): string {
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/'
  return raw
}

type State = 'idle' | 'loading' | 'error'

// ─── Google auth components ───────────────────────────────────

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

  function handleClick() {
    // Fire-and-forget warmup while the user is interacting with the Google
    // popup. The popup interaction takes ~5-15s; this gives the Render backend
    // time to exit cold-start before /api/auth/google is called.
    fetch('/api/tournament/lock-status').catch(() => {})
    login()
  }

  return <GoogleButton onClick={handleClick} loading={loading} />
}

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

// ─── Invite preview banner — suspends until promise resolves ──
//
// Wrapped in <Suspense fallback={null}> inside LoginPageContent so the
// login shell renders immediately regardless of how long the backend takes.

function LeaguePreviewBanner({ previewPromise }: { previewPromise: Promise<LeaguePreview | null> }) {
  const preview = use(previewPromise)

  useEffect(() => {
    if (preview) {
      trackInviteContextShown({ leagueName: preview.name, memberCount: preview.memberCount })
    }
  // preview is stable once the promise resolves — no repeated firings
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!preview) return null

  return (
    <div className="w-full -mt-3 animate-enter-up" style={{ animationFillMode: 'backwards' }}>
      <div className="w-full bg-card border border-primary/25 rounded-2xl overflow-hidden shadow-lg">
        <div className="h-0.5 w-full bg-gradient-to-r from-primary/40 via-primary to-primary/40" />
        <div className="px-4 pt-3.5 pb-2 flex items-start gap-3">
          <div className="mt-0.5 size-9 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center flex-shrink-0">
            <Trophy className="size-[18px] text-primary" strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-2xs font-bold tracking-[0.12em] uppercase text-primary/70 mb-0.5">
              You&apos;ve been invited
            </p>
            <p className="text-sm font-black text-foreground leading-snug truncate">
              {preview.name}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <Users className="size-3 text-muted-foreground/50 flex-shrink-0" />
              <p className="text-2xs text-muted-foreground/70">
                by {preview.creatorUsername} · {preview.memberCount} member{preview.memberCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>
        <p className="px-4 pb-3.5 text-xs text-muted-foreground/60 leading-relaxed">
          Sign in or create an account and you&apos;ll be added to this league automatically.
        </p>
      </div>
    </div>
  )
}

// ─── Main page content ────────────────────────────────────────

function LoginPageContent({
  rawNext,
  inviteCode,
  previewPromise,
}: {
  rawNext:        string
  inviteCode:     string | null
  previewPromise: Promise<LeaguePreview | null>
}) {
  const [state,  setState]  = useState<State>('idle')
  const [errMsg, setErrMsg] = useState('')
  const next      = safeNext(rawNext)
  const isInApp   = useIsInAppBrowser()

  useEffect(() => {
    trackLoginPageViewed({ hasInviteContext: !!inviteCode })
  }, [inviteCode])

  if (isInApp) {
    return <InAppBrowserBanner />
  }

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
      trackSignIn('google')
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

      {/* ── Invite context banner — streams in without blocking the page ── */}
      <Suspense fallback={null}>
        <LeaguePreviewBanner previewPromise={previewPromise} />
      </Suspense>

      {/* ── Auth CTA ────────────────────────────────────────── */}
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

      {/* ── Footer ──────────────────────────────────────────── */}
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

// ─── Public entry point ───────────────────────────────────────

export function LoginClient({
  rawNext,
  inviteCode,
  previewPromise,
}: {
  rawNext:        string
  inviteCode:     string | null
  previewPromise: Promise<LeaguePreview | null>
}) {
  return (
    <LoginPageContent
      rawNext={rawNext}
      inviteCode={inviteCode}
      previewPromise={previewPromise}
    />
  )
}

// ─── Shared UI atoms ──────────────────────────────────────────

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
