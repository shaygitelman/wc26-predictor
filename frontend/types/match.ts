export type MatchStatus = 'scheduled' | 'live' | 'finished'

export type Round = 'group' | 'r32' | 'r16' | 'qf' | 'sf' | '3rd' | 'final'

export interface Team {
  id: string
  name: string
  shortCode: string     // e.g. "BRA", "FRA"
  flagUrl?: string
  group?: string
}

/** Full team record returned by GET /api/teams */
export interface TeamDetail {
  id:          string
  name:        string
  shortCode:   string
  flagUrl?:    string
  logoUrl?:    string
  groupName?:  string
  countryCode?: string
}

export interface Match {
  id: string
  homeTeam: Team
  awayTeam: Team
  scheduledAt: string   // ISO 8601 UTC
  venue?: string | null
  city?: string | null
  round: Round
  group?: string        // "A" … "L" (group stage only — 12 groups)
  status: MatchStatus
  homeScore?: number
  awayScore?: number
  period?: string       // "1H"|"HT"|"2H"|"ET"|"P" — only present while live
  minute?: number       // elapsed minutes from API
  thumbUrl?: string     // TheSportsDB match photo
}

export const ROUND_LABELS: Record<Round, string> = {
  group: 'Group Stage',
  r32:   'Round of 32',
  r16:   'Round of 16',
  qf:    'Quarter Finals',
  sf:    'Semi Finals',
  '3rd': '3rd Place',
  final: 'Final',
}

/** Player record from GET /api/players */
export interface Player {
  id:            string
  teamId?:       string
  teamName?:     string
  teamShortCode?: string
  teamFlagUrl?:  string
  name:          string
  position?:     'GK' | 'DEF' | 'MID' | 'FWD'
  shirtNumber?:  number
  photoUrl?:     string
  dateOfBirth?:  string   // YYYY-MM-DD
}
