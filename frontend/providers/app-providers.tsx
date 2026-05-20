'use client'

import { GoogleOAuthProvider } from '@react-oauth/google'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { AuthProvider } from './auth-provider'

export function AppProviders({ children }: { children: React.ReactNode }) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  if (!clientId) throw new Error('NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set in .env.local')

  return (
    <GoogleOAuthProvider clientId={clientId}>
      <ThemeProvider attribute="class" defaultTheme="dark">
        <AuthProvider>
          {children}
        </AuthProvider>
      </ThemeProvider>
    </GoogleOAuthProvider>
  )
}
