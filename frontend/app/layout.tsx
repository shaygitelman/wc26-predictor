import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { AppProviders } from '@/providers/app-providers'
import { ConditionalTabBar } from '@/components/layout/conditional-tab-bar'
import { getSessionUser } from '@/lib/session'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://wc26-predictor-xi.vercel.app'

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),

  title: {
    default:  'MatchPoint26',
    template: '%s · MatchPoint26',
  },
  description:
    'Predict FIFA World Cup 2026 matches. Compete with friends in private leagues. Win glory.',

  applicationName: 'MatchPoint26',
  keywords: ['World Cup 2026', 'FIFA', 'football predictions', 'soccer', 'MatchPoint26'],
  authors:  [{ name: 'MatchPoint26' }],

  // ── OpenGraph ─────────────────────────────────────────────────
  openGraph: {
    type:        'website',
    url:         APP_URL,
    siteName:    'MatchPoint26',
    title:       'MatchPoint26 — FIFA World Cup 2026 Predictions',
    description:
      'Predict every match. Compete with friends in private leagues. Track your rank in real time.',
    locale:      'en_US',
  },

  // ── Twitter / X card ─────────────────────────────────────────
  twitter: {
    card:        'summary',
    site:        '@MatchPoint26',
    title:       'MatchPoint26 — FIFA World Cup 2026 Predictions',
    description:
      'Predict every match. Compete with friends in private leagues. Track your rank in real time.',
  },

  // ── Robots / canonical ────────────────────────────────────────
  robots: {
    index:                 true,
    follow:                true,
    googleBot: {
      index:               true,
      follow:              true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet':       -1,
    },
  },

  // ── Icons (versioned to bust iOS apple-touch-icon cache) ─────
  icons: {
    apple: [{ url: '/apple-touch-icon.png?v=3', sizes: '180x180', type: 'image/png' }],
  },

  // ── PWA / install hints ───────────────────────────────────────
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable:        true,
    statusBarStyle: 'black-translucent',
    title:          'MatchPoint26',
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width:        'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#EEF3FB' },
    { media: '(prefers-color-scheme: dark)',  color: '#060C18' },
  ],
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const initialUser = await getSessionUser()

  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="bg-background text-foreground antialiased">
        <AppProviders initialUser={initialUser}>
          {children}
          <ConditionalTabBar />
        </AppProviders>
      </body>
    </html>
  )
}
