import { cookies } from 'next/headers'
import { SESSION_COOKIE } from '@/lib/session'

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return Response.json([], { status: 200 })

  const res = await fetch(`${API_BASE}/leagues/${id}/activity?limit=10`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  const data = await res.json()
  return Response.json(data, { status: res.ok ? 200 : res.status })
}
