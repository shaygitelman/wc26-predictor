'use client'

import { GoogleOAuthProvider } from '@react-oauth/google'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { AuthProvider } from './auth-provider'
import { PostHogProvider } from './posthog-provider'
import type { AuthUser } from '@/types/auth'

interface Props {
  children:       React.ReactNode
  initialUser?:   AuthUser | null
  googleClientId: string
}

export function AppProviders({ children, initialUser, googleClientId }: Props) {
  return (
    <PostHogProvider>
      <GoogleOAuthProvider clientId={googleClientId}>
        <ThemeProvider attribute="class" defaultTheme="dark">
          <AuthProvider initialUser={initialUser}>
            {children}
          </AuthProvider>
        </ThemeProvider>
      </GoogleOAuthProvider>
    </PostHogProvider>
  )
}
