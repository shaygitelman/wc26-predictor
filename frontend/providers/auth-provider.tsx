'use client'

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import type { AuthUser } from '@/types/auth'
import { AUTH_ROUTES } from '@/lib/constants'

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,      setUser]      = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router   = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => setUser(data?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false))
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
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    router.push('/login')
    router.refresh()
  }, [router])

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
