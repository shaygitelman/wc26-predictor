import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, decrypt } from '@/lib/session'
import { JoinClient } from './join-client'

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface LeaguePreview {
  name:            string
  memberCount:     number
  creatorUsername: string
  inviteCode:      string
}

interface LeagueOut {
  id: string
  [key: string]: unknown
}

export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const upperCode = code.toUpperCase()

  // Auth check — unauthenticated users go to login first, then return here
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) {
    redirect(`/login?next=/join/${encodeURIComponent(code)}`)
  }

  // Validate the JWT — an expired/tampered token should re-authenticate rather
  // than loading the page and failing only when the user clicks Join.
  const payload = await decrypt(token)
  if (!payload) {
    redirect(`/login?next=/join/${encodeURIComponent(code)}`)
  }

  // Auto-join: attempt the join server-side so authenticated users (both new
  // arrivals and existing members) are redirected instantly with no extra click.
  // ON CONFLICT DO NOTHING on the backend means already-members are handled the
  // same way — they land on the league page immediately.
  let joinError: string | null = null
  try {
    const joinRes = await fetch(`${API_BASE}/leagues/join`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${token}`,
      },
      body:  JSON.stringify({ invite_code: upperCode }),
      cache: 'no-store',
    })

    if (joinRes.ok) {
      const league: LeagueOut = await joinRes.json()
      redirect(`/leagues/${league.id}`)
    }

    if (joinRes.status === 401 || joinRes.status === 403) {
      // Backend rejected the token — force re-authentication
      redirect(`/login?next=/join/${encodeURIComponent(code)}`)
    }

    if (joinRes.status === 404) {
      // Invalid invite code — don't bother fetching preview
      return <InvalidInviteCard />
    }

    // Unexpected error — fall through to show JoinClient as a manual fallback
    const errData = await joinRes.json().catch(() => ({}))
    joinError = (errData as { detail?: string }).detail ?? 'Could not join league. Please try again.'
  } catch {
    joinError = 'Network error — please try again.'
  }

  // Fallback: fetch preview so JoinClient can show league details alongside the retry button
  let preview: LeaguePreview | null = null
  try {
    const res = await fetch(
      `${API_BASE}/leagues/preview/${encodeURIComponent(upperCode)}`,
      { cache: 'no-store' },
    )
    if (res.ok) preview = await res.json()
  } catch {}

  if (!preview) return <InvalidInviteCard />

  return (
    <JoinClient
      name={preview.name}
      memberCount={preview.memberCount}
      creatorUsername={preview.creatorUsername}
      inviteCode={preview.inviteCode}
      initialError={joinError}
    />
  )
}

function InvalidInviteCard() {
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
