import { cookies } from 'next/headers'
import { SESSION_COOKIE } from '@/lib/session'

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function GET() {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return Response.json([], { status: 200 })

  const res = await fetch(`${API_BASE}/predictions/me`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 0 },
  })
  const data = await res.json()
  return Response.json(data, { status: res.ok ? 200 : res.status })
}
