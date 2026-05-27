import * as Sentry from '@sentry/nextjs'

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn: SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_APP_ENV ?? 'development',

  // ── Sampling ────────────────────────────────────────────────────
  // Errors: always capture (no sampling) — we need every crash
  // Performance traces: 5% in production to keep costs manageable
  tracesSampleRate: process.env.NEXT_PUBLIC_APP_ENV === 'production' ? 0.05 : 1.0,

  // Session replay only fires when an error occurs — no passive recording
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: process.env.NEXT_PUBLIC_APP_ENV === 'production' ? 0.5 : 0,

  // ── Integrations ────────────────────────────────────────────────
  integrations: [
    Sentry.replayIntegration({
      maskAllText:    true,
      blockAllMedia:  true,
      maskAllInputs:  true,
    }),
    Sentry.browserTracingIntegration(),
    Sentry.captureConsoleIntegration({ levels: ['error'] }),
  ],

  // ── Noise reduction ─────────────────────────────────────────────
  // Browser noise that generates no actionable signal
  ignoreErrors: [
    'ResizeObserver loop',
    'Non-Error exception captured',
    'Non-Error promise rejection',
    'Load failed',                     // iOS Safari network blip
    'NetworkError',
    'Failed to fetch',                 // likely an ad-blocker or offline
    'ChunkLoadError',                  // stale deployment — user needs to reload
    'Hydration failed',                // caught by global-error instead
  ],

  // ── Privacy / data filtering ─────────────────────────────────────
  // Never send auth tokens, cookies, or passwords to Sentry
  beforeSend(event) {
    const req = event.request ?? {}

    // Strip sensitive headers
    if (req.headers) {
      const h = req.headers as Record<string, string>
      delete h['authorization']
      delete h['cookie']
      delete h['x-session-token']
    }

    // Strip URL query params that could contain tokens
    if (req.url) {
      try {
        const u = new URL(req.url)
        u.searchParams.delete('token')
        u.searchParams.delete('code')
        req.url = u.toString()
      } catch {}
    }

    return event
  },

  // Send user context (id only — no email) — see auth-provider.tsx for setUser()
  sendDefaultPii: false,
})
