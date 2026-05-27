import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Next.js 15 calls onRequestError for every RSC render, Server Action, and
// API route error. We forward it to Sentry's captureRequestError handler.
export const onRequestError = Sentry.captureRequestError
