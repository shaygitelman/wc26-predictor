import { cookies } from 'next/headers'
import { SESSION_COOKIE } from '@/lib/session'

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Params { params: Promise<{ id: string }> }

// GET /api/leagues/[id] — league detail (member-only)
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const res = await fetch(`${API_BASE}/leagues/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  const data = await res.json()
  return Response.json(data, { status: res.ok ? 200 : res.status })
}

// DELETE /api/leagues/[id] — delete league (owner only)
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const res = await fetch(`${API_BASE}/leagues/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 204) return new Response(null, { status: 204 })
  const data = await res.json().catch(() => ({ error: 'Unknown error' }))
  return Response.json(data, { status: res.status })
}
