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
import { apiGet, apiGetCached } from '@/lib/api-server'
import type { User, UserStats } from '@/types/user'
import type { Match, TeamDetail } from '@/types/match'
import type { League, LeagueStanding } from '@/types/league'
import type { TournamentPick } from '@/types/tournament'
import type { Prediction } from '@/types/prediction'

export default async function HomePage() {
  const [
    userResult, statsResult, matchesResult,
    leaguesResult, teamsResult, pickResult, predsResult,
  ] = await Promise.allSettled([
    apiGet<User>('/users/me'),
    apiGet<UserStats>('/users/me/stats'),
    apiGetCached<Match[]>('/matches', 30, { auth: false }),
    apiGet<League[]>('/leagues/me'),
    apiGetCached<TeamDetail[]>('/teams', 300, { auth: false }),
    apiGet<TournamentPick>('/tournament/picks/me'),
    apiGet<Prediction[]>('/predictions/me'),
  ])

  const user     = userResult.status    === 'fulfilled' ? userResult.value    : null
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
          className="relative flex items-center gap-3 bg-card rounded-2xl border border-border px-4 py-3.5 hover:border-primary/30 transition-all overflow-hidden shadow-card"
        >
          {/* Subtle left-gradient brand accent */}
          <div className="absolute inset-0 bg-gradient-to-r from-primary/[0.06] via-transparent to-transparent pointer-events-none" />
          <UserAvatar username={user?.username ?? '?'} avatarId={user?.avatarId} avatarUrl={user?.avatarUrl} size="md" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[15px] text-foreground">{user?.username ?? '—'}</p>
            {s?.rankChange && s.rankChange > 0 ? (
              <div className="flex items-center gap-1 text-xs font-semibold text-status-won">
                <TrendingUp className="size-3" />
                <span>+{s.rankChange} places today</span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">View your profile</p>
            )}
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="text-center">
              <p className="text-lg font-black text-primary tabular leading-none">
                {s ? s.totalPoints : '—'}
              </p>
              <p className="text-2xs text-muted-foreground mt-0.5">pts</p>
            </div>
<ChevronRight className="size-4 text-muted-foreground" />
          </div>
        </Link>

        {/* ── Tournament picks ───────────────────────────────── */}
        <TournamentPicksCard pick={pick} teams={allTeams} />

        {/* ── Live Now — featured atmosphere section ─────────── */}
        {liveMatches.length > 0 && (
          <section className="relative">
            {/* Green ambient glow behind the section */}
            <div className="absolute -inset-4 rounded-3xl bg-live-atmosphere pointer-events-none" />
            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <LiveDot size="md" />
                  <span className="text-[11px] font-black tracking-[0.14em] uppercase text-status-live">
                    Live Now
                  </span>
                </div>
                <span className="text-2xs font-bold text-status-live/70">
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

        {/* ── Predict Now ────────────────────────────────────── */}
        {upcomingPred.length > 0 && (
          <section>
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
          </section>
        )}

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
      userPoints={me?.totalPoints}
      leaderUsername={leader?.username}
      leaderPoints={leader?.totalPoints}
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
