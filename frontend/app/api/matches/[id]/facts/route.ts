/**
 * Match facts API route — delegates to computeMatchFacts shared lib.
 * See lib/compute-match-facts.ts for data sourcing and invariant docs.
 */

import { computeMatchFacts } from '@/lib/compute-match-facts'
import type { Match } from '@/types/match'

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params

  let match: Match
  try {
    const res = await fetch(`${API_BASE}/matches/${id}`, { next: { revalidate: 60 } })
    if (!res.ok) {
      console.error(`[MatchFacts] ${id} — match fetch failed: HTTP ${res.status}`)
      return Response.json({ error: 'Match not found' }, { status: 404 })
    }
    match = await res.json()
  } catch (err) {
    console.error(`[MatchFacts] ${id} — match fetch threw: ${err instanceof Error ? err.message : err}`)
    return Response.json({ error: 'Service unavailable' }, { status: 503 })
  }

  const facts = await computeMatchFacts(id, match)
  if (!facts) return Response.json({ error: 'Facts generation failed' }, { status: 500 })

  return Response.json(facts, { headers: { 'Cache-Control': 'no-store' } })
}
