import { cookies } from 'next/headers'
import { SESSION_COOKIE } from '@/lib/session'

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function authHeader() {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  return token ? { Authorization: `Bearer ${token}` } : null
}

export async function GET() {
  const auth = await authHeader()
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const res = await fetch(`${API_BASE}/tournament/picks/me`, {
    headers: { ...auth },
    next: { revalidate: 0 },
  })
  const data = await res.json()
  return Response.json(data, { status: res.status })
}

export async function PUT(req: Request) {
  const auth = await authHeader()
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const payload = {
    winner_team_code: body.winnerId   ?? null,
    top_scorer_id:    body.topScorerId ?? null,
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE}/tournament/picks/me`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify(payload),
      cache: 'no-store',
    })
  } catch (err) {
    console.error('[tournament/picks] fetch error:', err)
    return Response.json({ error: 'Failed to reach backend' }, { status: 502 })
  }

  const data = await res.json()
  if (!res.ok) {
    console.error('[tournament/picks] backend error %d:', res.status, JSON.stringify(data))
  }
  return Response.json(data, { status: res.status })
}
