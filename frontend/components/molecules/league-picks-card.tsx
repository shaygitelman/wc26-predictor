'use client'

import { useState, useEffect, useRef } from 'react'
import { Lock, Users, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { League } from '@/types/league'
import type { LeagueMemberPrediction } from '@/types/league'

function formatSubmittedAt(iso: string): string {
  const d     = new Date(iso)
  const now   = Date.now()
  const diffS = Math.floor((now - d.getTime()) / 1000)

  if (diffS < 60)       return 'just now'
  if (diffS < 3600)     return `${Math.floor(diffS / 60)}m ago`
  if (diffS < 86400)    return `${Math.floor(diffS / 3600)}h ago`
  if (diffS < 172800)   return 'yesterday'

  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

interface Props {
  matchId:          string
  matchStatus:      string
  initialLeagues?:  League[]
  initialPicks?:    LeagueMemberPrediction[]
}

// ─── Main card ────────────────────────────────────────────────

export function LeaguePicksCard({ matchId, matchStatus, initialLeagues, initialPicks }: Props) {
  const [leagues,        setLeagues]        = useState<League[]>(initialLeagues ?? [])
  const [selectedId,     setSelectedId]     = useState<string | null>(initialLeagues?.[0]?.id ?? null)
  const [members,        setMembers]        = useState<LeagueMemberPrediction[]>(initialPicks ?? [])
  const [pageStatus,     setPageStatus]     = useState<'loading' | 'ready' | 'none' | 'error'>(
    initialLeagues !== undefined
      ? (initialLeagues.length === 0 ? 'none' : 'ready')
      : 'loading'
  )
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError,   setMembersError]   = useState(false)

  // Refs track whether SSR data was provided so the initial fetches are skipped.
  // Using refs (not state) avoids triggering re-renders and keeps the logic
  // isolated to the effect that consumes it.
  const hasSSRLeagues = useRef(initialLeagues !== undefined)
  const hasSSRPicks   = useRef(initialPicks !== undefined)

  const revealed = matchStatus !== 'scheduled'

  // ── Step 1: load ALL league memberships (skipped when SSR provided them) ─
  useEffect(() => {
    if (hasSSRLeagues.current) return

    let cancelled = false

    fetch('/api/leagues', { cache: 'no-store' })
      .then(r => r.json())
      .then((data: League[]) => {
        if (cancelled) return
        const list = Array.isArray(data) ? data : []

        if (list.length === 0) {
          setPageStatus('none')
          return
        }

        setLeagues(list)
        setSelectedId(list[0].id)
        setPageStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setPageStatus('error')
      })

    return () => { cancelled = true }
  }, [matchId])

  // ── Step 2: load picks whenever the selected league changes ─
  // Skips the very first fetch when SSR already provided picks for the initial league.
  useEffect(() => {
    if (!selectedId) return

    if (hasSSRPicks.current) {
      hasSSRPicks.current = false  // only skip once — tab switches fetch normally
      return
    }

    let cancelled = false
    setMembersLoading(true)
    setMembersError(false)

    fetch(`/api/leagues/${selectedId}/matches/${matchId}/predictions`, { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<LeagueMemberPrediction[]>
      })
      .then(data => {
        if (cancelled) return
        setMembers(data)
        setMembersLoading(false)
      })
      .catch(() => {
        if (!cancelled) { setMembersError(true); setMembersLoading(false) }
      })

    return () => { cancelled = true }
  }, [selectedId, matchId])

  // ── Early exits ───────────────────────────────────────────
  if (pageStatus === 'loading') return <PicksSkeleton />
  if (pageStatus === 'none')    return null
  if (pageStatus === 'error')   return null

  const selectedLeague = leagues.find(l => l.id === selectedId)
  if (!selectedLeague) return null

  const pickCount = members.filter(m => m.prediction !== null).length

  const handleSelectLeague = (id: string) => {
    if (id === selectedId) return
    setSelectedId(id)
    setMembers([])
  }

  return (
    // NOTE: no overflow-hidden here — that class was killing the tab strip's
    // horizontal scroll on iOS Safari. Rounded corners handled via inner radius.
    <div className="bg-card rounded-2xl border border-border animate-fade-in shadow-card">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-border/50">
        <div className="flex items-center gap-2 min-w-0">
          <Users className="size-[15px] text-muted-foreground flex-shrink-0" strokeWidth={1.75} />
          <span className="text-[13px] font-bold text-foreground tracking-[-0.01em] truncate">
            {selectedLeague.name}
          </span>
          <span className="text-[11px] text-muted-foreground/50 font-medium flex-shrink-0">
            · {selectedLeague.memberCount}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
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
      </div>

      {/* ── League switcher — shown whenever user belongs to 2+ leagues ─
           Uses a NATIVE horizontal scroll without overflow-hidden ancestor
           so iOS Safari doesn't kill touch scrolling.               ── */}
      {leagues.length > 1 && (
        <LeagueTabs
          leagues={leagues}
          selectedId={selectedId}
          onSelect={handleSelectLeague}
        />
      )}

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
        {membersLoading ? (
          <MembersLoadingSkeleton />
        ) : membersError ? (
          <RetryRow onRetry={() => {
            setMembersError(false)
            const id = selectedId
            setSelectedId(null)
            setTimeout(() => setSelectedId(id), 0)
          }} />
        ) : members.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-[12px] text-muted-foreground/50">No members yet</p>
          </div>
        ) : (
          members.map((member, i) => (
            <MemberRow
              key={member.userId}
              member={member}
              revealed={revealed}
              matchStatus={matchStatus}
              index={i}
            />
          ))
        )}
      </div>

      {/* ── Footer ── */}
      {!revealed && !membersLoading && members.length > 0 && (
        <div className="px-4 py-3 border-t border-border/35">
          <p className="text-[11px] text-muted-foreground/50 text-center">
            {pickCount} of {members.length} predicted · all picks hidden until kickoff
          </p>
        </div>
      )}
    </div>
  )
}

// ─── League tabs strip ────────────────────────────────────────
//
// Extracted into its own component so the scroll container is a
// direct child of the card, never nested inside overflow-hidden.

function LeagueTabs({
  leagues,
  selectedId,
  onSelect,
}: {
  leagues:    League[]
  selectedId: string | null
  onSelect:   (id: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Scroll the active chip into view when selection changes
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const active = container.querySelector('[data-active="true"]') as HTMLElement | null
    if (!active) return
    active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [selectedId])

  return (
    <div
      ref={scrollRef}
      className="border-b border-border/50"
      style={{
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
        scrollbarWidth: 'none' as React.CSSProperties['scrollbarWidth'],
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        paddingLeft: 16,
        paddingRight: 16,
        paddingTop: 10,
        paddingBottom: 10,
      }}
    >
      {leagues.map(league => {
        const isActive = league.id === selectedId
        return (
          <button
            key={league.id}
            data-active={isActive}
            onClick={() => onSelect(league.id)}
            className={cn(
              // Fixed height + flex-shrink-0 guarantees chips never collapse
              'h-8 flex-shrink-0 flex items-center gap-1.5',
              'px-3.5 rounded-full text-[12px] font-bold whitespace-nowrap',
              'transition-all duration-150 active:scale-[0.95]',
              // Tap target: min-width so short names are still easy to tap on mobile
              'min-w-[52px] justify-center',
              isActive
                ? 'bg-primary text-primary-foreground shadow-[0_0_12px_rgba(136,117,255,0.4)]'
                : 'bg-card text-muted-foreground border border-border hover:text-foreground hover:border-border/80',
            )}
          >
            <span className="truncate max-w-[120px]">{league.name}</span>
            <span className={cn(
              'text-[10px] font-semibold tabular-nums flex-shrink-0',
              isActive ? 'text-primary-foreground/60' : 'text-muted-foreground/45',
            )}>
              {league.memberCount}
            </span>
          </button>
        )
      })}
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
      <span className="text-[11px] font-bold text-muted-foreground/45 w-4 text-center flex-shrink-0 tabular-nums">
        {member.rank ?? '—'}
      </span>

      <UserAvatar username={member.username} avatarId={member.avatarId} size={28} />

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
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground/50 tabular-nums">
            {member.totalPoints !== null ? `${member.totalPoints} pts` : '—'}
          </span>
          {revealed && member.prediction && !member.prediction.hidden && member.prediction.submittedAt && (
            <span className="text-[10px] text-muted-foreground/35">
              · {formatSubmittedAt(member.prediction.submittedAt)}
            </span>
          )}
        </div>
      </div>

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
    <div className="flex flex-col items-end gap-1 flex-shrink-0">
      <div className={cn('flex items-center gap-1 px-2.5 py-1 rounded-lg border', chipCls)}>
        <span className="text-[13px] font-black tabular-nums leading-none">
          {prediction.predictedHome}–{prediction.predictedAway}
        </span>
        {isFinished && outcome === 'exact' && (
          <span className="text-[11px] leading-none">★</span>
        )}
      </div>
      {prediction.isAutoPick && (
        <span className="text-[9px] font-black tracking-widest uppercase text-muted-foreground/40 bg-surface-elevated px-1.5 py-[1px] rounded">
          AUTO
        </span>
      )}
    </div>
  )
}

// ─── Retry row ────────────────────────────────────────────────

function RetryRow({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex items-center justify-center py-6">
      <button onClick={onRetry} className="text-xs font-bold text-primary">
        Failed to load — tap to retry
      </button>
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

function UserAvatar({ username, avatarId, size }: { username: string; avatarId?: string | null; size: number }) {
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
      className={cn('rounded-full flex items-center justify-center flex-shrink-0 font-black', AVATAR_COLORS[colorIdx])}
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {letter}
    </div>
  )
}

// ─── Skeletons ────────────────────────────────────────────────

function PicksSkeleton() {
  return (
    <div className="bg-card rounded-2xl border border-border">
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

function MembersLoadingSkeleton() {
  return (
    <div className="animate-pulse divide-y divide-border/35">
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
  )
}
