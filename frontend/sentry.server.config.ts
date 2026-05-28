import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
  environment: process.env.NEXT_PUBLIC_APP_ENV ?? 'development',

  // Low trace rate server-side — RSC/API routes generate a lot of spans
  tracesSampleRate: process.env.NEXT_PUBLIC_APP_ENV === 'production' ? 0.02 : 1.0,

  // ── Privacy ──────────────────────────────────────────────────────
  sendDefaultPii: false,

  beforeSend(event) {
    const req = event.request ?? {}
    if (req.headers) {
      const h = req.headers as Record<string, string>
      delete h['authorization']
      delete h['cookie']
      delete h['x-session-token']
    }
    return event
  },
})
