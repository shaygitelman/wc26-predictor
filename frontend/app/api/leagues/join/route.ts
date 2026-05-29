import { cookies } from 'next/headers'
import { SESSION_COOKIE } from '@/lib/session'
import * as Sentry from '@sentry/nextjs'

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// POST /api/leagues/join — join a league by invite code
export async function POST(req: Request) {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { inviteCode } = await req.json()
  if (!inviteCode?.trim()) return Response.json({ error: 'Invite code is required' }, { status: 400 })

  const upperCode = inviteCode.trim().toUpperCase()
  try {
    const res = await fetch(`${API_BASE}/leagues/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      // FastAPI schema uses snake_case invite_code
      body: JSON.stringify({ invite_code: upperCode }),
      cache: 'no-store',
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      console.log('[leagues] joined id=%s code=%s', data.id, upperCode)
    } else {
      console.error('[leagues] join failed code=%s status=%d', upperCode, res.status, data)
    }
    return Response.json(data, { status: res.ok ? 200 : res.status })
  } catch (err) {
    console.error('[leagues] join network error code=%s', upperCode, err)
    Sentry.captureException(err, { extra: { inviteCode: upperCode } })
    return Response.json({ detail: 'Could not reach server. Please try again.' }, { status: 502 })
  }
}
