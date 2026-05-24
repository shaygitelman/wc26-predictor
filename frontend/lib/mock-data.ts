import type { Match, Team } from '@/types/match'
import type { Prediction } from '@/types/prediction'
import type { User, UserStats } from '@/types/user'
import type { League, LeagueStanding } from '@/types/league'
import type { TopScorerNominee, TournamentPick } from '@/types/tournament'
import type { GroupStanding, BracketMatch } from '@/types/standings'

// ─── Flag helper ─────────────────────────────────────────────
const flag = (code: string) => `https://flagcdn.com/w40/${code}.png`

// ─── Teams ───────────────────────────────────────────────────
const T: Record<string, Team> = {
  BRA: { id: 'bra', name: 'Brazil',       shortCode: 'BRA', flagUrl: flag('br'), group: 'A' },
  FRA: { id: 'fra', name: 'France',        shortCode: 'FRA', flagUrl: flag('fr'), group: 'A' },
  USA: { id: 'usa', name: 'USA',           shortCode: 'USA', flagUrl: flag('us'), group: 'A' },
  MEX: { id: 'mex', name: 'Mexico',        shortCode: 'MEX', flagUrl: flag('mx'), group: 'A' },
  ARG: { id: 'arg', name: 'Argentina',     shortCode: 'ARG', flagUrl: flag('ar'), group: 'B' },
  ENG: { id: 'eng', name: 'England',       shortCode: 'ENG', flagUrl: flag('gb'), group: 'B' },
  MAR: { id: 'mar', name: 'Morocco',       shortCode: 'MAR', flagUrl: flag('ma'), group: 'B' },
  COL: { id: 'col', name: 'Colombia',      shortCode: 'COL', flagUrl: flag('co'), group: 'B' },
  GER: { id: 'ger', name: 'Germany',       shortCode: 'GER', flagUrl: flag('de'), group: 'C' },
  ESP: { id: 'esp', name: 'Spain',         shortCode: 'ESP', flagUrl: flag('es'), group: 'C' },
  JPN: { id: 'jpn', name: 'Japan',         shortCode: 'JPN', flagUrl: flag('jp'), group: 'C' },
  URU: { id: 'uru', name: 'Uruguay',       shortCode: 'URU', flagUrl: flag('uy'), group: 'C' },
  POR: { id: 'por', name: 'Portugal',      shortCode: 'POR', flagUrl: flag('pt'), group: 'D' },
  NED: { id: 'ned', name: 'Netherlands',   shortCode: 'NED', flagUrl: flag('nl'), group: 'D' },
  SEN: { id: 'sen', name: 'Senegal',       shortCode: 'SEN', flagUrl: flag('sn'), group: 'D' },
  ECU: { id: 'ecu', name: 'Ecuador',       shortCode: 'ECU', flagUrl: flag('ec'), group: 'D' },
}

// ─── Matches (dates relative to today: 2026-05-16) ───────────
const dt = (s: string) => new Date(s).toISOString()

export const MOCK_MATCHES: Match[] = [
  // ── Finished ─────────────────────────────────────────
  {
    id: 'm1',
    homeTeam: T.GER, awayTeam: T.ESP,
    scheduledAt: dt('2026-05-13T18:00:00Z'),
    venue: 'Allianz Arena',     city: 'Munich',
    round: 'group', group: 'C',
    status: 'finished', homeScore: 2, awayScore: 1,
  },
  {
    id: 'm2',
    homeTeam: T.POR, awayTeam: T.NED,
    scheduledAt: dt('2026-05-13T21:00:00Z'),
    venue: 'Estádio da Luz',    city: 'Lisbon',
    round: 'group', group: 'D',
    status: 'finished', homeScore: 1, awayScore: 1,
  },
  {
    id: 'm3',
    homeTeam: T.URU, awayTeam: T.COL,
    scheduledAt: dt('2026-05-14T20:00:00Z'),
    venue: 'Estadio Centenario', city: 'Montevideo',
    round: 'group', group: 'C',
    status: 'finished', homeScore: 0, awayScore: 2,
  },
  {
    id: 'm4',
    homeTeam: T.SEN, awayTeam: T.ECU,
    scheduledAt: dt('2026-05-14T17:00:00Z'),
    venue: 'Stade Léopold Sédar Senghor', city: 'Dakar',
    round: 'group', group: 'D',
    status: 'finished', homeScore: 3, awayScore: 1,
  },
  {
    id: 'm5',
    homeTeam: T.MAR, awayTeam: T.JPN,
    scheduledAt: dt('2026-05-15T19:00:00Z'),
    venue: 'Grand Stade Hassan II', city: 'Casablanca',
    round: 'group', group: 'B',
    status: 'finished', homeScore: 2, awayScore: 2,
  },
  // ── Live ──────────────────────────────────────────────
  {
    id: 'm6',
    homeTeam: T.ARG, awayTeam: T.ENG,
    scheduledAt: dt('2026-05-16T16:00:00Z'),
    venue: 'Rose Bowl',          city: 'Los Angeles',
    round: 'group', group: 'B',
    status: 'live', homeScore: 1, awayScore: 0, minute: 34,
  },
  // ── Today upcoming ────────────────────────────────────
  {
    id: 'm7',
    homeTeam: T.BRA, awayTeam: T.FRA,
    scheduledAt: dt('2026-05-16T20:00:00Z'),
    venue: 'MetLife Stadium',    city: 'New York',
    round: 'group', group: 'A',
    status: 'scheduled',
  },
  {
    id: 'm8',
    homeTeam: T.ESP, awayTeam: T.JPN,
    scheduledAt: dt('2026-05-16T23:00:00Z'),
    venue: 'AT&T Stadium',       city: 'Dallas',
    round: 'group', group: 'C',
    status: 'scheduled',
  },
  // ── Tomorrow ──────────────────────────────────────────
  {
    id: 'm9',
    homeTeam: T.USA, awayTeam: T.MEX,
    scheduledAt: dt('2026-05-17T22:00:00Z'),
    venue: 'AT&T Stadium',       city: 'Dallas',
    round: 'group', group: 'A',
    status: 'scheduled',
  },
  {
    id: 'm10',
    homeTeam: T.POR, awayTeam: T.COL,
    scheduledAt: dt('2026-05-17T18:00:00Z'),
    venue: 'Estádio da Luz',    city: 'Lisbon',
    round: 'group', group: 'D',
    status: 'scheduled',
  },
  // ── Day after ─────────────────────────────────────────
  {
    id: 'm11',
    homeTeam: T.GER, awayTeam: T.URU,
    scheduledAt: dt('2026-05-18T18:00:00Z'),
    venue: 'Allianz Arena',     city: 'Munich',
    round: 'group', group: 'C',
    status: 'scheduled',
  },
  {
    id: 'm12',
    homeTeam: T.FRA, awayTeam: T.ESP,
    scheduledAt: dt('2026-05-19T21:00:00Z'),
    venue: 'Parc des Princes',   city: 'Paris',
    round: 'group', group: 'A',
    status: 'scheduled',
  },
]

// ─── Current user ────────────────────────────────────────────
export const MOCK_USER: User = {
  id: 'user-1',
  username: 'your_username',
  createdAt: '2026-01-15T00:00:00Z',
}

export const MOCK_STATS: UserStats = {
  totalPoints:         5,   // p1(3) + p3(1) + p4(1) = 5 from scored matches
  globalRank:          1,
  totalUsers:          1,
  totalPredictions:    6,
  correctPredictions:  3,   // p1(exact) + p3(outcome) + p4(outcome)
  exactScores:         1,   // p1 only
  rankChange:          0,
}

// ─── User's predictions ───────────────────────────────────────
export const MOCK_PREDICTIONS: Prediction[] = [
  {
    id: 'p1', userId: 'user-1', matchId: 'm1',   // GER 2-1 ESP → exact (group: 3pts)
    predictedHome: 2, predictedAway: 1,
    pointsEarned: 3, outcome: 'exact',
    lockedAt: dt('2026-05-13T17:55:00Z'), createdAt: dt('2026-05-12T10:00:00Z'),
  },
  {
    id: 'p2', userId: 'user-1', matchId: 'm2',   // POR 1-1 NED → wrong (predicted 1-0 home win, actual draw)
    predictedHome: 1, predictedAway: 0,
    pointsEarned: 0, outcome: 'wrong',
    lockedAt: dt('2026-05-13T20:55:00Z'), createdAt: dt('2026-05-12T11:00:00Z'),
  },
  {
    id: 'p3', userId: 'user-1', matchId: 'm3',   // URU 0-2 COL → outcome (away win correct, diff mismatch: group 1pt)
    predictedHome: 0, predictedAway: 1,
    pointsEarned: 1, outcome: 'outcome',
    lockedAt: dt('2026-05-14T19:55:00Z'), createdAt: dt('2026-05-13T09:00:00Z'),
  },
  {
    id: 'p4', userId: 'user-1', matchId: 'm4',   // SEN 3-1 ECU → outcome (home win correct, diff mismatch: group 1pt)
    predictedHome: 2, predictedAway: 0,
    pointsEarned: 1, outcome: 'outcome',
    lockedAt: dt('2026-05-14T16:55:00Z'), createdAt: dt('2026-05-13T14:00:00Z'),
  },
  {
    id: 'p5', userId: 'user-1', matchId: 'm5',   // MAR 2-2 JPN → wrong (predicted 2-1 home win, actual draw: 0pts)
    predictedHome: 2, predictedAway: 1,
    pointsEarned: 0, outcome: 'wrong',
    lockedAt: dt('2026-05-15T18:55:00Z'), createdAt: dt('2026-05-14T20:00:00Z'),
  },
  {
    id: 'p6', userId: 'user-1', matchId: 'm6',   // ARG vs ENG (live) → pending
    predictedHome: 2, predictedAway: 0,
    outcome: 'pending',
    lockedAt: dt('2026-05-16T15:55:00Z'), createdAt: dt('2026-05-15T22:00:00Z'),
  },
]

// ─── Global leaderboard ───────────────────────────────────────
export const MOCK_LEADERBOARD = [
  { rank:   1, username: 'xavi_fan_2026',    points: 347, isCurrentUser: false },
  { rank:   2, username: 'goat_predictor',   points: 339, isCurrentUser: false },
  { rank:   3, username: 'ronaldo_forever',  points: 331, isCurrentUser: false },
  { rank:   4, username: 'tacticaltom',      points: 324, isCurrentUser: false },
  { rank:   5, username: 'el_classico99',    points: 319, isCurrentUser: false },
  { rank:   6, username: 'worldcupwizard',   points: 315, isCurrentUser: false },
  { rank:   7, username: 'futbol_prophet',   points: 314, isCurrentUser: false },
  { rank:   8, username: 'offside_king',     points: 314, isCurrentUser: false },
  { rank:   9, username: 'penalty_ace',      points: 313, isCurrentUser: false },
  { rank:  10, username: 'hattrick_hero',    points: 313, isCurrentUser: false },
  { rank: 140, username: 'closebehind',      points: 313, isCurrentUser: false },
  { rank: 141, username: 'almosthere',       points: 312, isCurrentUser: false },
  { rank: 142, username: 'your_username',    points: 312, isCurrentUser: true  },
  { rank: 143, username: 'right_behind_you', points: 311, isCurrentUser: false },
  { rank: 144, username: 'chasing_you',      points: 310, isCurrentUser: false },
]

// ─── Leagues ─────────────────────────────────────────────────
export const MOCK_LEAGUES: League[] = [
  {
    id: 'lg1', name: 'The Office FC',
    inviteCode: 'MP26-OFFC', createdBy: 'user-1',
    memberCount: 8, createdAt: '2026-05-01T00:00:00Z',
  },
  {
    id: 'lg2', name: 'FC Amigos',
    inviteCode: 'MP26-FAMI', createdBy: 'user-2',
    memberCount: 5, createdAt: '2026-05-10T00:00:00Z',
  },
]

export const MOCK_LEAGUE_STANDINGS: Record<string, LeagueStanding[]> = {
  lg1: [
    { userId: 'u1',     username: 'michaelscott_94', rank: 1, totalPoints: 318, joinedAt: '2026-05-01T00:00:00Z' },
    { userId: 'u2',     username: 'dwight_schrute',  rank: 2, totalPoints: 290, joinedAt: '2026-05-01T00:00:00Z' },
    { userId: 'user-1', username: 'your_username',   rank: 3, totalPoints: 312, joinedAt: '2026-05-01T00:00:00Z' },
    { userId: 'u3',     username: 'jim_halpert_99',  rank: 4, totalPoints: 198, joinedAt: '2026-05-02T00:00:00Z' },
    { userId: 'u4',     username: 'pamcam',           rank: 5, totalPoints: 187, joinedAt: '2026-05-02T00:00:00Z' },
    { userId: 'u5',     username: 'oscar_martinez',  rank: 6, totalPoints: 175, joinedAt: '2026-05-03T00:00:00Z' },
    { userId: 'u6',     username: 'kevin_malone',    rank: 7, totalPoints: 155, joinedAt: '2026-05-04T00:00:00Z' },
    { userId: 'u7',     username: 'kellycapoor',     rank: 8, totalPoints: 132, joinedAt: '2026-05-05T00:00:00Z' },
  ],
  lg2: [
    { userId: 'u8',     username: 'carlos_g',        rank: 1, totalPoints: 302, joinedAt: '2026-05-10T00:00:00Z' },
    { userId: 'user-1', username: 'your_username',   rank: 2, totalPoints: 312, joinedAt: '2026-05-11T00:00:00Z' },
    { userId: 'u9',     username: 'pedro_m',         rank: 3, totalPoints: 289, joinedAt: '2026-05-10T00:00:00Z' },
    { userId: 'u10',    username: 'ana_r',            rank: 4, totalPoints: 255, joinedAt: '2026-05-12T00:00:00Z' },
    { userId: 'u11',    username: 'sergio_b',         rank: 5, totalPoints: 198, joinedAt: '2026-05-10T00:00:00Z' },
  ],
}

// ─── Group standings (manually set, not auto-calculated) ────
export const MOCK_GROUP_STANDINGS: Record<string, GroupStanding[]> = {
  A: [
    { team: T.BRA, played: 2, won: 1, drawn: 1, lost: 0, goalsFor: 3, goalsAgainst: 1, points: 4 },
    { team: T.FRA, played: 2, won: 1, drawn: 0, lost: 1, goalsFor: 2, goalsAgainst: 2, points: 3 },
    { team: T.USA, played: 2, won: 0, drawn: 1, lost: 1, goalsFor: 1, goalsAgainst: 2, points: 1 },
    { team: T.MEX, played: 2, won: 0, drawn: 0, lost: 2, goalsFor: 1, goalsAgainst: 3, points: 0, qualified: 'eliminated' },
  ],
  B: [
    { team: T.ARG, played: 2, won: 2, drawn: 0, lost: 0, goalsFor: 4, goalsAgainst: 1, points: 6 },
    { team: T.MAR, played: 2, won: 0, drawn: 2, lost: 0, goalsFor: 2, goalsAgainst: 2, points: 2 },
    { team: T.ENG, played: 2, won: 0, drawn: 1, lost: 1, goalsFor: 1, goalsAgainst: 3, points: 1 },
    { team: T.COL, played: 2, won: 0, drawn: 1, lost: 1, goalsFor: 2, goalsAgainst: 3, points: 1, qualified: 'eliminated' },
  ],
  C: [
    { team: T.GER, played: 2, won: 1, drawn: 1, lost: 0, goalsFor: 3, goalsAgainst: 2, points: 4 },
    { team: T.ESP, played: 2, won: 1, drawn: 0, lost: 1, goalsFor: 3, goalsAgainst: 3, points: 3 },
    { team: T.JPN, played: 2, won: 0, drawn: 1, lost: 1, goalsFor: 1, goalsAgainst: 2, points: 1 },
    { team: T.URU, played: 2, won: 0, drawn: 0, lost: 2, goalsFor: 1, goalsAgainst: 4, points: 0, qualified: 'eliminated' },
  ],
  D: [
    { team: T.POR, played: 2, won: 1, drawn: 1, lost: 0, goalsFor: 4, goalsAgainst: 2, points: 4 },
    { team: T.SEN, played: 2, won: 1, drawn: 0, lost: 1, goalsFor: 3, goalsAgainst: 2, points: 3 },
    { team: T.NED, played: 2, won: 0, drawn: 1, lost: 1, goalsFor: 2, goalsAgainst: 3, points: 1 },
    { team: T.ECU, played: 2, won: 0, drawn: 0, lost: 2, goalsFor: 1, goalsAgainst: 4, points: 0, qualified: 'eliminated' },
  ],
}

// ─── Knockout bracket (group stage still ongoing → all TBD) ─
const tbd: BracketMatch['home'] = {}

export const MOCK_BRACKET: Record<string, BracketMatch[]> = {
  r16: [
    { id: 'r16-1', label: '1A vs 2B', home: tbd, away: tbd, status: 'tbd' },
    { id: 'r16-2', label: '1C vs 2D', home: tbd, away: tbd, status: 'tbd' },
    { id: 'r16-3', label: '1B vs 2A', home: tbd, away: tbd, status: 'tbd' },
    { id: 'r16-4', label: '1D vs 2C', home: tbd, away: tbd, status: 'tbd' },
    { id: 'r16-5', label: 'W(1E) vs W(2F)', home: tbd, away: tbd, status: 'tbd' },
    { id: 'r16-6', label: 'W(1G) vs W(2H)', home: tbd, away: tbd, status: 'tbd' },
    { id: 'r16-7', label: 'W(1F) vs W(2E)', home: tbd, away: tbd, status: 'tbd' },
    { id: 'r16-8', label: 'W(1H) vs W(2G)', home: tbd, away: tbd, status: 'tbd' },
  ],
  qf: [
    { id: 'qf-1', label: 'W(R16-1) vs W(R16-2)', home: tbd, away: tbd, status: 'tbd' },
    { id: 'qf-2', label: 'W(R16-3) vs W(R16-4)', home: tbd, away: tbd, status: 'tbd' },
    { id: 'qf-3', label: 'W(R16-5) vs W(R16-6)', home: tbd, away: tbd, status: 'tbd' },
    { id: 'qf-4', label: 'W(R16-7) vs W(R16-8)', home: tbd, away: tbd, status: 'tbd' },
  ],
  sf: [
    { id: 'sf-1', label: 'W(QF1) vs W(QF2)', home: tbd, away: tbd, status: 'tbd' },
    { id: 'sf-2', label: 'W(QF3) vs W(QF4)', home: tbd, away: tbd, status: 'tbd' },
  ],
  '3rd': [
    { id: '3rd-1', label: 'L(SF1) vs L(SF2)', home: tbd, away: tbd, status: 'tbd' },
  ],
  final: [
    { id: 'final-1', label: 'W(SF1) vs W(SF2)', home: tbd, away: tbd, status: 'tbd' },
  ],
}

// ─── Tournament nominees & pick ──────────────────────────────
export const MOCK_SCORER_NOMINEES: TopScorerNominee[] = [
  { id: 'sn1',  name: 'Kylian Mbappé',     teamShortCode: 'FRA', teamName: 'France',      flagUrl: flag('fr') },
  { id: 'sn2',  name: 'Vinícius Jr.',       teamShortCode: 'BRA', teamName: 'Brazil',      flagUrl: flag('br') },
  { id: 'sn3',  name: 'Lionel Messi',       teamShortCode: 'ARG', teamName: 'Argentina',   flagUrl: flag('ar') },
  { id: 'sn4',  name: 'Harry Kane',         teamShortCode: 'ENG', teamName: 'England',     flagUrl: flag('gb') },
  { id: 'sn5',  name: 'Lamine Yamal',       teamShortCode: 'ESP', teamName: 'Spain',       flagUrl: flag('es') },
  { id: 'sn6',  name: 'Erling Haaland',     teamShortCode: 'NED', teamName: 'Netherlands', flagUrl: flag('nl') },
  { id: 'sn7',  name: 'Cristiano Ronaldo',  teamShortCode: 'POR', teamName: 'Portugal',    flagUrl: flag('pt') },
  { id: 'sn8',  name: 'Florian Wirtz',      teamShortCode: 'GER', teamName: 'Germany',     flagUrl: flag('de') },
  { id: 'sn9',  name: 'Achraf Hakimi',      teamShortCode: 'MAR', teamName: 'Morocco',     flagUrl: flag('ma') },
  { id: 'sn10', name: 'Luis Díaz',          teamShortCode: 'COL', teamName: 'Colombia',    flagUrl: flag('co') },
]

export const MOCK_TOURNAMENT_PICK: TournamentPick = {
  winnerId:    undefined,
  topScorerId: undefined,
  submittedAt: undefined,
  isLocked:    false,
}

// ─── Helpers ─────────────────────────────────────────────────
export function getMatch(id: string): Match | undefined {
  return MOCK_MATCHES.find(m => m.id === id)
}

export function getPrediction(matchId: string): Prediction | undefined {
  return MOCK_PREDICTIONS.find(p => p.matchId === matchId)
}

export function getTodayMatches(): Match[] {
  const today = new Date().toDateString()
  return MOCK_MATCHES.filter(
    m => new Date(m.scheduledAt).toDateString() === today,
  )
}

export function getLeague(id: string): League | undefined {
  return MOCK_LEAGUES.find(l => l.id === id)
}

export function getLeagueStandings(leagueId: string): LeagueStanding[] {
  return MOCK_LEAGUE_STANDINGS[leagueId] ?? []
}
