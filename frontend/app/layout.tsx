import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { AppProviders } from '@/providers/app-providers'
import { ConditionalTabBar } from '@/components/layout/conditional-tab-bar'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'WC26 Predictor',
  description: '2026 FIFA World Cup Prediction Game',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#EEF3FB' },
    { media: '(prefers-color-scheme: dark)',  color: '#060C18' },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="bg-background text-foreground antialiased">
        <AppProviders>
          {children}
          <ConditionalTabBar />
        </AppProviders>
      </body>
    </html>
  )
}
