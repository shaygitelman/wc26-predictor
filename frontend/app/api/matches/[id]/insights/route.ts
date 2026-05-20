import { fetchInsightsData }      from '@/lib/insights-data'
import { normalizeInsightsFacts }  from '@/lib/insights-normalizer'
import { runInsightsEngine }       from '@/lib/insights-engine'
import { enrichInsightsWithGroq }  from '@/lib/groq-insights'
import type { Match } from '@/types/match'

const API_BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

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

  // Layer 1 → 2 → 3 → 3.5
  const raw      = await fetchInsightsData(match)          // fetch real API data
  const facts    = normalizeInsightsFacts(raw)              // normalize into validated facts
  const insights = runInsightsEngine(facts)                 // interpret facts into display insights
  const enriched = await enrichInsightsWithGroq(insights, facts)  // AI prose enrichment (optional)

  // Short cache — insights are data-driven and should reflect current tournament state
  return Response.json(enriched, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
