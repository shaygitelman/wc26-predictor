/**
 * Layer 3.5 — Groq AI insights generator.
 *
 * GENERATE mode: produces all 4 insight sections from the facts summary in a
 * single call. The rule-based engine output is used only as a fallback when
 * Groq is unavailable, times out, or returns malformed JSON.
 *
 * Falls back silently if:
 *   - GROQ_API_KEY is not set
 *   - The API call fails or times out (8s)
 *   - The response JSON is missing required fields
 */

import type { MatchInsights } from '@/types/insights'
import type { InsightsFacts } from '@/types/insights-facts'
import { FIFA_RANKINGS } from '@/lib/fifa-rankings'

const GROQ_BASE  = 'https://api.groq.com/openai/v1'
const GROQ_MODEL = 'llama-3.3-70b-versatile'
const TIMEOUT_MS = 8000

// ─── Facts summary ────────────────────────────────────────────────

function buildFactsSummary(facts: InsightsFacts): string {
  const { home, away, h2h } = facts
  const lines: string[] = []

  const homeRank = FIFA_RANKINGS[home.shortCode.toUpperCase()]
  const awayRank = FIFA_RANKINGS[away.shortCode.toUpperCase()]

  // Rankings header — always printed when known; anchors quality context before form data
  if (homeRank || awayRank) {
    const parts: string[] = []
    if (homeRank) parts.push(`${home.name} #${homeRank}`)
    if (awayRank) parts.push(`${away.name} #${awayRank}`)
    lines.push(`FIFA World Rankings: ${parts.join(' | ')}`)
  }

  if (home.results.length > 0) {
    const rankStr = homeRank ? ` | FIFA #${homeRank}` : ''
    lines.push(`${home.name}${rankStr} (last ${home.results.length} matches):`)
    if (home.avgGoalsScored   !== null) lines.push(`  - ${home.avgGoalsScored.toFixed(1)} goals scored per match`)
    if (home.avgGoalsConceded !== null) lines.push(`  - ${home.avgGoalsConceded.toFixed(1)} goals conceded per match`)
    if (home.cleanSheets      !== null) lines.push(`  - ${home.cleanSheets} clean sheets`)
    if (home.avgPossession    !== null) lines.push(`  - ${home.avgPossession.toFixed(0)}% average possession`)
    if (home.avgCorners       !== null) lines.push(`  - ${home.avgCorners.toFixed(1)} corners per match`)
    if (home.topScorer)                 lines.push(`  - Top scorer: ${home.topScorer.name} (${home.topScorer.goals} goals)`)
    if (home.unavailablePlayers.length > 0) {
      const absences = home.unavailablePlayers.slice(0, 3).map(p => `${p.name} (${p.status})`).join(', ')
      lines.push(`  - Key absences: ${absences}`)
    }
    const homePoints = home.recentForm.reduce((s, r) => s + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0)
    lines.push(`  - Recent form: ${home.recentForm.join(' ')} (${homePoints}pts)`)
  }

  if (away.results.length > 0) {
    const rankStr = awayRank ? ` | FIFA #${awayRank}` : ''
    lines.push(`${away.name}${rankStr} (last ${away.results.length} matches):`)
    if (away.avgGoalsScored   !== null) lines.push(`  - ${away.avgGoalsScored.toFixed(1)} goals scored per match`)
    if (away.avgGoalsConceded !== null) lines.push(`  - ${away.avgGoalsConceded.toFixed(1)} goals conceded per match`)
    if (away.cleanSheets      !== null) lines.push(`  - ${away.cleanSheets} clean sheets`)
    if (away.avgPossession    !== null) lines.push(`  - ${away.avgPossession.toFixed(0)}% average possession`)
    if (away.avgCorners       !== null) lines.push(`  - ${away.avgCorners.toFixed(1)} corners per match`)
    if (away.topScorer)                 lines.push(`  - Top scorer: ${away.topScorer.name} (${away.topScorer.goals} goals)`)
    if (away.unavailablePlayers.length > 0) {
      const absences = away.unavailablePlayers.slice(0, 3).map(p => `${p.name} (${p.status})`).join(', ')
      lines.push(`  - Key absences: ${absences}`)
    }
    const awayPoints = away.recentForm.reduce((s, r) => s + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0)
    lines.push(`  - Recent form: ${away.recentForm.join(' ')} (${awayPoints}pts)`)
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

// ─── Prompt ───────────────────────────────────────────────────────

function buildPrompt(facts: InsightsFacts): string {
  const { home, away } = facts
  const context = facts.isKnockout
    ? 'knockout stage of the 2026 FIFA World Cup — single match, elimination'
    : 'group stage of the 2026 FIFA World Cup'

  return `You are a football match analyst covering the 2026 FIFA World Cup.

MATCH: ${home.name} vs ${away.name} (${context})
HOME TEAM CODE: ${home.shortCode}
AWAY TEAM CODE: ${away.shortCode}

CONFIRMED DATA — use ONLY these numbers. Do not invent statistics:
${buildFactsSummary(facts)}

Generate this JSON exactly (no extra keys, no markdown):
{
  "story": "2–3 sentences. Identify ONE clear narrative angle — form mismatch, defensive battle, underdog threat, attacking firepower, revenge match, etc. Be specific to this matchup. Never write: 'both teams', 'could be', 'anything can happen', 'will look to win'.",
  "keyEdge": {
    "teamCode": "${home.shortCode} or ${away.shortCode}",
    "teamName": "full team name",
    "side": "home or away",
    "label": "3–5 word specific label (e.g. 'Elite Attacking Depth', 'Defensive Wall', 'Form Surge')",
    "explanation": "2–3 sentences explaining WHY this team has the edge, citing specific numbers from the data above."
  },
  "decidingFactors": [
    "Factor 1 — specific tactical or physical element (e.g. 'Set piece delivery and aerial dominance')",
    "Factor 2",
    "Factor 3"
  ],
  "prediction": {
    "homeScore": 1,
    "awayScore": 0,
    "homeTeamName": "${home.name}",
    "awayTeamName": "${away.name}",
    "reasoning": [
      "Bullet 1 — reference actual data from above",
      "Bullet 2",
      "Bullet 3"
    ],
    "confidence": "high, medium, or low — high only when both teams have 5+ matches of data"
  }
}

RULES:
- Use ONLY numbers from the CONFIRMED DATA above — never invent stats
- story: one specific narrative angle, not a general preview
- keyEdge: label must be 3–5 words; explanation must cite real numbers
- decidingFactors: tactical/physical specifics, not vague ("finishing quality under pressure" not "scoring goals")
- prediction: scores must follow logically from the data; justify with actual figures; a large FIFA ranking gap (e.g. #1 vs #54) should modulate predictions even when form looks close
- Key absences in the data should influence the story, keyEdge, and prediction reasoning
- If data is minimal, story can acknowledge uncertainty while still setting a narrative angle`
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
        temperature:     0.45,
        max_tokens:      900,
        response_format: { type: 'json_object' },
        messages: [
          {
            role:    'system',
            content:
              'You are a concise football match analyst. Write sharp, data-backed insights. ' +
              'Maximum 200 words total across all sections. Return valid JSON only.',
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

// ─── Validate and apply Groq output ──────────────────────────────

interface GroqPayload {
  story?:           string
  keyEdge?: {
    teamCode?:    string
    teamName?:    string
    side?:        string
    label?:       string
    explanation?: string
  }
  decidingFactors?: unknown[]
  prediction?: {
    homeScore?:    unknown
    awayScore?:    unknown
    homeTeamName?: string
    awayTeamName?: string
    reasoning?:    unknown[]
    confidence?:   string
  }
}

function isValidSide(s: unknown): s is 'home' | 'away' {
  return s === 'home' || s === 'away'
}

function isValidConfidence(c: unknown): c is 'low' | 'medium' | 'high' {
  return c === 'low' || c === 'medium' || c === 'high'
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function applyGroqPayload(fallback: MatchInsights, payload: GroqPayload): MatchInsights {
  const story    = str(payload.story)
  const ke       = payload.keyEdge
  const df       = Array.isArray(payload.decidingFactors)
    ? payload.decidingFactors.filter((f): f is string => typeof f === 'string' && !!f.trim()).slice(0, 3)
    : []
  const pr       = payload.prediction

  // Validate keyEdge
  const validEdge = ke &&
    str(ke.teamCode) && str(ke.teamName) && isValidSide(ke.side) &&
    str(ke.label)    && str(ke.explanation)

  // Validate prediction
  const hScore     = typeof pr?.homeScore === 'number' ? Math.round(Math.max(0, Math.min(pr.homeScore, 6))) : null
  const aScore     = typeof pr?.awayScore === 'number' ? Math.round(Math.max(0, Math.min(pr.awayScore, 6))) : null
  const reasoning  = Array.isArray(pr?.reasoning)
    ? pr!.reasoning.filter((r): r is string => typeof r === 'string' && !!r.trim()).slice(0, 3)
    : []
  const confidence = isValidConfidence(pr?.confidence) ? pr!.confidence : null
  const validPred  = hScore !== null && aScore !== null && reasoning.length >= 1 && confidence

  return {
    ...fallback,
    story:           story ?? fallback.story,
    keyEdge:         validEdge ? {
      teamCode:    ke!.teamCode!.trim(),
      teamName:    ke!.teamName!.trim(),
      side:        ke!.side as 'home' | 'away',
      label:       ke!.label!.trim(),
      explanation: ke!.explanation!.trim(),
    } : fallback.keyEdge,
    decidingFactors: df.length >= 2 ? df : fallback.decidingFactors,
    prediction:      validPred ? {
      homeScore:    hScore!,
      awayScore:    aScore!,
      homeTeamName: str(pr?.homeTeamName) ?? fallback.prediction.homeTeamName,
      awayTeamName: str(pr?.awayTeamName) ?? fallback.prediction.awayTeamName,
      reasoning:    reasoning.length >= 2 ? reasoning : fallback.prediction.reasoning,
      confidence:   confidence!,
    } : fallback.prediction,
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
      '[GroqInsights] GROQ_API_KEY is not set — using rule-based fallback. ' +
      'Add GROQ_API_KEY to your environment variables to enable AI-generated insights.',
    )
    return insights
  }

  if (insights.insufficientData) {
    console.log(`[GroqInsights] match ${insights.matchId} — insufficientData=true, skipping Groq`)
    return insights
  }

  try {
    console.log(`[GroqInsights] match ${insights.matchId} — GENERATE mode`)
    const t       = Date.now()
    const prompt  = buildPrompt(facts)
    const payload = await callGroq<GroqPayload>(apiKey, prompt)
    const result  = applyGroqPayload(insights, payload)
    console.log(
      `[GroqInsights] match ${insights.matchId} — done in ${Date.now() - t}ms | ` +
      `story=${result.story.length}chars factors=${result.decidingFactors.length}`,
    )
    return result
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(
      `[GroqInsights] match ${insights.matchId} — Groq call failed, returning rule-based fallback. ` +
      `Error: ${msg}`,
    )
    return insights
  }
}
