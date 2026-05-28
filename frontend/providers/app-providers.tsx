'use client'

import { GoogleOAuthProvider } from '@react-oauth/google'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { AuthProvider } from './auth-provider'
import { PostHogProvider } from './posthog-provider'
import type { AuthUser } from '@/types/auth'

interface Props {
  children:     React.ReactNode
  initialUser?: AuthUser | null
}

export function AppProviders({ children, initialUser }: Props) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''

  return (
    <PostHogProvider>
      <GoogleOAuthProvider clientId={clientId}>
        <ThemeProvider attribute="class" defaultTheme="dark">
          <AuthProvider initialUser={initialUser}>
            {children}
          </AuthProvider>
        </ThemeProvider>
      </GoogleOAuthProvider>
    </PostHogProvider>
  )
}
