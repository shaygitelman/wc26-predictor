'use client'

import { useState, useEffect } from 'react'
import { Lock, Users, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { League } from '@/types/league'
import type { LeagueMemberPrediction, MemberPick } from '@/types/league'

interface Props {
  matchId:     string
  matchStatus: string
}

// ─── Main card ────────────────────────────────────────────────

export function LeaguePicksCard({ matchId, matchStatus }: Props) {
  const [league,  setLeague]  = useState<League | null>(null)
  const [members, setMembers] = useState<LeagueMemberPrediction[]>([])
  const [status,  setStatus]  = useState<'loading' | 'ready' | 'none' | 'error'>('loading')

  const revealed = matchStatus !== 'scheduled'

  useEffect(() => {
    let cancelled = false

    fetch('/api/leagues', { cache: 'no-store' })
      .then(r => r.json())
      .then(async (leagues: League[]) => {
        if (cancelled) return
        if (!Array.isArray(leagues) || !leagues.length) { setStatus('none'); return }

        const first = leagues[0]
        setLeague(first)

        const res = await fetch(
          `/api/leagues/${first.id}/matches/${matchId}/predictions`,
          { cache: 'no-store' },
        )
        if (!res.ok) throw new Error('Failed')
        const data: LeagueMemberPrediction[] = await res.json()
        if (cancelled) return
        setMembers(data)
        setStatus('ready')
      })
      .catch(() => { if (!cancelled) setStatus('error') })

    return () => { cancelled = true }
  }, [matchId])

  if (status === 'none' || status === 'error') return null
  if (status === 'loading' || !league)         return <PicksSkeleton />

  const pickCount = members.filter(m => m.prediction !== null).length

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden animate-fade-in shadow-card">
      <div className="divide-y divide-border/50">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2">
            <Users className="size-[15px] text-muted-foreground flex-shrink-0" strokeWidth={1.75} />
            <span className="text-[13px] font-bold text-foreground tracking-[-0.01em]">
              {league.name}
            </span>
          </div>
          {revealed ? (
            <div className="flex items-center gap-1.5 px-2 py-[3px] rounded-full bg-primary/10 border border-primary/20">
              <Sparkles className="size-3 text-primary/80 flex-shrink-0" strokeWidth={2} />
              <span className="text-[10px] font-bold text-primary/80">Picks revealed</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-[3px] rounded-full bg-muted/20 border border-border">
              <Lock className="size-3 text-muted-foreground/50 flex-shrink-0" strokeWidth={2} />
              <span className="text-[10px] font-bold text-muted-foreground/60">Locks at kickoff</span>
            </div>
          )}
        </div>

        {/* ── Reveal banner ── */}
        {revealed && (
          <div className="px-4 py-2.5 bg-primary/[0.05] border-b border-primary/10">
            <p className="text-[11px] text-primary/70 text-center font-semibold">
              League picks are now visible — see how your predictions compare
            </p>
          </div>
        )}

        {/* ── Member rows ── */}
        <div>
          {members.map((member, i) => (
            <MemberRow
              key={member.userId}
              member={member}
              revealed={revealed}
              matchStatus={matchStatus}
              index={i}
            />
          ))}
        </div>

        {/* ── Footer ── */}
        {!revealed && (
          <div className="px-4 py-3">
            <p className="text-[11px] text-muted-foreground/50 text-center">
              {pickCount} of {members.length} predicted · all picks hidden until kickoff
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Member row ───────────────────────────────────────────────

function MemberRow({
  member,
  revealed,
  matchStatus,
  index,
}: {
  member:      LeagueMemberPrediction
  revealed:    boolean
  matchStatus: string
  index:       number
}) {
  const delay = revealed ? `${index * 60}ms` : undefined

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 border-b border-border/35 last:border-0',
        member.isCurrentUser && 'bg-primary/[0.03]',
        revealed && 'animate-fade-in',
      )}
      style={delay ? { animationDelay: delay, animationFillMode: 'backwards' } : undefined}
    >
      {/* Rank */}
      <span className="text-[11px] font-bold text-muted-foreground/45 w-4 text-center flex-shrink-0 tabular-nums">
        {member.rank ?? '—'}
      </span>

      {/* Avatar */}
      <UserAvatar username={member.username} avatarId={member.avatarId} size={28} />

      {/* Name + points */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn(
            'text-[13px] font-semibold truncate',
            member.isCurrentUser ? 'text-primary' : 'text-foreground',
          )}>
            {member.username}
          </span>
          {member.isCurrentUser && (
            <span className="text-[9px] font-black uppercase tracking-wider text-primary/60 bg-primary/10 px-1.5 py-[1px] rounded-full flex-shrink-0">
              You
            </span>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground/50 tabular-nums">
          {member.totalPoints !== null ? `${member.totalPoints} pts` : '—'}
        </span>
      </div>

      {/* Pick chip */}
      <PickChip
        prediction={member.prediction}
        isCurrentUser={member.isCurrentUser}
        matchStatus={matchStatus}
      />
    </div>
  )
}

// ─── Pick chip ────────────────────────────────────────────────

function PickChip({
  prediction,
  isCurrentUser,
  matchStatus,
}: {
  prediction:    LeagueMemberPrediction['prediction']
  isCurrentUser: boolean
  matchStatus:   string
}) {
  if (!prediction) {
    return (
      <span className="text-[11px] text-muted-foreground/35 italic flex-shrink-0">
        no pick
      </span>
    )
  }

  if (prediction.hidden) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-elevated border border-border/40 flex-shrink-0">
        <Lock className="size-[11px] text-muted-foreground/30" strokeWidth={2} />
        <span className="text-[12px] font-black text-muted-foreground/25 tabular-nums tracking-wider">
          ?–?
        </span>
      </div>
    )
  }

  const isFinished = matchStatus === 'finished'
  const outcome    = prediction.outcome

  const chipCls = isFinished && outcome && outcome !== 'pending'
    ? outcome === 'exact'
      ? 'bg-status-won/10 border-status-won/25 text-status-won'
      : outcome === 'wrong'
      ? 'bg-status-lost/10 border-status-lost/20 text-status-lost'
      : 'bg-status-partial/10 border-status-partial/20 text-status-partial'
    : isCurrentUser
    ? 'bg-primary/[0.09] border-primary/25 text-primary'
    : 'bg-surface-elevated border-border/40 text-foreground'

  return (
    <div className={cn('flex items-center gap-1 px-2.5 py-1 rounded-lg border flex-shrink-0', chipCls)}>
      <span className="text-[13px] font-black tabular-nums leading-none">
        {prediction.predictedHome}–{prediction.predictedAway}
      </span>
      {isFinished && outcome === 'exact' && (
        <span className="text-[11px] leading-none">★</span>
      )}
    </div>
  )
}

// ─── User avatar ──────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-violet-500/20 text-violet-400',
  'bg-blue-500/20 text-blue-400',
  'bg-emerald-500/20 text-emerald-400',
  'bg-amber-500/20 text-amber-400',
  'bg-rose-500/20 text-rose-400',
  'bg-cyan-500/20 text-cyan-400',
]

function UserAvatar({
  username,
  avatarId,
  size,
}: {
  username: string
  avatarId?: string | null
  size:     number
}) {
  const colorIdx = username.charCodeAt(0) % AVATAR_COLORS.length
  const letter   = username[0]?.toUpperCase() ?? '?'

  if (avatarId) {
    return (
      <div
        className="rounded-full bg-surface-elevated flex items-center justify-center flex-shrink-0 text-base leading-none"
        style={{ width: size, height: size }}
      >
        {avatarId}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center flex-shrink-0 font-black',
        AVATAR_COLORS[colorIdx],
      )}
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {letter}
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────

function PicksSkeleton() {
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="animate-pulse divide-y divide-border/50">
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2">
            <div className="size-[15px] rounded bg-surface-elevated" />
            <div className="h-3.5 w-28 rounded-full bg-surface-elevated" />
          </div>
          <div className="h-5 w-24 rounded-full bg-surface-elevated" />
        </div>
        {[0, 1, 2].map(i => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="w-4 h-3 rounded-full bg-surface-elevated" />
            <div className="size-7 rounded-full bg-surface-elevated" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-24 rounded-full bg-surface-elevated" />
              <div className="h-2.5 w-14 rounded-full bg-surface-elevated" />
            </div>
            <div className="h-6 w-14 rounded-lg bg-surface-elevated" />
          </div>
        ))}
      </div>
    </div>
  )
}
