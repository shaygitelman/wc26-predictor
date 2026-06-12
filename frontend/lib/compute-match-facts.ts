import { fetchSquadNews, fetchComprehensiveSquadNews } from '@/lib/squad-news'
import { realProvenance, noProvenance }  from '@/types/provenance'
import type { Match, Team, Round }       from '@/types/match'
import type {
  MatchFacts, MatchContext, StatRow,
  PlayerStatus, TeamSquadStatus,
  ApiMatchStats, StatsDataSource, StatsConfidence,
  TeamFormEntry, TeamHistoricalStats, HistoricalConfidence,
  ComprehensiveSquadNews,
} from '@/types/match-facts'

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const TBD_CODES   = new Set(['TBD', 'TBA', '', 'N/A', 'NONE', 'NULL'])
const TBD_NAME_RE = /^\s*(tbd|tba|winner|loser|runner-?up|\d+(?:st|nd|rd|th)\s+group|best\s+3rd|match\s+\d)/i

function isTBD(shortCode?: string | null, name?: string | null): boolean {
  const code = (shortCode ?? '').toUpperCase().trim()
  if (TBD_CODES.has(code)) return true
  if (name && TBD_NAME_RE.test(name)) return true
  return false
}

function scrubSquadTeam(
  team: { injured: PlayerStatus[]; suspended: PlayerStatus[]; doubtful: PlayerStatus[] },
  side: string,
  matchId: string,
): TeamSquadStatus {
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
  const key = `${homeTeam.shortCode}-${awayTeam.shortCode}`
  const rivalry = KNOWN_RIVALRIES[key]
  if (rivalry) {
    context.push({ type: 'rivalry', label: rivalry.label, detail: rivalry.detail })
  }
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

interface StatsFetchResult {
  rows:       StatRow[]
  source:     StatsDataSource
  confidence: StatsConfidence
  fetchedAt:  string | undefined
  fixtureId:  string | undefined
}

function apiStatsToRows(home: ApiMatchStats['home'], away: ApiMatchStats['away']): StatRow[] {
  const rows: StatRow[] = []
  const add = (
    label: string, h: number | null, a: number | null,
    unit: string, higherIsBetter: boolean, format: 'integer' | 'decimal',
  ) => {
    if (h !== null && a !== null) {
      rows.push({ label, home: h, away: a, unit, higherIsBetter, format })
    }
  }
  add('Possession',       home.possession,    away.possession,    '%',  true,  'integer')
  add('Total Shots',      home.totalShots,    away.totalShots,    '',   true,  'integer')
  add('Shots on Target',  home.shotsOnTarget, away.shotsOnTarget, '',   true,  'integer')
  add('Corner Kicks',     home.corners,       away.corners,       '',   true,  'integer')
  add('Fouls',            home.fouls,         away.fouls,         '',   false, 'integer')
  add('Yellow Cards',     home.yellowCards,   away.yellowCards,   '',   false, 'integer')
  add('Saves',            home.saves,         away.saves,         '',   true,  'integer')
  add('Offsides',         home.offsides,      away.offsides,      '',   false, 'integer')
  add('Pass Accuracy',    home.passAccuracy,  away.passAccuracy,  '%',  true,  'integer')
  if (home.xG !== null && away.xG !== null) {
    rows.push({ label: 'Exp. Goals (xG)', home: home.xG, away: away.xG, unit: '', higherIsBetter: true, format: 'decimal' })
  }
  return rows
}

async function fetchMatchStats(matchId: string): Promise<StatsFetchResult> {
  const empty: StatsFetchResult = { rows: [], source: 'none', confidence: 'none', fetchedAt: undefined, fixtureId: undefined }
  try {
    const res = await fetch(`${API_BASE}/matches/${matchId}/stats`, { cache: 'no-store' })
    if (!res.ok) {
      const level = res.status === 501 ? 'info' : 'warn'
      console[level](`[MatchFacts] ${matchId} — stats endpoint returned HTTP ${res.status}`)
      return empty
    }
    const data = await res.json() as ApiMatchStats
    if (!data.verified) {
      console.warn(`[MatchFacts] ${matchId} — stats response has verified=false; discarding`)
      return empty
    }
    const rows = apiStatsToRows(data.home, data.away)
    console.log(`[MatchFacts] ${matchId} — stats: verified=true rows=${rows.length}`)
    return { rows, source: 'api-football', confidence: 'verified', fetchedAt: data.fetchedAt, fixtureId: data.fixtureId }
  } catch (err) {
    console.error(`[MatchFacts] ${matchId} — stats fetch threw: ${err instanceof Error ? err.message : String(err)}`)
    return empty
  }
}

async function safeHistFetch<T>(url: string): Promise<T | null> {
  try {
    const ctrl  = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10000)
    try {
      const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal })
      if (!res.ok) return null
      return await res.json() as T
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return null
  }
}

function buildHistoricalStats(
  code:  string,
  form:  TeamFormEntry[],
  stats: { avgCorners?: number; avgPossession?: number; avgShots?: number; fixtureCoverage?: number; fetchedAt?: string } | null,
): TeamHistoricalStats {
  const n = form.length
  const avgGoalsScored   = n ? form.reduce((s, f) => s + f.goalsFor, 0) / n : null
  const avgGoalsConceded = n ? form.reduce((s, f) => s + f.goalsAgt, 0) / n : null
  return {
    code,
    form,
    avgGoalsScored:   avgGoalsScored   !== null ? Math.round(avgGoalsScored   * 100) / 100 : null,
    avgGoalsConceded: avgGoalsConceded !== null ? Math.round(avgGoalsConceded * 100) / 100 : null,
    cleanSheets:      n ? form.filter(f => f.goalsAgt === 0).length : null,
    btts:             n ? form.filter(f => f.goalsFor > 0 && f.goalsAgt > 0).length : null,
    avgPossession:    stats?.avgPossession  ?? null,
    avgShots:         stats?.avgShots       ?? null,
    avgCorners:       stats?.avgCorners     ?? null,
    fixtureCoverage:  stats?.fixtureCoverage ?? n,
    confidence:       n >= 3 ? 'verified' : n > 0 ? 'partial' : 'none',
    fetchedAt:        stats?.fetchedAt ?? new Date().toISOString(),
  }
}

interface HistoricalResult {
  home:       TeamHistoricalStats | null
  away:       TeamHistoricalStats | null
  confidence: HistoricalConfidence
}

async function fetchHistoricalStats(matchId: string, homeCode: string, awayCode: string): Promise<HistoricalResult> {
  const base = `${API_BASE}/matches/${matchId}`
  type StatsShape = { avgCorners?: number; avgPossession?: number; avgShots?: number; fixtureCoverage?: number; fetchedAt?: string }

  const [homeForm, awayForm, homeStats, awayStats] = await Promise.all([
    safeHistFetch<TeamFormEntry[]>(`${base}/form/home`),
    safeHistFetch<TeamFormEntry[]>(`${base}/form/away`),
    safeHistFetch<StatsShape>(`${base}/stats/home`),
    safeHistFetch<StatsShape>(`${base}/stats/away`),
  ])

  const isValidForm = (f: unknown): f is TeamFormEntry[] =>
    Array.isArray(f) && f.length > 0 &&
    (f as TeamFormEntry[]).every(e => e.result === 'W' || e.result === 'D' || e.result === 'L')

  const homeHist = isValidForm(homeForm) ? buildHistoricalStats(homeCode, homeForm, homeStats ?? null) : null
  const awayHist = isValidForm(awayForm) ? buildHistoricalStats(awayCode, awayForm, awayStats ?? null) : null

  const confidence: HistoricalConfidence =
    homeHist && awayHist ? 'verified'
    : homeHist || awayHist ? 'partial'
    : 'none'

  return { home: homeHist, away: awayHist, confidence }
}

export async function computeMatchFacts(matchId: string, match: Match): Promise<MatchFacts | null> {
  const t0 = Date.now()
  console.log(`[MatchFacts] ${matchId} — start`)

  if (
    isTBD(match.homeTeam.shortCode, match.homeTeam.name) ||
    isTBD(match.awayTeam.shortCode, match.awayTeam.name)
  ) {
    console.log(`[MatchFacts] ${matchId} — teams TBD, returning pending placeholder`)
    return {
      matchId,
      generatedAt:       new Date().toISOString(),
      pendingData:       true,
      squad:             { home: { injured: [], suspended: [], doubtful: [] }, away: { injured: [], suspended: [], doubtful: [] } },
      squadSource:       'none',
      squadConfidence:   'none',
      squadFallbackUsed: false,
      stats:             [],
      statsSource:       'none',
      statsConfidence:   'none',
      statsFallbackUsed: false,
      provenance:        noProvenance('pending'),
      context:           [],
    }
  }

  try {
    const [squadResult, comprehensiveSquad, statsResult, historicalResult] = await Promise.all([
      fetchSquadNews(matchId, match.homeTeam.shortCode, match.awayTeam.shortCode),
      fetchComprehensiveSquadNews(matchId),
      fetchMatchStats(matchId),
      fetchHistoricalStats(matchId, match.homeTeam.shortCode, match.awayTeam.shortCode),
    ])

    const context    = buildContext(match.homeTeam, match.awayTeam, match.round)
    const homeSquad  = scrubSquadTeam(squadResult.home, 'home', matchId)
    const awaySquad  = scrubSquadTeam(squadResult.away, 'away', matchId)

    const statsVerified = statsResult.confidence   === 'verified'
    const squadVerified = squadResult.confidence   === 'verified' || comprehensiveSquad.confidence === 'verified'
    const histVerified  = historicalResult.confidence !== 'none'
    const now           = new Date().toISOString()

    const facts: MatchFacts = {
      matchId,
      generatedAt:          now,
      squad:                { home: homeSquad, away: awaySquad },
      squadSource:          squadResult.dataSource !== 'none' ? squadResult.dataSource : (comprehensiveSquad.confidence === 'verified' ? 'api-verified' : 'none'),
      squadConfidence:      squadResult.confidence !== 'none' ? squadResult.confidence : comprehensiveSquad.confidence,
      squadFetchedAt:       squadResult.fetchedAt,
      squadFallbackUsed:    false,
      squadLogs:            squadResult.logs,
      squadNews:            comprehensiveSquad,
      stats:                statsResult.rows,
      statsSource:          statsResult.source,
      statsConfidence:      statsResult.confidence,
      statsFetchedAt:       statsResult.fetchedAt,
      statsFixtureId:       statsResult.fixtureId,
      statsFallbackUsed:    false,
      historicalHome:       historicalResult.home  ?? undefined,
      historicalAway:       historicalResult.away  ?? undefined,
      historicalConfidence: historicalResult.confidence,
      provenance: statsVerified || squadVerified || histVerified
        ? realProvenance(
            [
              statsVerified ? 'api-football:/fixtures/statistics' : null,
              squadVerified ? 'backend:/squad' : null,
              histVerified  ? 'api-football:/fixtures?last=5' : null,
            ].filter(Boolean).join(', '),
            statsResult.fetchedAt ?? squadResult.fetchedAt ?? historicalResult.home?.fetchedAt ?? now,
          )
        : noProvenance('no-real-data-available'),
      context,
    }

    console.log(`[MatchFacts] ${matchId} — done in ${Date.now() - t0}ms`)
    return facts
  } catch (err) {
    console.error(`[MatchFacts] ${matchId} — pipeline threw:`, err instanceof Error ? err.stack : err)
    return null
  }
}
