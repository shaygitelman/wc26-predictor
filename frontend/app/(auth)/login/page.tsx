import { LoginClient, type LeaguePreview } from './login-client'

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface PageProps {
  searchParams: Promise<{ next?: string }>
}

export default async function LoginPage({ searchParams }: PageProps) {
  const params     = await searchParams
  const rawNext    = params.next ?? '/'
  const inviteCode = /^\/join\/([A-Za-z0-9]+)$/.exec(rawNext)?.[1] ?? null

  // Start the preview fetch immediately — do NOT await it.
  // Passing the Promise to the client lets React stream the invite card in
  // as soon as the backend responds, without holding back the page HTML.
  // On a cold Render start this means the login shell renders in ~50ms
  // while the preview arrives asynchronously, eliminating the blank-screen
  // regression that the old `await fetch(...)` approach introduced.
  const previewPromise: Promise<LeaguePreview | null> = inviteCode
    ? fetch(
        `${API_BASE}/leagues/preview/${inviteCode.toUpperCase()}`,
        { cache: 'no-store' },
      )
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    : Promise.resolve(null)

  return (
    <LoginClient
      rawNext={rawNext}
      inviteCode={inviteCode}
      previewPromise={previewPromise}
    />
  )
}
