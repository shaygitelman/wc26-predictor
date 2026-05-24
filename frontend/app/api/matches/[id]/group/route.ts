import type { ApiGroupStandings } from '@/types/standings'

const API_BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params

  try {
    const matchRes = await fetch(`${API_BASE}/matches/${id}`, { next: { revalidate: 60 } })
    if (!matchRes.ok) return Response.json({ error: 'Match not found' }, { status: 404 })
    const match = await matchRes.json() as { round: string; group?: string; status?: string }

    if (match.round !== 'group' || !match.group) {
      return Response.json({ error: 'Not a group stage match' }, { status: 404 })
    }

    const isLive = match.status === 'live'
    const standingsRes = await fetch(`${API_BASE}/groups/standings`, {
      next: { revalidate: isLive ? 30 : 300 },
    })
    if (!standingsRes.ok) {
      return Response.json({ error: 'Standings unavailable' }, { status: 502 })
    }

    const all = await standingsRes.json() as ApiGroupStandings[]
    const group = all.find(g => g.group === match.group)
    if (!group) return Response.json({ error: 'Group not found' }, { status: 404 })

    return Response.json(group, {
      headers: {
        'Cache-Control': isLive
          ? 'no-store'
          : 'public, max-age=300, stale-while-revalidate=60',
      },
    })
  } catch (err) {
    console.error(`[GroupStandings] ${id} —`, err instanceof Error ? err.message : err)
    return Response.json({ error: 'Service unavailable' }, { status: 503 })
  }
}
