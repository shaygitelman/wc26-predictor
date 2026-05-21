/**
 * Match facts API route.
 *
 * Squad News: real-data only — fetched from the backend squad endpoint.
 *   If the backend does not yet implement the endpoint the response carries
 *   squadConfidence='none' and the UI shows an explicit "no data" fallback.
 *   We NEVER fabricate player names, injuries, suspensions, or doubts.
 *
 * Invariant: every PlayerStatus entry that leaves this route MUST have:
 *   - name: string of length ≥ 2
 *   - source: the originating endpoint URL
 *   - validated: true
 *   Any entry failing these checks is stripped here before the response is built.
 *
 * Cache: always no-store so the client never renders stale fabricated squad data
 *   from a previous deployment.
 *
 * Context banners: deterministic only — known rivalries and knockout-stage
 *   labels derived from match.round. No PRNG-driven "pressure" banners.
 *
 * Stats: returns an empty array until real per-match stat endpoints are available.
 *   The UI shows "No verified statistics available" when the array is empty.
 */

import { fetchSquadNews } from '@/lib/squad-news'
import type { Match, Team, Round } from '@/types/match'
import type { MatchFacts, MatchContext, StatRow, PlayerStatus, TeamSquadStatus } from '@/types/match-facts'

// ─── Player entry invariant ───────────────────────────────────────
// Strips any entry that is missing a real player name, has no source URL,
// or was not explicitly validated by squad-news.ts.
// This is the last line of defence before data reaches the client.

function scrubSquadTeam(team: { injured: PlayerStatus[]; suspended: PlayerStatus[]; doubtful: PlayerStatus[] }, side: string, matchId: string): TeamSquadStatus {
  const scrub = (arr: PlayerStatus[], bucket: string): PlayerStatus[] =>
    arr.filter(p => {
      const valid =
        typeof p.name === 'string' &&
        p.name.trim().length >= 2 &&
        p.validated === true &&
        typeof p.source === 'string' &&
        p.source.length > 0

      if (!valid) {
        console.error(
          `[MatchFacts] ${matchId} — STRIPPED invalid player entry ` +
          `side=${side} bucket=${bucket} name=${JSON.stringify(p.name)} ` +
          `validated=${p.validated} source=${JSON.stringify(p.source)}`,
        )
      }
      return valid
    })

  return {
    injured:   scrub(team.injured,   'injured'),
    suspended: scrub(team.suspended, 'suspended'),
    doubtful:  scrub(team.doubtful,  'doubtful'),
  }
}

const API_BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

const TBD_CODES   = new Set(['TBD', 'TBA', '', 'N/A', 'NONE', 'NULL'])
const TBD_NAME_RE = /^\s*(tbd|tba|winner|loser|runner-?up|\d+(?:st|nd|rd|th)\s+group|best\s+3rd|match\s+\d)/i

function isTBD(shortCode?: string | null, name?: string | null): boolean {
  const code = (shortCode ?? '').toUpperCase().trim()
  if (TBD_CODES.has(code)) return true
  if (name && TBD_NAME_RE.test(name)) return true
  return false
}

// ─── Factual context banners ──────────────────────────────────────
// Only two sources of truth are allowed:
//  1. Known football rivalries (hardcoded — these are real historical facts)
//  2. match.round — deterministic, derived from the match record itself
//
// Removed: PRNG-driven "must-win" group pressure (was 35% random chance)
// Removed: PRNG-driven "upset-alert" (was based on fake hardcoded team strengths)

const KNOWN_RIVALRIES: Record<string, { label: string; detail: string }> = {
  'BRA-ARG': { label: 'Clásico de América',  detail: "One of football's defining rivalries — never a dull moment between these sides" },
  'ARG-BRA': { label: 'Clásico de América',  detail: "One of football's defining rivalries — never a dull moment between these sides" },
  'ENG-GER': { label: 'Historic Rivalry',    detail: 'Decades of World Cup history make this fixture unique in world football' },
  'GER-ENG': { label: 'Historic Rivalry',    detail: 'Decades of World Cup history make this fixture unique in world football' },
  'ESP-POR': { label: 'Iberian Derby',        detail: 'Neighboring nations with fierce competitive pride on the biggest stage' },
  'POR-ESP': { label: 'Iberian Derby',        detail: 'Neighboring nations with fierce competitive pride on the biggest stage' },
  'USA-MEX': { label: 'CONCACAF Rivalry',    detail: 'A long-running rivalry with intense passion on both sides of the border' },
  'MEX-USA': { label: 'CONCACAF Rivalry',    detail: 'A long-running rivalry with intense passion on both sides of the border' },
  'FRA-GER': { label: 'European Giants',     detail: "Two of Europe's most decorated nations — their meetings shape tournaments" },
  'GER-FRA': { label: 'European Giants',     detail: "Two of Europe's most decorated nations — their meetings shape tournaments" },
  'ARG-ENG': { label: 'Charged Encounter',  detail: 'A fixture steeped in history and always carrying an extra edge' },
  'ENG-ARG': { label: 'Charged Encounter',  detail: 'A fixture steeped in history and always carrying an extra edge' },
  'BRA-FRA': { label: 'World Cup Classics', detail: "These sides have produced some of the tournament's most memorable moments" },
  'FRA-BRA': { label: 'World Cup Classics', detail: "These sides have produced some of the tournament's most memorable moments" },
  'ARG-ESP': { label: 'International Clash', detail: 'Two technically gifted sides with a rich tradition of elite-level football' },
  'ESP-ARG': { label: 'International Clash', detail: 'Two technically gifted sides with a rich tradition of elite-level football' },
}

function buildContext(homeTeam: Team, awayTeam: Team, round: Round): MatchContext[] {
  const context: MatchContext[] = []

  // 1. Known rivalry — factual, hardcoded from real football history
  const key = `${homeTeam.shortCode}-${awayTeam.shortCode}`
  const rivalry = KNOWN_RIVALRIES[key]
  if (rivalry) {
    context.push({ type: 'rivalry', label: rivalry.label, detail: rivalry.detail })
  }

  // 2. Round-based stage context — 100% deterministic from match data
  if (round === 'r32' || round === 'r16') {
    context.push({
      type:   'elimination-risk',
      label:  'Knockout Round — No Second Chances',
      detail: 'One result ends the tournament for the loser — margins are everything',
    })
  } else if (round === 'qf' || round === 'sf') {
    context.push({
      type:   'knockout-pressure',
      label:  'One Step from the Final',
      detail: 'The quality of opposition rises sharply — focus and discipline are non-negotiable',
    })
  } else if (round === 'final') {
    context.push({
      type:   'high-stakes',
      label:  'World Cup Final',
      detail: 'The pinnacle of international football — one match to decide the world champion',
    })
  }

  return context
}


// ─── Route ────────────────────────────────────────────────────────

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const t0 = Date.now()

  console.log(`[MatchFacts] ${id} — start | API_BASE=${API_BASE}`)

  // Fetch the match record
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

  // TBD guard — return placeholder before doing any real work
  if (
    isTBD(match.homeTeam.shortCode, match.homeTeam.name) ||
    isTBD(match.awayTeam.shortCode, match.awayTeam.name)
  ) {
    console.log(`[MatchFacts] ${id} — one or both teams TBD, returning pending placeholder`)
    const pending: MatchFacts = {
      matchId:         id,
      generatedAt:     new Date().toISOString(),
      pendingData:     true,
      squad:           { home: { injured: [], suspended: [], doubtful: [] }, away: { injured: [], suspended: [], doubtful: [] } },
      squadSource:     'none',
      squadConfidence: 'none',
      stats:           [],
      context:         [],
    }
    return Response.json(pending, { headers: { 'Cache-Control': 'no-store' } })
  }

  try {
    // ── Squad news: real-data only ──────────────────────────────
    const squadResult = await fetchSquadNews(
      id,
      match.homeTeam.shortCode,
      match.awayTeam.shortCode,
    )
    const t1 = Date.now()
    console.log(
      `[MatchFacts] ${id} — squad fetched in ${t1 - t0}ms | ` +
      `source=${squadResult.dataSource} confidence=${squadResult.confidence} | ` +
      `home logs: status=${squadResult.logs.home.httpStatus} validation=${squadResult.logs.home.validationResult} | ` +
      `away logs: status=${squadResult.logs.away.httpStatus} validation=${squadResult.logs.away.validationResult}`,
    )

    // ── Context: deterministic/factual only ─────────────────────
    const context = buildContext(match.homeTeam, match.awayTeam, match.round)

    // ── Stats: no verified data available yet — real match stats
    // will be populated here once live API endpoints are implemented.
    const stats: StatRow[] = []

    // Apply invariant: strip any player entry that fails validation before
    // the response is built. This catches anything that slipped through
    // squad-news.ts or arrived from a stale/malformed upstream response.
    const homeSquad = scrubSquadTeam(squadResult.home, 'home', id)
    const awaySquad = scrubSquadTeam(squadResult.away, 'away', id)

    const homePlayers = homeSquad.injured.length + homeSquad.suspended.length + homeSquad.doubtful.length
    const awayPlayers = awaySquad.injured.length + awaySquad.suspended.length + awaySquad.doubtful.length

    console.log(
      `[MatchFacts] ${id} — squad after scrub: ` +
      `home=${homePlayers} away=${awayPlayers} ` +
      `confidence=${squadResult.confidence} source=${squadResult.dataSource}`,
    )

    const facts: MatchFacts = {
      matchId:         id,
      generatedAt:     new Date().toISOString(),
      squad:           { home: homeSquad, away: awaySquad },
      squadSource:     squadResult.dataSource,
      squadConfidence: squadResult.confidence,
      squadFetchedAt:  squadResult.fetchedAt,
      squadLogs:       squadResult.logs,
      stats,
      context,
    }

    console.log(`[MatchFacts] ${id} — done in ${Date.now() - t0}ms`)

    // no-store: squad data is time-sensitive and must never be served stale.
    // Previously used stale-while-revalidate=86400 which was causing fabricated
    // squad entries from older deployments to persist for up to 24 h.
    return Response.json(facts, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error(
      `[MatchFacts] ${id} — pipeline threw:`,
      err instanceof Error ? err.stack : err,
    )
    return Response.json({ error: 'Facts generation failed' }, { status: 500 })
  }
}
