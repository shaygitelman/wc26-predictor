import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name:             'MatchPoint26',
    short_name:       'MatchPoint26',
    description:
      'Predict FIFA World Cup 2026 matches. Compete with friends in private leagues.',
    start_url:        '/',
    display:          'standalone',
    background_color: '#060C18',
    theme_color:      '#060C18',
    orientation:      'portrait-primary',
    icons: [
      {
        src:     '/icon-192.png',
        sizes:   '192x192',
        type:    'image/png',
        purpose: 'maskable',
      },
      {
        src:   '/icon-512.png',
        sizes: '512x512',
        type:  'image/png',
      },
    ],
    categories: ['sports', 'games', 'entertainment'],
  }
}
