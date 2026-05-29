import { cookies } from 'next/headers'
import { SESSION_COOKIE, cookieOptions } from '@/lib/session'

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function bearerHeader() {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  return token ? { Authorization: `Bearer ${token}` } : null
}

// POST /api/tournament/onboarding — save picks, mark onboarding done, refresh session JWT
export async function POST(req: Request) {
  const auth = await bearerHeader()
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  const res = await fetch(`${API_BASE}/tournament/onboarding/complete`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body:    JSON.stringify(body),
    cache:   'no-store',
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    return Response.json(data, { status: res.status })
  }

  const { access_token } = await res.json()

  // Replace session cookie with updated JWT that has onboarding_completed: true
  const isDev = process.env.NODE_ENV !== 'production'
  const store = await cookies()
  store.set(SESSION_COOKIE, access_token, cookieOptions(isDev))

  console.log('[tournament] onboarding_complete')
  return Response.json({ ok: true })
}
