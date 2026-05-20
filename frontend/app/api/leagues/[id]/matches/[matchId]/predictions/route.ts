import { cookies } from 'next/headers'
import { SESSION_COOKIE } from '@/lib/session'

const API_BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

async function bearerHeader() {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  return token ? { Authorization: `Bearer ${token}` } : null
}

interface Params { params: Promise<{ id: string; matchId: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id: leagueId, matchId } = await params
  const auth = await bearerHeader()
  if (!auth) return Response.json([], { status: 200 })

  const res = await fetch(
    `${API_BASE}/leagues/${leagueId}/matches/${matchId}/predictions`,
    { headers: { ...auth }, cache: 'no-store' },
  )
  const data = await res.json()
  return Response.json(data, { status: res.ok ? 200 : res.status })
}
