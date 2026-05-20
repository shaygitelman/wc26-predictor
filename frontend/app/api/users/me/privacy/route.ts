import { cookies } from 'next/headers'
import { SESSION_COOKIE } from '@/lib/session'

const API_BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

async function getToken() {
  const store = await cookies()
  return store.get(SESSION_COOKIE)?.value
}

export async function GET() {
  const token = await getToken()
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const res = await fetch(`${API_BASE}/users/me/privacy`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  const data = await res.json()
  return Response.json(data, { status: res.status })
}

export async function PATCH(request: Request) {
  const token = await getToken()
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  const res = await fetch(`${API_BASE}/users/me/privacy`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const data = await res.json()
  return Response.json(data, { status: res.status })
}
