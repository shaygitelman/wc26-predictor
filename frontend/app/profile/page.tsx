import Link from 'next/link'
import { ChevronRight, BookOpen, ShieldCheck } from 'lucide-react'
import { ContextHeader } from '@/components/layout/context-header'
import { ThemeToggle } from '@/components/atoms/theme-toggle'
import { UserAvatar } from '@/components/atoms/user-avatar'
import { TournamentPicksCard } from '@/components/molecules/tournament-picks-card'
import { SignOutButton } from '@/components/atoms/sign-out-button'
import { apiGet, apiGetCached } from '@/lib/api-server'
import type { User, UserStats } from '@/types/user'
import type { TournamentPick } from '@/types/tournament'
import type { TeamDetail } from '@/types/match'

export default async function ProfilePage() {
  const [userProfile, stats, tournamentPick, teamsResult] = await Promise.allSettled([
    apiGet<User>('/users/me'),
    apiGet<UserStats>('/users/me/stats'),
    apiGet<TournamentPick>('/tournament/picks/me'),
    apiGetCached<TeamDetail[]>('/teams', 300, { auth: false }),
  ])

  const user     = userProfile.status    === 'fulfilled' ? userProfile.value    : null
  const s        = stats.status          === 'fulfilled' ? stats.value          : null
  const pick     = tournamentPick.status === 'fulfilled' ? tournamentPick.value : { isLocked: false }
  const rawTeams = teamsResult.status    === 'fulfilled' ? teamsResult.value    : []

  const allTeams = rawTeams.map(t => ({
    id:        t.id,
    name:      t.name,
    shortCode: t.shortCode,
    flagUrl:   t.flagUrl,
    group:     t.groupName ?? undefined,
  }))

  return (
    <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
      <ContextHeader title="Profile" actions={<ThemeToggle />} />

      <div className="flex flex-col gap-5 p-4">

        {/* ── Avatar + identity ─────────────────────────────── */}
        <div className="flex flex-col items-center gap-3 pt-2 pb-1">
          <UserAvatar
            username={user?.username ?? '?'}
            avatarId={user?.avatarId}
            avatarUrl={user?.avatarUrl}
            size="xl"
          />
          <div className="text-center">
            <p className="text-[22px] font-black text-foreground">{user?.username ?? '—'}</p>
            {user?.bio ? (
              <p className="text-sm text-muted-foreground mt-0.5 max-w-[240px] leading-snug">
                {user.bio}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {user?.createdAt
                  ? <>Member since{' '}{new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</>
                  : 'Loading…'}
              </p>
            )}
            {user?.bio && user?.createdAt && (
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                Member since{' '}{new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </p>
            )}
          </div>
        </div>

        {/* ── Stats row ─────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-2">
          <StatCell label="Points"    value={s ? s.totalPoints.toString()         : '—'} variant="primary" />
          <StatCell label="Exact"     value={s ? s.exactScores.toString()         : '—'} />
          <StatCell label="Correct"   value={s ? s.correctPredictions.toString()  : '—'} />
          <StatCell label="Predicted" value={s ? `${s.totalPredictions}/104`      : '—'} />
        </div>

        {/* ── Tournament picks ──────────────────────────────── */}
        <TournamentPicksCard
          pick={pick}
          teams={allTeams}
        />

        {/* ── Prediction history entry ──────────────────────── */}
        <Link
          href="/profile/history"
          className="flex items-center gap-4 bg-card rounded-2xl border border-border px-4 py-4 hover:border-primary/30 transition-colors shadow-card"
        >
          <div className="flex-1">
            <p className="font-bold text-[15px] text-foreground">Prediction History</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {s
                ? `${s.exactScores} exact · ${s.correctPredictions} correct · ${s.totalPoints} pts earned`
                : 'View all predictions'}
            </p>
          </div>
          <ChevronRight className="size-5 text-muted-foreground flex-shrink-0" />
        </Link>

        {/* ── Settings ──────────────────────────────────────── */}
        <section>
          <p className="text-[11px] font-black tracking-[0.14em] uppercase text-muted-foreground/80 mb-3">
            Settings
          </p>
          <div className="bg-card rounded-2xl border border-border divide-y divide-border shadow-card">
            <Link
              href="/profile/edit"
              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-surface-elevated transition-colors text-left"
            >
              <span className="text-[15px] font-medium text-foreground">Edit Profile</span>
              <span className="text-muted-foreground text-lg leading-none">›</span>
            </Link>
            <Link
              href="/profile/privacy"
              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-surface-elevated transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-muted-foreground" />
                <span className="text-[15px] font-medium text-foreground">Privacy</span>
              </div>
              <span className="text-muted-foreground text-lg leading-none">›</span>
            </Link>
            <Link
              href="/rules"
              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-surface-elevated transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <BookOpen className="size-4 text-muted-foreground" />
                <span className="text-[15px] font-medium text-foreground">Rules</span>
              </div>
              <span className="text-muted-foreground text-lg leading-none">›</span>
            </Link>
            <SignOutButton />
          </div>
        </section>

      </div>
    </div>
  )
}

function StatCell({ label, value, variant }: { label: string; value: string; variant?: 'primary' | 'gold' }) {
  return (
    <div className="flex flex-col items-center gap-1 bg-card rounded-xl border border-border/70 py-3.5 px-1">
      <span className={[
        'text-lg font-black tabular leading-none',
        variant === 'gold'    ? 'text-gold-gradient' :
        variant === 'primary' ? 'text-primary'       :
        'text-foreground',
      ].join(' ')}>
        {value}
      </span>
      <span className="text-2xs text-muted-foreground/80 font-medium text-center leading-tight">
        {label}
      </span>
    </div>
  )
}
