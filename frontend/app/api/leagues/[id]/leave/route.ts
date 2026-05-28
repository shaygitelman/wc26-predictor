import { cookies } from 'next/headers'
import { SESSION_COOKIE } from '@/lib/session'

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Params { params: Promise<{ id: string }> }

// DELETE /api/leagues/[id]/leave — leave league (non-owner member)
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const res = await fetch(`${API_BASE}/leagues/${id}/leave`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 204) return new Response(null, { status: 204 })
  const data = await res.json().catch(() => ({ error: 'Unknown error' }))
  return Response.json(data, { status: res.status })
}
