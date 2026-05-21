/**
 * Layer 3.5 — Groq AI enricher.
 *
 * ENRICH mode only: rewrites rule-based insight prose using verified numbers
 * from the facts summary. Only runs when form data exists (tactical.length > 0).
 * When no form data is available, the original engine output is returned unchanged.
 *
 * Falls back to the original template output silently if:
 *   - GROQ_API_KEY is not set
 *   - The API call fails or times out
 *   - The response JSON is malformed
 */

import type { MatchInsights } from '@/types/insights'
import type { InsightsFacts } from '@/types/insights-facts'

const GROQ_BASE  = 'https://api.groq.com/openai/v1'
const GROQ_MODEL = 'llama-3.3-70b-versatile'
const TIMEOUT_MS = 8000

// ─── Facts summary ────────────────────────────────────────────────

function buildFactsSummary(facts: InsightsFacts): string {
  const { home, away, h2h } = facts
  const lines: string[] = []

  if (home.results.length > 0) {
    lines.push(`${home.name} (last ${home.results.length} matches):`)
    if (home.avgGoalsScored   !== null) lines.push(`  - ${home.avgGoalsScored.toFixed(1)} goals scored per match`)
    if (home.avgGoalsConceded !== null) lines.push(`  - ${home.avgGoalsConceded.toFixed(1)} goals conceded per match`)
    if (home.cleanSheets      !== null) lines.push(`  - ${home.cleanSheets} clean sheets`)
    if (home.avgPossession    !== null) lines.push(`  - ${home.avgPossession.toFixed(0)}% average possession`)
    if (home.avgCorners       !== null) lines.push(`  - ${home.avgCorners.toFixed(1)} corners per match`)
    if (home.topScorer)                 lines.push(`  - Top scorer: ${home.topScorer.name} (${home.topScorer.goals} goals)`)
  }

  if (away.results.length > 0) {
    lines.push(`${away.name} (last ${away.results.length} matches):`)
    if (away.avgGoalsScored   !== null) lines.push(`  - ${away.avgGoalsScored.toFixed(1)} goals scored per match`)
    if (away.avgGoalsConceded !== null) lines.push(`  - ${away.avgGoalsConceded.toFixed(1)} goals conceded per match`)
    if (away.cleanSheets      !== null) lines.push(`  - ${away.cleanSheets} clean sheets`)
    if (away.avgPossession    !== null) lines.push(`  - ${away.avgPossession.toFixed(0)}% average possession`)
    if (away.avgCorners       !== null) lines.push(`  - ${away.avgCorners.toFixed(1)} corners per match`)
    if (away.topScorer)                 lines.push(`  - Top scorer: ${away.topScorer.name} (${away.topScorer.goals} goals)`)
  }

  if (h2h && h2h.totalMeetings > 0) {
    lines.push(
      `Head-to-head (${h2h.totalMeetings} meetings): ` +
      `${home.name} ${h2h.homeWins}W ${h2h.draws}D ${h2h.awayWins}L`,
    )
    if (h2h.lastMeeting) {
      lines.push(
        `  - Last meeting: ${h2h.lastMeeting.homeTeamName} ` +
        `${h2h.lastMeeting.homeGoals}–${h2h.lastMeeting.awayGoals} ` +
        `${h2h.lastMeeting.awayTeamName}`,
      )
    }
  }

  return lines.length > 0 ? lines.join('\n') : '(no historical data available)'
}

// ─── Prompt: ENRICH mode (rule-based insights already exist) ──────

function buildEnrichPrompt(insights: MatchInsights, facts: InsightsFacts): string {
  const matchLabel = `${facts.home.name} vs ${facts.away.name}${facts.isKnockout ? ' (knockout stage)' : ''}`

  const tacticalBlock = insights.tactical.map((t, i) =>
    `${i + 1}. [${t.category.toUpperCase()}] ${t.text}`,
  ).join('\n')

  const narrativeBlock = insights.narrative
    ? `Knockout context: ${insights.narrative.body}`
    : ''

  return `MATCH: ${matchLabel}

CONFIRMED DATA — use only these numbers, do not invent any additional statistics:
${buildFactsSummary(facts)}

TEXTS TO REWRITE:
Tactical insights:
${tacticalBlock}
Edge note: ${insights.edgeNote}
${narrativeBlock}

RULES:
- Use ONLY the numbers from CONFIRMED DATA above
- Tactical rewrites: 1–2 sentences each, always include the specific number that justifies the claim
- Edge note: 2–3 sentences, reference actual points tallies or averages
- Knockout context: 1–2 sentences about the stakes and tactical implications
- Tone: direct, analytical, confident — no clichés, no hyperbole
- Do NOT add player names, scorelines, or stats not listed above

Return JSON with this exact shape:
{
  "tacticalTexts": [ ...exactly ${insights.tactical.length} strings... ],
  "edgeNote": "...",
  "narrativeBody": "..."
}
Omit narrativeBody if there is no knockout context.`
}

// ─── Groq API call ────────────────────────────────────────────────

async function callGroq<T>(apiKey: string, userPrompt: string): Promise<T> {
  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS)

  console.log(`[GroqInsights] → Groq request starting (model=${GROQ_MODEL}, timeout=${TIMEOUT_MS}ms)`)

  let res: Response
  try {
    res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:           GROQ_MODEL,
        temperature:     0.4,
        max_tokens:      1200,
        response_format: { type: 'json_object' },
        messages: [
          {
            role:    'system',
            content:
              'You are a football match analyst specializing in international football. ' +
              'Provide sharp, grounded tactical analysis. Return valid JSON only.',
          },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }

  console.log(`[GroqInsights] ← Groq response: HTTP ${res.status}`)

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Groq HTTP ${res.status}: ${body.slice(0, 300)}`)
  }

  const data    = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Groq returned empty content')
  }

  return JSON.parse(content) as T
}

// ─── Apply: ENRICH mode ───────────────────────────────────────────

interface GroqEnrichment {
  tacticalTexts:  string[]
  edgeNote:       string
  narrativeBody?: string
}

function applyEnrichment(insights: MatchInsights, enrichment: GroqEnrichment): MatchInsights {
  const tacticalCount  = insights.tactical.length
  const enrichedTexts  = enrichment.tacticalTexts
  const validTactical  =
    Array.isArray(enrichedTexts) && enrichedTexts.length === tacticalCount

  return {
    ...insights,
    tactical: validTactical
      ? insights.tactical.map((t, i) => ({
          ...t,
          text: typeof enrichedTexts[i] === 'string' && enrichedTexts[i].trim()
            ? enrichedTexts[i].trim()
            : t.text,
        }))
      : insights.tactical,
    edgeNote:
      typeof enrichment.edgeNote === 'string' && enrichment.edgeNote.trim()
        ? enrichment.edgeNote.trim()
        : insights.edgeNote,
    narrative:
      insights.narrative && typeof enrichment.narrativeBody === 'string' && enrichment.narrativeBody.trim()
        ? { ...insights.narrative, body: enrichment.narrativeBody.trim() }
        : insights.narrative,
  }
}

// ─── Public API ───────────────────────────────────────────────────

export async function enrichInsightsWithGroq(
  insights: MatchInsights,
  facts:    InsightsFacts,
): Promise<MatchInsights> {
  const apiKey = process.env.GROQ_API_KEY

  if (!apiKey) {
    console.warn(
      '[GroqInsights] GROQ_API_KEY is not set — AI enrichment disabled. ' +
      'Add GROQ_API_KEY to your Vercel environment variables to enable AI-generated insights.',
    )
    return insights
  }

  if (insights.insufficientData) {
    console.log(`[GroqInsights] match ${insights.matchId} — insufficientData=true, skipping Groq`)
    return insights
  }

  try {
    if (insights.tactical.length === 0) {
      // No rule-based insights exist — no real form data available.
      // GENERATE mode (AI-invented team narratives) is disabled: without measured
      // match data, any generated tactical text would be unverifiable inference.
      // The engine already produced the correct low-confidence edge note.
      console.log(`[GroqInsights] match ${insights.matchId} — no form data, skipping Groq (no fabrication)`)
      return insights
    } else {
      // ENRICH mode — rewrite existing rule-based prose
      console.log(`[GroqInsights] match ${insights.matchId} — ENRICH mode (${insights.tactical.length} rule-based insights)`)
      const t = Date.now()
      const prompt     = buildEnrichPrompt(insights, facts)
      const enrichment = await callGroq<GroqEnrichment>(apiKey, prompt)
      const result     = applyEnrichment(insights, enrichment)
      console.log(
        `[GroqInsights] match ${insights.matchId} — ENRICH done in ${Date.now() - t}ms | ` +
        `tactical count unchanged: ${result.tactical.length}`,
      )
      return result
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(
      `[GroqInsights] match ${insights.matchId} — Groq call failed, returning template fallback. ` +
      `Error: ${msg}`,
    )
    return insights
  }
}
