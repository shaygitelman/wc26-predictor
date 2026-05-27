'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { useEffect, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

function PageViewTracker() {
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (typeof window === 'undefined' || !posthog.__loaded) return
    const url = pathname + (searchParams?.toString() ? `?${searchParams}` : '')
    posthog.capture('$pageview', { $current_url: url })
  }, [pathname, searchParams])

  return null
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key  = process.env.NEXT_PUBLIC_POSTHOG_KEY
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'
    if (!key) return

    posthog.init(key, {
      api_host:              host,
      capture_pageview:      false,   // manual — PageViewTracker does it per-route
      capture_pageleave:     true,
      autocapture:           false,   // opt-in only — avoids capturing sensitive form data
      session_recording:     { maskAllInputs: true },
      persistence:           'localStorage',
      loaded:                ph => { if (process.env.NODE_ENV === 'development') ph.debug() },
    })
  }, [])

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      {children}
    </PHProvider>
  )
}
