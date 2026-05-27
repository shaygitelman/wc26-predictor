'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#060C18', color: '#EEF3FB', fontFamily: 'sans-serif' }}>
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '100dvh', padding: '2rem', textAlign: 'center', gap: '1.5rem',
        }}>
          <div style={{ fontSize: '3rem' }}>⚠️</div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 900, margin: '0 0 0.5rem' }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#8B9BB4', margin: 0 }}>
              We've logged the error and will look into it.
            </p>
          </div>
          <button
            onClick={reset}
            style={{
              padding: '0.75rem 1.5rem', borderRadius: '0.75rem',
              background: '#8875FF', color: '#fff', border: 'none',
              fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
