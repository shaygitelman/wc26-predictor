import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { SESSION_COOKIE } from '@/lib/session'
import { JoinClient } from './join-client'

const API_BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

interface LeaguePreview {
  name:            string
  memberCount:     number
  creatorUsername: string
  inviteCode:      string
}

export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params

  // Auth check — unauthenticated users go to login first, then return here
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) {
    redirect(`/login?next=/join/${encodeURIComponent(code)}`)
  }

  // Fetch preview (no auth needed)
  let preview: LeaguePreview | null = null
  try {
    const res = await fetch(
      `${API_BASE}/leagues/preview/${encodeURIComponent(code.toUpperCase())}`,
      { cache: 'no-store' },
    )
    if (res.ok) preview = await res.json()
  } catch {}

  if (!preview) {
    return (
      <div className="flex flex-col min-h-dvh items-center justify-center p-6 gap-4">
        <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-8 flex flex-col gap-4 items-center text-center shadow-xl">
          <p className="text-4xl">🔗</p>
          <h1 className="text-lg font-bold text-foreground">Invalid Invite Link</h1>
          <p className="text-sm text-muted-foreground">
            This invite link is invalid or has expired. Ask the league owner for a fresh link.
          </p>
          <a
            href="/leagues"
            className="mt-2 text-sm font-semibold text-primary hover:opacity-80 transition-opacity"
          >
            Go to My Leagues
          </a>
        </div>
      </div>
    )
  }

  return (
    <JoinClient
      name={preview.name}
      memberCount={preview.memberCount}
      creatorUsername={preview.creatorUsername}
      inviteCode={preview.inviteCode}
    />
  )
}
