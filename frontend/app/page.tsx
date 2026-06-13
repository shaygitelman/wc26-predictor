import { Suspense } from 'react'
import Link from 'next/link'
import { ChevronRight, TrendingUp } from 'lucide-react'
import { ContextHeader } from '@/components/layout/context-header'
import { ThemeToggle } from '@/components/atoms/theme-toggle'
import { UserAvatar } from '@/components/atoms/user-avatar'
import { LiveDot } from '@/components/atoms/live-dot'
import { MatchCard } from '@/components/molecules/match-card'
import { SectionHeader } from '@/components/molecules/section-header'
import { TournamentPicksCard } from '@/components/molecules/tournament-picks-card'
import { LeagueCard } from '@/components/molecules/league-card'
import { LiveRefresh } from '@/components/atoms/live-refresh'
import { DidYouKnow } from '@/components/atoms/did-you-know'
import { apiGet, apiGetCached } from '@/lib/api-server'
import { getSessionUser } from '@/lib/session'
import type { User, UserStats } from '@/types/user'
import type { Match, TeamDetail } from '@/types/match'
import type { League, LeagueStanding } from '@/types/league'
import type { TournamentPick } from '@/types/tournament'
import type { Prediction } from '@/types/prediction'

export default async function HomePage() {
  const [
    sessionResult,
    userResult, statsResult, matchesResult,
    leaguesResult, teamsResult, pickResult, predsResult,
  ] = await Promise.allSettled([
    getSessionUser(),
    apiGet<User>('/users/me'),
    apiGet<UserStats>('/users/me/stats'),
    apiGetCached<Match[]>('/matches', 30, { auth: false }),
    apiGet<League[]>('/leagues/me'),
    apiGetCached<TeamDetail[]>('/teams', 300, { auth: false }),
    apiGet<TournamentPick>('/tournament/picks/me'),
    apiGet<Prediction[]>('/predictions/me'),
  ])

  // If the backend is sleeping or returns an error, fall back to the JWT cookie
  // so the profile strip still shows the correct name/avatar.
  const sessionUser = sessionResult.status === 'fulfilled' ? sessionResult.value : null
  const user     = (userResult.status    === 'fulfilled' ? userResult.value    : null)
                ?? (sessionUser ? {
                     id:        sessionUser.sub,
                     username:  sessionUser.username ?? '',
                     name:      sessionUser.name,
                     avatarUrl: sessionUser.picture,
                     createdAt: '',
                   } as User : null)
  const s        = statsResult.status   === 'fulfilled' ? statsResult.value   : null
  const matches  = matchesResult.status === 'fulfilled' ? matchesResult.value : []
  const leagues  = leaguesResult.status === 'fulfilled' ? leaguesResult.value : []
  const rawTeams = teamsResult.status   === 'fulfilled' ? teamsResult.value   : []
  const pick     = pickResult.status    === 'fulfilled' ? pickResult.value    : { isLocked: false }
  const preds    = predsResult.status   === 'fulfilled' ? predsResult.value   : []

  const predsByMatch = new Map(preds.map(p => [p.matchId, p]))

  const todayIL = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
  const todayMs = [
    ...matches.filter(m =>
      new Date(m.scheduledAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }) === todayIL
    ),
    ...matches.filter(m => m.status === 'live'),
  ]
  const unique = Array.from(new Map(todayMs.map(m => [m.id, m])).values())

  const liveMatches  = unique.filter(m => m.status === 'live')
  const upcomingPred = unique.filter(m => m.status === 'scheduled' && !predsByMatch.has(m.id))

  const nextMatch = matches
    .filter(m => m.status === 'scheduled')
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0] ?? null

  const allTeams = rawTeams.map(t => ({
    id:        t.id,
    name:      t.name,
    shortCode: t.shortCode,
    flagUrl:   t.flagUrl,
    group:     t.groupName ?? undefined,
  }))

  return (
    <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
      <ContextHeader
        title="MatchPoint26"
        actions={
          <div className="flex items-center gap-1">
            <ThemeToggle />
          </div>
        }
      />

      <LiveRefresh active={liveMatches.length > 0} />
      <div className="flex flex-col gap-6 p-4">

        {/* ── Profile strip ──────────────────────────────────── */}
        <Link
          href="/profile"
          className="relative flex items-center gap-3 bg-card rounded-2xl border border-border px-4 py-4 hover:border-primary/40 hover:shadow-primary-glow hover:scale-[1.01] transition-all duration-200 overflow-hidden shadow-card"
        >
          {/* Stronger purple sweep from left */}
          <div className="absolute inset-0 bg-gradient-to-r from-primary/[0.13] via-primary/[0.03] to-transparent pointer-events-none" />
          {/* Top highlight line */}
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent pointer-events-none" />
          <UserAvatar username={user?.username ?? '?'} avatarId={user?.avatarId} avatarUrl={user?.avatarUrl} size="md" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[15px] text-foreground">{user?.username ?? '—'}</p>
            {s?.rankChange && s.rankChange > 0 ? (
              <div className="inline-flex items-center gap-1 text-[11px] font-bold text-status-won bg-status-won/10 px-2 py-0.5 rounded-full">
                <TrendingUp className="size-3" />
                <span>+{s.rankChange} places today</span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">View your profile</p>
            )}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              <p className="text-[22px] font-black text-gold tabular leading-none">
                {s ? s.totalPoints : '—'}
              </p>
              <p className="text-2xs text-muted-foreground mt-0.5">pts</p>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </div>
        </Link>

        {/* ── Live Now — highest priority: immediately after profile strip ── */}
        {liveMatches.length > 0 && (
          <section className="relative -mx-1">
            {/* Multi-layer green atmosphere — extended beyond section bounds */}
            <div
              className="absolute pointer-events-none rounded-3xl"
              style={{
                inset: '-20px -12px',
                background: 'radial-gradient(ellipse at 50% 30%, rgba(0,212,106,0.13) 0%, transparent 70%)',
              }}
            />
            <div
              className="absolute pointer-events-none rounded-3xl"
              style={{
                inset: '-10px -4px',
                background: 'radial-gradient(ellipse at 50% 0%, rgba(0,212,106,0.08) 0%, transparent 60%)',
              }}
            />
            {/* Top green separator line */}
            <div
              className="absolute -top-3 left-0 right-0 h-[1px] pointer-events-none"
              style={{ background: 'linear-gradient(to right, transparent, rgba(0,212,106,0.35) 30%, rgba(0,212,106,0.35) 70%, transparent)' }}
            />
            {/* Bottom green separator line */}
            <div
              className="absolute -bottom-3 left-0 right-0 h-[1px] pointer-events-none"
              style={{ background: 'linear-gradient(to right, transparent, rgba(0,212,106,0.20) 30%, rgba(0,212,106,0.20) 70%, transparent)' }}
            />

            <div className="relative px-1">
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <LiveDot size="md" />
                  <span className="text-[13px] font-black tracking-[0.12em] uppercase text-status-live">
                    Live Now
                  </span>
                </div>
                <span
                  className="text-[11px] font-bold text-status-live px-2.5 py-1 rounded-full"
                  style={{ background: 'rgba(0,212,106,0.10)' }}
                >
                  {liveMatches.length} {liveMatches.length === 1 ? 'match' : 'matches'}
                </span>
              </div>

              <div className="flex flex-col gap-3">
                {liveMatches.map(match => (
                  <MatchCard key={match.id} match={match} prediction={predsByMatch.get(match.id)} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── Tournament picks ───────────────────────────────── */}
        <TournamentPicksCard pick={pick} teams={allTeams} />

        {/* ── Predict Now ────────────────────────────────────── */}
        {upcomingPred.length > 0 && (
          <section className="relative">
            <div className="absolute -inset-3 rounded-3xl bg-gradient-to-b from-primary/[0.05] to-transparent pointer-events-none" />
            <div className="relative">
            <SectionHeader title="Predict Now" href="/matches" accent="primary" />
            <div className="flex flex-col gap-3">
              {upcomingPred.slice(0, 3).map(match => (
                <MatchCard key={match.id} match={match} prediction={undefined} />
              ))}
              {upcomingPred.length > 3 && (
                <Link
                  href="/matches"
                  className="flex items-center justify-center gap-1.5 py-3 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
                >
                  +{upcomingPred.length - 3} more matches
                  <ChevronRight className="size-3.5" />
                </Link>
              )}
            </div>
            </div>
          </section>
        )}

        {/* ── Did You Know ───────────────────────────────────── */}
        <DidYouKnow nextMatch={nextMatch} />

        {/* ── My Leagues ─────────────────────────────────────── */}
        <MyLeaguesSection leagues={leagues} userId={user?.id} />

      </div>
    </div>
  )
}

async function LeagueWithStandings({ league, userId }: { league: League; userId?: string }) {
  const standings = await apiGet<LeagueStanding[]>(`/leagues/${league.id}/standings`).catch(() => [])
  const me     = standings.find(s => s.userId === userId)
  const leader = standings[0]
  return (
    <LeagueCard
      league={league}
      userPoints={me?.totalPoints ?? undefined}
      leaderUsername={leader?.username}
      leaderPoints={leader?.totalPoints ?? undefined}
    />
  )
}

function MyLeaguesSection({ leagues, userId }: { leagues: League[]; userId?: string }) {
  return (
    <section>
      <SectionHeader title="My Leagues" href="/leagues" />
      {leagues.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2 bg-card rounded-2xl border border-border text-center shadow-card">
          <p className="text-sm text-muted-foreground">You haven&apos;t joined any leagues yet.</p>
          <Link href="/leagues" className="text-xs font-bold text-primary">
            Create or join one →
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {leagues.map(league => (
            <Suspense key={league.id} fallback={<LeagueCard league={league} />}>
              <LeagueWithStandings league={league} userId={userId} />
            </Suspense>
          ))}
        </div>
      )}
    </section>
  )
}
