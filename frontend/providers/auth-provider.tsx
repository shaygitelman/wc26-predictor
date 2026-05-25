'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import type { AuthUser } from '@/types/auth'
import { AUTH_ROUTES } from '@/lib/constants'

interface AuthContextValue {
  user:      AuthUser | null
  isLoading: boolean
  logout:    () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user:      null,
  isLoading: true,
  logout:    async () => {},
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

  // Gate: redirect to onboarding if user hasn't completed it
  useEffect(() => {
    if (isLoading) return
    if (!user) return
    if (user.onboardingCompleted) return
    const onAuthRoute = AUTH_ROUTES.some(r => pathname.startsWith(r))
    if (onAuthRoute) return
    router.replace('/onboarding')
  }, [user, isLoading, pathname, router])

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    router.push('/login')
    router.refresh()
  }, [router])

  return (
    <AuthContext.Provider value={{ user, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}
