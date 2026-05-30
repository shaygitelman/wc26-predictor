import { fetchInsightsData }    from '@/lib/insights-data'
import { normalizeInsightsFacts } from '@/lib/insights-normalizer'
import { runInsightsEngine }      from '@/lib/insights-engine'
import { enrichInsightsWithGroq } from '@/lib/groq-insights'
import type { Match }             from '@/types/match'
import type { MatchInsights }     from '@/types/insights'

export async function computeMatchInsights(match: Match): Promise<MatchInsights | null> {
  try {
    const raw      = await fetchInsightsData(match)
    const facts    = normalizeInsightsFacts(raw)
    const insights = runInsightsEngine(facts)
    return await enrichInsightsWithGroq(insights, facts)
  } catch (err) {
    console.error('[computeMatchInsights]', err instanceof Error ? err.message : err)
    return null
  }
}
