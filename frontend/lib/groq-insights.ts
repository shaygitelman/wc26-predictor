/**
 * Layer 3.5 — Groq AI enricher + generator.
 *
 * Two modes:
 *  - ENRICH: rule-based insights exist → Groq rewrites the prose only.
 *  - GENERATE: no form data → Groq generates insights from its own knowledge of the teams.
 *
 * Falls back to the original template output silently if:
 *   - GROQ_API_KEY is not set
 *   - The API call fails or times out
 *   - The response JSON is malformed
 */

import type { MatchInsights, TacticalCategory, TacticalInsight, EdgeTeam } from '@/types/insights'
import type { InsightsFacts } from '@/types/insights-facts'

const GROQ_BASE  = 'https://api.groq.com/openai/v1'
const GROQ_MODEL = 'llama-3.3-70b-versatile'
const TIMEOUT_MS = 8000

const VALID_CATEGORIES = new Set<string>([
  'transition', 'pressing', 'possession', 'wide-threats', 'set-pieces',
  'defensive-shape', 'midfield-control', 'counterattack', 'finishing', 'high-line', 'key-duel',
])

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

// ─── Prompt: GENERATE mode (no form data — use AI knowledge) ─────

function buildGenerationPrompt(facts: InsightsFacts): string {
  const { home, away, isKnockout } = facts
  const stage = isKnockout ? 'knockout stage' : 'group stage'

  return `MATCH: ${home.name} vs ${away.name} — FIFA World Cup 2026 (${stage})

No recent match data is available for this fixture. Generate tactical insights based on your knowledge of these national teams — their playing styles, tactical tendencies, typical formations, and historical strengths.

RULES:
- Do NOT invent specific statistics (goals per game, possession percentages, etc.)
- Focus on tactical identity, playing style, and team characteristics
- 3–4 tactical insights, 1–2 sentences each
- Tone: direct, analytical, confident — no clichés
- "positive" highlight = advantage favours the home team (${home.name})
- "negative" highlight = advantage favours the away team (${away.name})
- "neutral" = balanced or contextual observation

Valid categories (pick the most fitting):
transition, pressing, possession, wide-threats, set-pieces, defensive-shape, midfield-control, counterattack, finishing, high-line, key-duel

Return JSON with this exact shape:
{
  "tactical": [
    { "category": "possession", "text": "...", "highlight": "positive|negative|neutral" },
    { "category": "defensive-shape", "text": "...", "highlight": "positive|negative|neutral" }
  ],
  "edgeNote": "2–3 sentences about which team has the edge and why",
  "edgeTeam": "home|away|draw",
  "edgeStrength": "clear|slight",
  "coachingHint": "one tactical sentence guiding prediction",
  "narrativeHeadline": "short punchy title for this fixture",
  "narrativeBody": "1–2 sentences of football storytelling"
}`
}

// ─── Groq API call ────────────────────────────────────────────────

async function callGroq<T>(apiKey: string, userPrompt: string): Promise<T> {
  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS)

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

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Groq ${res.status}: ${body.slice(0, 200)}`)
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

// ─── Apply: GENERATE mode ─────────────────────────────────────────

interface GroqGeneration {
  tactical:          Array<{ category: string; text: string; highlight?: string }>
  edgeNote:          string
  edgeTeam?:         string
  edgeStrength?:     string
  coachingHint?:     string
  narrativeHeadline?: string
  narrativeBody?:    string
}

function applyGeneration(
  insights:  MatchInsights,
  gen:       GroqGeneration,
  facts:     InsightsFacts,
): MatchInsights {
  const tactical: TacticalInsight[] = Array.isArray(gen.tactical)
    ? gen.tactical
        .filter(t => t && typeof t.text === 'string' && VALID_CATEGORIES.has(t.category))
        .map(t => ({
          category:  t.category as TacticalCategory,
          text:      t.text.trim(),
          highlight: (['positive', 'negative', 'neutral'].includes(t.highlight ?? '')
            ? t.highlight
            : 'neutral') as 'positive' | 'negative' | 'neutral',
        }))
    : []

  const rawEdgeTeam = gen.edgeTeam ?? 'draw'
  const edgeTeam    = (['home', 'away', 'draw'].includes(rawEdgeTeam) ? rawEdgeTeam : 'draw') as EdgeTeam
  const edgeTeamName =
    edgeTeam === 'home' ? facts.home.name :
    edgeTeam === 'away' ? facts.away.name :
    facts.home.name

  return {
    ...insights,
    tactical,
    edgeNote:     gen.edgeNote?.trim()          || insights.edgeNote,
    coachingHint: gen.coachingHint?.trim()      ?? insights.coachingHint,
    confidence:   'low',
    edge: {
      team:     edgeTeam,
      teamName: edgeTeamName,
      strength: gen.edgeStrength === 'clear' ? 'clear' : 'slight',
    },
    narrative:
      gen.narrativeHeadline && gen.narrativeBody
        ? { headline: gen.narrativeHeadline.trim(), body: gen.narrativeBody.trim() }
        : insights.narrative,
  }
}

// ─── Public API ───────────────────────────────────────────────────

export async function enrichInsightsWithGroq(
  insights: MatchInsights,
  facts:    InsightsFacts,
): Promise<MatchInsights> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return insights
  if (insights.insufficientData) return insights

  try {
    if (insights.tactical.length === 0) {
      // GENERATE mode — no rule-based insights, ask Groq to create from team knowledge
      const prompt = buildGenerationPrompt(facts)
      const gen    = await callGroq<GroqGeneration>(apiKey, prompt)
      const result = applyGeneration(insights, gen, facts)
      console.log(`[GroqInsights] Generated ${result.tactical.length} insights for match ${insights.matchId} (no form data)`)
      return result
    } else {
      // ENRICH mode — rewrite existing rule-based prose
      const prompt      = buildEnrichPrompt(insights, facts)
      const enrichment  = await callGroq<GroqEnrichment>(apiKey, prompt)
      const result      = applyEnrichment(insights, enrichment)
      console.log(`[GroqInsights] Enriched match ${insights.matchId} (${insights.tactical.length} insights)`)
      return result
    }
  } catch (err) {
    console.warn('[GroqInsights] Falling back to template insights:', err instanceof Error ? err.message : err)
    return insights
  }
}
