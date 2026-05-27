import * as Sentry from '@sentry/nextjs'

// Minimal init for middleware / edge runtime.
// No integrations that require Node.js APIs.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_APP_ENV ?? 'development',
  tracesSampleRate: 0,
  sendDefaultPii: false,
})
