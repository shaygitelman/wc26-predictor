import { fetchInsightsData }      from '@/lib/insights-data'
import { normalizeInsightsFacts }  from '@/lib/insights-normalizer'
import { runInsightsEngine }       from '@/lib/insights-engine'
import { enrichInsightsWithGroq }  from '@/lib/groq-insights'
import type { Match } from '@/types/match'
import type { DataProvenance } from '@/types/provenance'

const API_BASE         = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
const DEBUG_MODE       = process.env.DEBUG_AI_INSIGHTS === 'true'
const DEBUG_PROVENANCE = process.env.DEBUG_DATA_PROVENANCE === 'true'

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const t0 = Date.now()

  console.log(`[Insights] ${id} — start | API_BASE=${API_BASE}`)

  // ── Fetch match ──────────────────────────────────────────────
  let match: Match
  try {
    const res = await fetch(`${API_BASE}/matches/${id}`, { next: { revalidate: 60 } })
    if (!res.ok) {
      console.error(`[Insights] ${id} — match fetch failed with status ${res.status}`)
      return Response.json({ error: 'Match not found' }, { status: 404 })
    }
    match = await res.json()
  } catch (err) {
    console.error(`[Insights] ${id} — match fetch threw:`, err instanceof Error ? err.message : err)
    return Response.json({ error: 'Service unavailable' }, { status: 503 })
  }

  const t1 = Date.now()
  console.log(`[Insights] ${id} — match fetched in ${t1 - t0}ms`)

  // ── Full pipeline — wrapped so bugs never silently blank the card ──
  try {
    // Layer 1: fetch supporting data (form, h2h, stats, etc.)
    const raw  = await fetchInsightsData(match)
    const t2   = Date.now()
    const rawFactsCount = [
      raw.homeForm, raw.awayForm, raw.h2h,
      raw.homeStats, raw.awayStats,
    ].filter(Boolean).length
    console.log(
      `[Insights] ${id} — data fetched in ${t2 - t1}ms | ` +
      `homeForm=${!!raw.homeForm} awayForm=${!!raw.awayForm} ` +
      `h2h=${!!raw.h2h} homeStats=${!!raw.homeStats} awayStats=${!!raw.awayStats} ` +
      `(${rawFactsCount}/5 populated)`,
    )

    // Layer 2: normalize into typed facts
    const facts = normalizeInsightsFacts(raw)
    console.log(
      `[Insights] ${id} — normalized | ` +
      `home.results=${facts.home.results.length} away.results=${facts.away.results.length} ` +
      `confidence=${facts.dataConfidence}`,
    )

    // Layer 3: rule-based engine
    const insights = runInsightsEngine(facts)
    const t3 = Date.now()
    console.log(
      `[Insights] ${id} — engine in ${t3 - t2}ms | ` +
      `tactical=${insights.tactical.length} ` +
      `insufficientData=${insights.insufficientData} ` +
      `confidence=${insights.confidence}`,
    )

    // Layer 3.5: Groq AI enrichment / generation
    const groqStart = Date.now()
    const enriched  = await enrichInsightsWithGroq(insights, facts)
    const groqMs    = Date.now() - groqStart
    console.log(
      `[Insights] ${id} — groq step in ${groqMs}ms | ` +
      `tactical_before=${insights.tactical.length} ` +
      `tactical_after=${enriched.tactical.length}`,
    )

    const groqFallback =
      enriched.tactical.length === 0 && insights.tactical.length === 0

    // ── Provenance envelope ──────────────────────────────────────
    // Reflects which real data sources were available for this pipeline run.
    const dataProvenance: DataProvenance = {
      verified:     facts.dataConfidence !== 'insufficient',
      source:       [
        raw.homeForm  ? 'backend:/matches/{id}/form/home'   : null,
        raw.awayForm  ? 'backend:/matches/{id}/form/away'   : null,
        raw.h2h       ? 'backend:/matches/{id}/h2h'         : null,
        raw.homeStats ? 'backend:/matches/{id}/stats/home'  : null,
        raw.awayStats ? 'backend:/matches/{id}/stats/away'  : null,
      ].filter(Boolean).join(', ') || 'none',
      fetchedAt:    raw.fetchedAt,
      confidence:   facts.dataConfidence === 'high'   ? 'verified'
                  : facts.dataConfidence === 'medium'  ? 'partial'
                  : facts.dataConfidence === 'low'     ? 'partial'
                  : 'none',
      fallbackUsed: false,
    }

    const payload = {
      ...enriched,
      dataProvenance,
      ...(DEBUG_MODE || DEBUG_PROVENANCE ? {
        _debug: {
          rawFactsCount,
          groqLatencyMs:      groqMs,
          groqFallback,
          insightCount:       enriched.tactical.length,
          confidence:         enriched.confidence,
          apiBaseUsed:        API_BASE,
          // DEBUG_DATA_PROVENANCE extras
          ...(DEBUG_PROVENANCE && {
            sourceEndpoints:  dataProvenance.source,
            fixtureId:        raw.matchId,
            verificationStatus: dataProvenance.confidence,
            cacheLayer:       'no-store',
            fetchedAt:        dataProvenance.fetchedAt,
            fallbackActivationAttempts: 0,
            homeFormSamples:  raw.homeForm?.length ?? 0,
            awayFormSamples:  raw.awayForm?.length ?? 0,
            h2hAvailable:     !!raw.h2h,
          }),
        },
      } : {}),
    }

    console.log(`[Insights] ${id} — done in ${Date.now() - t0}ms`)

    return Response.json(payload, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    console.error(
      `[Insights] ${id} — pipeline threw:`,
      err instanceof Error ? err.stack : err,
    )
    return Response.json({ error: 'Insights generation failed' }, { status: 500 })
  }
}
