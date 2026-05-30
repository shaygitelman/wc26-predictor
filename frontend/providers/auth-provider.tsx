'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import type { AuthUser } from '@/types/auth'
import { AUTH_ROUTES } from '@/lib/constants'
import { identifyUser, resetIdentity } from '@/lib/analytics'
import { setOnUnauthorized } from '@/lib/api-client'
import * as Sentry from '@sentry/nextjs'

interface AuthContextValue {
  user:        AuthUser | null
  isLoading:   boolean
  logout:      () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user:        null,
  isLoading:   true,
  logout:      async () => {},
  refreshUser: async () => {},
})

export function AuthProvider({
  children,
  initialUser,
}: {
  children:     React.ReactNode
  initialUser?: AuthUser | null
}) {
  const [user,      setUser]      = useState<AuthUser | null>(initialUser ?? null)
  // isLoading stays true until we have a definitive auth state.
  // When initialUser is a real user object (SSR decoded the JWT), we already
  // have the answer — no fetch needed, no loading state.
  // When initialUser is null (SSR JWT decode failed) or undefined (legacy),
  // we must fetch /api/auth/me to discover the real state.
  const [isLoading, setIsLoading] = useState(!initialUser)
  const router   = useRouter()
  const pathname = usePathname()

  // Track whether we currently have an authenticated user so the bfcache
  // handler can decide whether a session check is needed on page restore.
  const userRef = useRef(user)
  useEffect(() => { userRef.current = user }, [user])

  // Register the global 401 interceptor used by apiFetch() in client components.
  // Fires when any authenticated API call comes back with 401 (expired session).
  useEffect(() => {
    setOnUnauthorized(() => {
      const pathname = window.location.pathname
      // Don't redirect if already on an auth page — prevents infinite loops
      // when e.g. /api/auth/me itself returns 401.
      if (AUTH_ROUTES.some((r: string) => pathname.startsWith(r))) return
      setUser(null)
      setIsLoading(false)
      window.location.href = '/login'
    })
  }, [])

  useEffect(() => {
    if (initialUser) {
      // SSR decoded a valid user from the JWT — skip the round-trip entirely.
      identifyUser(initialUser.sub, {
        email:    initialUser.email,
        username: initialUser.username ?? '',
        name:     initialUser.name,
      })
      Sentry.setUser({ id: initialUser.sub, username: initialUser.username ?? undefined })
      return
    }
    // initialUser is null (SSR JWT decode failed, e.g. JWT_SECRET unavailable on
    // this function instance) or undefined (no SSR hydration). Always verify via
    // the API so a failed SSR decode never leaves the client permanently stuck
    // with user=null and no recovery path.
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const u = data?.user ?? null
        setUser(u)
        if (u) {
          identifyUser(u.sub, { email: u.email, username: u.username ?? '', name: u.name })
          Sentry.setUser({ id: u.sub, username: u.username ?? undefined })
        }
      })
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false))
  }, [])

  // Bfcache guard: when the browser restores a page from the back-forward
  // cache (Back/Forward navigation after logout), re-validate the session.
  // We immediately clear auth state on restore so stale authenticated content
  // is never visible — then restore it if the session is still valid.
  useEffect(() => {
    function handlePageShow(ev: PageTransitionEvent) {
      if (!ev.persisted) return        // normal load, not a bfcache restore
      if (!userRef.current) return     // anonymous page — no session to check
      // Optimistically clear to prevent stale auth content flash
      setUser(null)
      setIsLoading(true)
      fetch('/api/auth/me')
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
        .then(data => {
          if (data?.user) {
            setUser(data.user)
            setIsLoading(false)
          } else {
            window.location.replace('/login')
          }
        })
    }
    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [])

  // Onboarding gate: redirect first-time users before they see the app.
  // The current pathname is forwarded as `next` so that after onboarding
  // the user returns to exactly where they were (e.g. /join/ABCD1234).
  useEffect(() => {
    if (isLoading) return
    if (!user) return
    if (user.onboardingCompleted) return
    if (AUTH_ROUTES.some(r => pathname.startsWith(r))) return
    router.replace(`/onboarding?next=${encodeURIComponent(pathname)}`)
  }, [user, isLoading, pathname, router])

  const refreshUser = useCallback(async () => {
    const data = await fetch('/api/auth/me').then(r => r.ok ? r.json() : null).catch(() => null)
    setUser(data?.user ?? null)
  }, [])

  const logout = useCallback(async () => {
    // Best-effort cookie deletion — always navigate even if the API call
    // fails (e.g. Render cold start, network blip). The session will expire
    // naturally; hard navigation destroys all in-memory client state.
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // Intentionally swallowed — proceed to clear client state.
    }
    // Analytics and monitoring must never block the logout navigation.
    try {
      resetIdentity()
      Sentry.setUser(null)
    } catch {
      // Intentionally swallowed.
    }
    // Hard navigation: destroys the component tree cleanly and avoids the
    // concurrent-startTransition conflict caused by router.push + router.refresh
    // both firing during the auth→anon transition (which triggers global-error).
    window.location.href = '/login'
  }, [])

  const value = useMemo(
    () => ({ user, isLoading, logout, refreshUser }),
    [user, isLoading, logout, refreshUser],
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}
