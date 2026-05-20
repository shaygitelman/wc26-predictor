import { generateFacts } from '@/lib/match-facts-mock'
import type { Match } from '@/types/match'
import type { MatchFacts } from '@/types/match-facts'

const API_BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

const TBD_CODES   = new Set(['TBD', 'TBA', '', 'N/A', 'NONE', 'NULL'])
const TBD_NAME_RE = /^\s*(tbd|tba|winner|loser|runner-?up|\d+(?:st|nd|rd|th)\s+group|best\s+3rd|match\s+\d)/i

function isTBD(shortCode?: string | null, name?: string | null): boolean {
  const code = (shortCode ?? '').toUpperCase().trim()
  if (TBD_CODES.has(code)) return true
  if (name && TBD_NAME_RE.test(name)) return true
  return false
}

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params

  let match: Match
  try {
    const res = await fetch(`${API_BASE}/matches/${id}`, { next: { revalidate: 60 } })
    if (!res.ok) return Response.json({ error: 'Match not found' }, { status: 404 })
    match = await res.json()
  } catch {
    return Response.json({ error: 'Service unavailable' }, { status: 503 })
  }

  // Do not generate facts for unconfirmed teams — data would be fictitious
  if (isTBD(match.homeTeam.shortCode, match.homeTeam.name) ||
      isTBD(match.awayTeam.shortCode, match.awayTeam.name)) {
    const pending: MatchFacts = {
      matchId:     id,
      generatedAt: new Date().toISOString(),
      pendingData: true,
      squad:   { home: { injured: [], suspended: [], doubtful: [] }, away: { injured: [], suspended: [], doubtful: [] } },
      stats:   [],
      context: [],
    }
    return Response.json(pending, {
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const facts = generateFacts(id, match.homeTeam, match.awayTeam, match.round)

  return Response.json(facts, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  })
}
