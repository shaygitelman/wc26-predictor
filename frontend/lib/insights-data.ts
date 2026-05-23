import type { Match } from '@/types/match'
import type {
  InsightsRawData,
  RealFormResult,
  RealH2HRecord,
  RealPlayerStat,
  RealTeamStats,
  RealSquadAvailability,
} from '@/types/insights-data'

const API_BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

async function safeFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 300 } })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

// ─── Validators — reject malformed or incomplete responses ────────

function isValidFormArray(data: unknown): data is RealFormResult[] {
  if (!Array.isArray(data) || data.length === 0) return false
  return data.every(r => {
    if (typeof r !== 'object' || r === null) return false
    const result = (r as Record<string, unknown>).result
    return result === 'W' || result === 'D' || result === 'L'
  })
}

function isValidH2H(data: unknown): data is RealH2HRecord {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  return (
    typeof d.homeWins     === 'number' &&
    typeof d.awayWins     === 'number' &&
    typeof d.draws        === 'number' &&
    typeof d.totalMatches === 'number'
  )
}

function isValidPlayerStats(data: unknown): data is RealPlayerStat[] {
  if (!Array.isArray(data) || data.length === 0) return false
  return data.every(p => {
    if (typeof p !== 'object' || p === null) return false
    const player = p as Record<string, unknown>
    return typeof player.name === 'string' && typeof player.goals === 'number'
  })
}

function isValidTeamStats(data: unknown): data is RealTeamStats {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  // Accept partial stats — at least one numeric field must be present
  return (
    typeof d.avgCorners    === 'number' ||
    typeof d.avgPossession === 'number' ||
    typeof d.avgShots      === 'number'
  )
}

function isValidSquadAvailability(data: unknown): data is RealSquadAvailability {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  return Array.isArray(d.injured) && Array.isArray(d.suspended) && Array.isArray(d.doubtful)
}

// ─── Main fetch function ──────────────────────────────────────────

export async function fetchInsightsData(match: Match): Promise<InsightsRawData> {
  const base       = `${API_BASE}/matches/${match.id}`
  const isKnockout = match.round !== 'group'

  const [
    homeFormRaw, awayFormRaw,
    h2hRaw,
    homePlayersRaw, awayPlayersRaw,
    homeStatsRaw, awayStatsRaw,
    homeSquadRaw, awaySquadRaw,
  ] = await Promise.all([
    safeFetch<unknown>(`${base}/form/home`),
    safeFetch<unknown>(`${base}/form/away`),
    safeFetch<unknown>(`${base}/h2h`),
    safeFetch<unknown>(`${base}/players/home`),
    safeFetch<unknown>(`${base}/players/away`),
    safeFetch<unknown>(`${base}/stats/home`),
    safeFetch<unknown>(`${base}/stats/away`),
    safeFetch<unknown>(`${base}/squad/home`),
    safeFetch<unknown>(`${base}/squad/away`),
  ])

  return {
    matchId:  match.id,
    homeTeam: { id: match.homeTeam.id, name: match.homeTeam.name, shortCode: match.homeTeam.shortCode },
    awayTeam: { id: match.awayTeam.id, name: match.awayTeam.name, shortCode: match.awayTeam.shortCode },
    homeForm:    isValidFormArray(homeFormRaw)             ? homeFormRaw    : undefined,
    awayForm:    isValidFormArray(awayFormRaw)             ? awayFormRaw    : undefined,
    h2h:         isValidH2H(h2hRaw)                       ? h2hRaw         : undefined,
    homePlayers: isValidPlayerStats(homePlayersRaw)        ? homePlayersRaw : undefined,
    awayPlayers: isValidPlayerStats(awayPlayersRaw)        ? awayPlayersRaw : undefined,
    homeStats:   isValidTeamStats(homeStatsRaw)            ? homeStatsRaw   : undefined,
    awayStats:   isValidTeamStats(awayStatsRaw)            ? awayStatsRaw   : undefined,
    homeSquad:   isValidSquadAvailability(homeSquadRaw)    ? homeSquadRaw   : undefined,
    awaySquad:   isValidSquadAvailability(awaySquadRaw)    ? awaySquadRaw   : undefined,
    round:       match.round,
    isKnockout,
    fetchedAt:   new Date().toISOString(),
  }
}
