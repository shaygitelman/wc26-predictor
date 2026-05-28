import type { MetadataRoute } from 'next'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://wc26-predictor-xi.vercel.app'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow:     '/',
        disallow:  ['/api/', '/profile/edit', '/profile/privacy'],
      },
    ],
    sitemap:    `${APP_URL}/sitemap.xml`,
    host:       APP_URL,
  }
}
