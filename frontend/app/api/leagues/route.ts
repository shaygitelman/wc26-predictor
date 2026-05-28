import { cookies } from 'next/headers'
import { SESSION_COOKIE } from '@/lib/session'

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function bearerHeader() {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  return token ? { Authorization: `Bearer ${token}` } : null
}

// GET /api/leagues — fetch the current user's leagues
export async function GET() {
  const auth = await bearerHeader()
  if (!auth) return Response.json([], { status: 200 })

  const res = await fetch(`${API_BASE}/leagues/me`, {
    headers: { ...auth },
    cache: 'no-store',
  })
  const data = await res.json()
  return Response.json(data, { status: res.ok ? 200 : res.status })
}

// POST /api/leagues — create a new league
export async function POST(req: Request) {
  const auth = await bearerHeader()
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await req.json()
  if (!name?.trim()) return Response.json({ error: 'Name is required' }, { status: 400 })

  const res = await fetch(`${API_BASE}/leagues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ name: name.trim() }),
    cache: 'no-store',
  })
  const data = await res.json()
  return Response.json(data, { status: res.ok ? 201 : res.status })
}
