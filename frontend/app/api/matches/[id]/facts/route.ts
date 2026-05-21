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
 * Stats: estimated from historical averages, clearly labelled in the UI.
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

// ─── Estimated stats ──────────────────────────────────────────────
// These are rough estimates derived from tournament-wide historical averages
// when no real per-match stats are available.
// The UI labels them "Estimated" — they are not presented as exact measurements.
// No PRNG jitter — purely deterministic so the same match always shows the same values.

interface TeamAvg { goalsFor: number; goalsAgt: number; strength: number }

const TEAM_AVGS: Record<string, TeamAvg> = {
  BRA: { goalsFor: 2.6, goalsAgt: 0.8, strength: 9.1 }, FRA: { goalsFor: 2.4, goalsAgt: 0.7, strength: 9.0 },
  ARG: { goalsFor: 2.3, goalsAgt: 0.9, strength: 9.1 }, ESP: { goalsFor: 2.2, goalsAgt: 0.6, strength: 8.8 },
  GER: { goalsFor: 2.1, goalsAgt: 1.1, strength: 8.5 }, ENG: { goalsFor: 1.9, goalsAgt: 1.0, strength: 8.3 },
  POR: { goalsFor: 2.0, goalsAgt: 1.0, strength: 8.4 }, NED: { goalsFor: 1.8, goalsAgt: 1.2, strength: 8.0 },
  BEL: { goalsFor: 2.0, goalsAgt: 1.1, strength: 8.2 }, CRO: { goalsFor: 1.7, goalsAgt: 1.0, strength: 7.8 },
  URU: { goalsFor: 1.7, goalsAgt: 1.2, strength: 7.6 }, MAR: { goalsFor: 1.6, goalsAgt: 1.0, strength: 7.7 },
  SEN: { goalsFor: 1.9, goalsAgt: 1.0, strength: 7.9 }, COL: { goalsFor: 1.8, goalsAgt: 1.1, strength: 7.8 },
  USA: { goalsFor: 1.5, goalsAgt: 1.4, strength: 7.0 }, MEX: { goalsFor: 1.5, goalsAgt: 1.3, strength: 7.2 },
  CAN: { goalsFor: 1.7, goalsAgt: 1.2, strength: 7.3 }, JPN: { goalsFor: 1.6, goalsAgt: 1.1, strength: 7.5 },
  KOR: { goalsFor: 1.5, goalsAgt: 1.2, strength: 7.2 }, AUS: { goalsFor: 1.4, goalsAgt: 1.4, strength: 6.8 },
  SUI: { goalsFor: 1.8, goalsAgt: 0.9, strength: 7.8 }, DEN: { goalsFor: 1.7, goalsAgt: 1.0, strength: 7.7 },
  POL: { goalsFor: 1.6, goalsAgt: 1.2, strength: 7.4 }, TUR: { goalsFor: 1.7, goalsAgt: 1.2, strength: 7.5 },
  NGA: { goalsFor: 1.8, goalsAgt: 1.1, strength: 7.5 }, EGY: { goalsFor: 1.5, goalsAgt: 1.2, strength: 7.0 },
}
const DEFAULT_AVG: TeamAvg = { goalsFor: 1.5, goalsAgt: 1.3, strength: 7.0 }

function getAvg(code: string): TeamAvg {
  return TEAM_AVGS[code.toUpperCase()] ?? DEFAULT_AVG
}

function buildEstimatedStats(homeCode: string, awayCode: string): StatRow[] {
  const h = getAvg(homeCode)
  const a = getAvg(awayCode)

  const totalStr = h.strength + a.strength
  const homePoss = Math.round(48 + (h.strength / totalStr - 0.5) * 26)
  const awayPoss = 100 - homePoss

  const homeShots   = Math.max(6, Math.round(h.goalsFor / 0.115))
  const awayShots   = Math.max(6, Math.round(a.goalsFor / 0.115))
  const homeConvPct = Math.max(5, Math.round((h.goalsFor / homeShots) * 100))
  const awayConvPct = Math.max(5, Math.round((a.goalsFor / awayShots) * 100))
  const homeCSPct   = Math.max(10, Math.min(80, Math.round(70 - h.goalsAgt * 30)))
  const awayCSPct   = Math.max(10, Math.min(80, Math.round(70 - a.goalsAgt * 30)))

  return [
    { label: 'Goals Scored',   home: +h.goalsFor.toFixed(1), away: +a.goalsFor.toFixed(1), unit: '/g', higherIsBetter: true,  format: 'decimal'  },
    { label: 'Goals Conceded', home: +h.goalsAgt.toFixed(1), away: +a.goalsAgt.toFixed(1), unit: '/g', higherIsBetter: false, format: 'decimal'  },
    { label: 'Shots per Game', home: homeShots,               away: awayShots,               unit: '',   higherIsBetter: true,  format: 'integer'  },
    { label: 'Possession',     home: homePoss,                away: awayPoss,                unit: '%',  higherIsBetter: true,  format: 'integer'  },
    { label: 'Clean Sheet %',  home: homeCSPct,               away: awayCSPct,               unit: '%',  higherIsBetter: true,  format: 'integer'  },
    { label: 'Conversion',     home: homeConvPct,             away: awayConvPct,             unit: '%',  higherIsBetter: true,  format: 'integer'  },
  ]
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

    // ── Stats: estimated, labelled as such in the UI ────────────
    const stats = buildEstimatedStats(match.homeTeam.shortCode, match.awayTeam.shortCode)

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
