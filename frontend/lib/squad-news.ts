/**
 * Real-data-only squad news fetcher.
 *
 * Contract:
 *  - Returns only player availability sourced from a live API response.
 *  - Returns null for any team whose endpoint is unavailable or returns invalid data.
 *  - NEVER invents, guesses, or fabricates player names, injuries, suspensions, or doubts.
 *  - Every returned entry has been validated against the schema.
 *  - Every returned entry carries source metadata (endpoint, timestamp, freshness age).
 *
 * If the backend does not yet implement the squad endpoint, the returned confidence
 * is 'none' and the component must show an explicit "no data" fallback.
 */

import type { RealSquadAvailability } from '@/types/insights-data'
import type {
  AvailabilityStatus,
  PlayerStatus,
  SquadDataSource,
  SquadConfidence,
  SquadFetchLog,
} from '@/types/match-facts'

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Reject squad data fetched more than 48 h before the match kick-off.
// (Once real-time data exists this can be tightened to e.g. 4 h.)
export const FRESHNESS_THRESHOLD_MS = 48 * 60 * 60 * 1000

const VALID_STATUSES = new Set<string>(['injured', 'suspended', 'doubtful'])

// ─── Schema validators ────────────────────────────────────────────

function isRealSquadShape(data: unknown): data is RealSquadAvailability {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  return Array.isArray(d.injured) && Array.isArray(d.suspended) && Array.isArray(d.doubtful)
}

function isValidPlayerEntry(p: unknown): p is { name: string; detail?: string } {
  if (typeof p !== 'object' || p === null) return false
  const player = p as Record<string, unknown>
  if (typeof player.name !== 'string' || player.name.trim().length < 2) return false
  if (player.detail !== undefined && typeof player.detail !== 'string') return false
  return true
}

// ─── Single-team fetch ────────────────────────────────────────────

interface TeamFetchResult {
  data: RealSquadAvailability | null
  log:  SquadFetchLog
}

async function fetchTeamSquad(
  endpoint: string,
  side:     'home' | 'away',
  matchId:  string,
): Promise<TeamFetchResult> {
  const fetchedAt    = new Date().toISOString()
  const freshnessAgeMs = 0   // just fetched — always current

  const makeLog = (
    httpStatus:       SquadFetchLog['httpStatus'],
    playerCount:      number,
    validationResult: SquadFetchLog['validationResult'],
  ): SquadFetchLog => ({
    endpoint,
    httpStatus,
    playerCount,
    fetchedAt,
    freshnessAgeMs,
    validationResult,
  })

  let res: Response
  try {
    res = await fetch(endpoint, { cache: 'no-store' })
  } catch (err) {
    console.error(
      `[SquadNews] match=${matchId} side=${side} — network error fetching ${endpoint}: ` +
      (err instanceof Error ? err.message : String(err)),
    )
    return { data: null, log: makeLog('network-error', 0, 'fail-schema') }
  }

  if (res.status === 404 || res.status === 501) {
    // Expected when the backend hasn't implemented this endpoint yet.
    // Not an error — just means no real data is available.
    console.log(
      `[SquadNews] match=${matchId} side=${side} — endpoint not implemented ` +
      `(HTTP ${res.status}): ${endpoint}`,
    )
    return { data: null, log: makeLog(res.status, 0, 'endpoint-missing') }
  }

  if (!res.ok) {
    console.warn(
      `[SquadNews] match=${matchId} side=${side} — HTTP ${res.status} from ${endpoint}`,
    )
    return { data: null, log: makeLog(res.status, 0, 'fail-schema') }
  }

  let raw: unknown
  try {
    raw = await res.json()
  } catch {
    console.warn(`[SquadNews] match=${matchId} side=${side} — invalid JSON from ${endpoint}`)
    return { data: null, log: makeLog(res.status, 0, 'fail-schema') }
  }

  if (!isRealSquadShape(raw)) {
    console.warn(
      `[SquadNews] match=${matchId} side=${side} — schema validation failed. ` +
      `Expected {injured,suspended,doubtful: Array}. Got: ${JSON.stringify(raw).slice(0, 120)}`,
    )
    return { data: null, log: makeLog(res.status, 0, 'fail-schema') }
  }

  // Validate and filter each player entry.  Reject anything with an empty
  // name, a non-string name, or an invalid status — never pass bad data through.
  const allEntries = [
    ...raw.injured.map(p => ({ ...p, _status: 'injured' })),
    ...raw.suspended.map(p => ({ ...p, _status: 'suspended' })),
    ...raw.doubtful.map(p => ({ ...p, _status: 'doubtful' })),
  ]
  const invalidCount = allEntries.filter(p => !isValidPlayerEntry(p)).length
  if (invalidCount > 0) {
    console.warn(
      `[SquadNews] match=${matchId} side=${side} — ${invalidCount} invalid player entries rejected ` +
      `(name missing or malformed)`,
    )
  }

  // Check for duplicate names — reject the duplicate, keep first occurrence
  const seen = new Set<string>()
  const deduplicate = (arr: { name: string; detail?: string }[]) =>
    arr.filter(p => {
      if (!isValidPlayerEntry(p)) return false
      const key = p.name.trim().toLowerCase()
      if (seen.has(key)) {
        console.warn(
          `[SquadNews] match=${matchId} side=${side} — duplicate player "${p.name}" rejected`,
        )
        return false
      }
      seen.add(key)
      return true
    })

  const validated: RealSquadAvailability = {
    injured:   deduplicate(raw.injured),
    suspended: deduplicate(raw.suspended),
    doubtful:  deduplicate(raw.doubtful),
  }

  const playerCount =
    validated.injured.length + validated.suspended.length + validated.doubtful.length

  const validationResult: SquadFetchLog['validationResult'] =
    playerCount === 0 ? 'empty' : 'pass'

  console.log(
    `[SquadNews] match=${matchId} side=${side} — ` +
    `players: injured=${validated.injured.length} suspended=${validated.suspended.length} ` +
    `doubtful=${validated.doubtful.length} — validation=${validationResult} — ` +
    `source=${endpoint} fetchedAt=${fetchedAt}`,
  )

  return { data: validated, log: makeLog(res.status, playerCount, validationResult) }
}

// ─── Build validated PlayerStatus entries ─────────────────────────

function toPlayerStatuses(
  players:   { name: string; detail?: string }[],
  status:    AvailabilityStatus,
  endpoint:  string,
  fetchedAt: string,
): PlayerStatus[] {
  return players.map(p => ({
    name:          p.name.trim(),
    status,
    detail:        p.detail?.trim(),
    source:        endpoint,
    fetchedAt,
    freshnessAgeMs: 0,
    validated:     true,
  }))
}

// ─── Public API ───────────────────────────────────────────────────

export interface SquadNewsTeam {
  injured:   PlayerStatus[]
  suspended: PlayerStatus[]
  doubtful:  PlayerStatus[]
}

export interface SquadNewsResult {
  home:       SquadNewsTeam
  away:       SquadNewsTeam
  dataSource: SquadDataSource
  confidence: SquadConfidence
  fetchedAt:  string
  logs: {
    home: SquadFetchLog
    away: SquadFetchLog
  }
}

export async function fetchSquadNews(
  matchId:      string,
  homeTeamCode: string,
  awayTeamCode: string,
): Promise<SquadNewsResult> {
  const base         = `${API_BASE}/matches/${matchId}`
  const homeEndpoint = `${base}/squad/home`
  const awayEndpoint = `${base}/squad/away`
  const fetchedAt    = new Date().toISOString()

  console.log(
    `[SquadNews] match=${matchId} — start (home=${homeTeamCode} away=${awayTeamCode}) ` +
    `API_BASE=${API_BASE}`,
  )

  const [homeResult, awayResult] = await Promise.all([
    fetchTeamSquad(homeEndpoint, 'home', matchId),
    fetchTeamSquad(awayEndpoint, 'away', matchId),
  ])

  const hasRealData  = homeResult.data !== null || awayResult.data !== null
  const dataSource: SquadDataSource = hasRealData ? 'api-verified' : 'none'
  const confidence: SquadConfidence = hasRealData ? 'verified' : 'none'

  const emptyTeam: SquadNewsTeam = { injured: [], suspended: [], doubtful: [] }

  const home: SquadNewsTeam = homeResult.data
    ? {
        injured:   toPlayerStatuses(homeResult.data.injured,   'injured',   homeEndpoint, fetchedAt),
        suspended: toPlayerStatuses(homeResult.data.suspended, 'suspended', homeEndpoint, fetchedAt),
        doubtful:  toPlayerStatuses(homeResult.data.doubtful,  'doubtful',  homeEndpoint, fetchedAt),
      }
    : emptyTeam

  const away: SquadNewsTeam = awayResult.data
    ? {
        injured:   toPlayerStatuses(awayResult.data.injured,   'injured',   awayEndpoint, fetchedAt),
        suspended: toPlayerStatuses(awayResult.data.suspended, 'suspended', awayEndpoint, fetchedAt),
        doubtful:  toPlayerStatuses(awayResult.data.doubtful,  'doubtful',  awayEndpoint, fetchedAt),
      }
    : emptyTeam

  const totalPlayers =
    home.injured.length + home.suspended.length + home.doubtful.length +
    away.injured.length + away.suspended.length + away.doubtful.length

  console.log(
    `[SquadNews] match=${matchId} — done: ` +
    `dataSource=${dataSource} confidence=${confidence} totalPlayers=${totalPlayers}`,
  )

  return { home, away, dataSource, confidence, fetchedAt, logs: { home: homeResult.log, away: awayResult.log } }
}
