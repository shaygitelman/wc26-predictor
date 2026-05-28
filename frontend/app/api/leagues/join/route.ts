import { cookies } from 'next/headers'
import { SESSION_COOKIE } from '@/lib/session'

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// POST /api/leagues/join — join a league by invite code
export async function POST(req: Request) {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { inviteCode } = await req.json()
  if (!inviteCode?.trim()) return Response.json({ error: 'Invite code is required' }, { status: 400 })

  const res = await fetch(`${API_BASE}/leagues/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    // FastAPI schema uses snake_case invite_code
    body: JSON.stringify({ invite_code: inviteCode.trim().toUpperCase() }),
    cache: 'no-store',
  })
  const data = await res.json()
  return Response.json(data, { status: res.ok ? 200 : res.status })
}
