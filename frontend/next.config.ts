import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'flagcdn.com',
      },
      {
        protocol: 'https',
        hostname: 'media.api-sports.io',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
}

export default withSentryConfig(nextConfig, {
  // ── Source map upload ──────────────────────────────────────────
  // Set SENTRY_ORG + SENTRY_PROJECT + SENTRY_AUTH_TOKEN in CI to enable.
  // Source maps are uploaded to Sentry and deleted from the build output
  // (hideSourceMaps:true) so they never reach the browser.
  org:     process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  silent: !process.env.CI,          // quiet in local dev, verbose in CI
  widenClientFileUpload: true,      // upload all JS chunks, not just entry points
  disableLogger: true,              // strip Sentry debug logging from the bundle

  // ── Source maps ───────────────────────────────────────────────
  // Upload to Sentry then delete — source maps never reach the browser.
  sourcemaps: {
    filesToDeleteAfterUpload: ['.next/static/**/*.map'],
  },

  // ── Ad-blocker bypass ─────────────────────────────────────────
  // Routes Sentry traffic through our own domain so ad-blockers and
  // mobile privacy browsers don't silently drop events.
  tunnelRoute: '/monitoring-tunnel',

  automaticVercelMonitors: false,   // we don't use Vercel cron monitors
})
