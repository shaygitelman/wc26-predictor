import { cookies } from 'next/headers'
import { SESSION_COOKIE } from '@/lib/session'

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Params { params: Promise<{ matchId: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { matchId } = await params
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const res = await fetch(`${API_BASE}/predictions/${matchId}/me`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 0 },
  })
  const data = await res.json()
  return Response.json(data, { status: res.status })
}

export async function POST(req: Request, { params }: Params) {
  const { matchId } = await params
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { predictedHome, predictedAway } = await req.json()

  const res = await fetch(`${API_BASE}/predictions/${matchId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ predicted_home: predictedHome, predicted_away: predictedAway }),
    cache: 'no-store',
  })
  const data = await res.json()
  return Response.json(data, { status: res.status })
}
