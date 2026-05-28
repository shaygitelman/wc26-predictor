'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function Error({
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
    <div className="flex flex-col items-center justify-center min-h-dvh px-6 text-center gap-6">
      <div className="text-5xl">⚠️</div>
      <div>
        <h1 className="text-xl font-black text-foreground mb-2">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">We&apos;ve logged the error and will look into it.</p>
      </div>
      <button
        onClick={reset}
        className="px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 active:scale-[0.98] transition-all"
      >
        Try again
      </button>
    </div>
  )
}
