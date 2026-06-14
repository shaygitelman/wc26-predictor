'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { ContextHeader } from '@/components/layout/context-header'
import { MatchCard } from '@/components/molecules/match-card'
import { LiveDot } from '@/components/atoms/live-dot'
import { LiveRefresh } from '@/components/atoms/live-refresh'
import { formatMatchDate } from '@/lib/utils'
import type { Match } from '@/types/match'
import { apiFetch } from '@/lib/api-client'
import type { Prediction } from '@/types/prediction'
import type { ApiGroupStandings, ApiTeamStanding } from '@/types/standings'

// ─── Filter config ────────────────────────────────────────────

const FILTERS = [
  { value: 'all',      label: 'Remaining'   },
  { value: 'today',    label: 'Today'       },
  { value: 'finished', label: 'Finished'    },
  { value: 'groups',   label: 'Groups'      },
] as const

type FilterValue = typeof FILTERS[number]['value']

// ─── Helpers ─────────────────────────────────────────────────

const IL_TZ = 'Asia/Jerusalem'

function ilDateKey(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-CA', { timeZone: IL_TZ })
}

function applyFilter(matches: Match[], filter: FilterValue): Match[] {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: IL_TZ })
  switch (filter) {
    case 'all':      return matches.filter(m => m.status !== 'finished')
    case 'today':    return matches.filter(m => ilDateKey(m.scheduledAt) === today || m.status === 'live')
    case 'finished': return matches.filter(m => m.status === 'finished')
    default:         return matches
  }
}

function groupByDate(matches: Match[]): Array<{ dateKey: string; dateLabel: string; matches: Match[] }> {
  const map = new Map<string, Match[]>()
  for (const m of matches) {
    const key = ilDateKey(m.scheduledAt)
    const arr = map.get(key) ?? []
    arr.push(m)
    map.set(key, arr)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, ms]) => ({
      dateKey:   key,
      dateLabel: formatMatchDate(ms[0].scheduledAt),
      matches:   [...ms].sort((a, b) => {
        // Live matches surface first within each day
        const aLive = a.status === 'live' ? 0 : 1
        const bLive = b.status === 'live' ? 0 : 1
        if (aLive !== bLive) return aLive - bLive
        return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
      }),
    }))
}

function getSmartDateLabel(dateKey: string, dateLabel: string): string {
  const today    = new Date().toLocaleDateString('en-CA', { timeZone: IL_TZ })
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: IL_TZ })
  if (dateKey === today)    return 'Today'
  if (dateKey === tomorrow) return 'Tomorrow'
  return dateLabel
}

function hqFlag(url: string | null | undefined): string | null {
  if (!url) return null
  return url.includes('flagcdn.com') ? url.replace(/\/w\d+\//, '/w80/') : url
}

// ─── Segmented filter control ─────────────────────────────────

function SegmentedFilter({
  active,
  liveCount,
  onChange,
}: {
  active:    FilterValue
  liveCount: number
  onChange:  (v: FilterValue) => void
}) {
  const idx = FILTERS.findIndex(f => f.value === active)

  return (
    <div className="sticky top-0 z-10 px-4 py-3 border-b border-border/60 bg-background/97 backdrop-blur-xl">
      <div className="relative flex bg-surface-elevated rounded-xl p-1">
        <span
          className="absolute top-1 bottom-1 rounded-[10px] bg-card shadow-sm border border-border/60 transition-transform duration-200 ease-out pointer-events-none"
          style={{
            width:     `calc((100% - 8px) / ${FILTERS.length})`,
            transform: `translateX(calc(${idx} * 100%))`,
          }}
        />
        {FILTERS.map(({ value, label }) => {
          const isActive = active === value
          const showLive = value === 'today' && liveCount > 0
          return (
            <button
              key={value}
              onClick={() => onChange(value)}
              className={cn(
                'relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2',
                'text-xs font-semibold rounded-[10px] transition-colors duration-150',
                isActive ? 'text-foreground font-bold' : 'text-muted-foreground hover:text-foreground/70',
              )}
            >
              {showLive && <LiveDot size="sm" />}
              {label}
              {showLive && (
                <span className="text-2xs font-bold text-status-live tabular">{liveCount}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Groups standings view ────────────────────────────────────

function AllGroupsView({ standings }: { standings: ApiGroupStandings[] }) {
  if (standings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
        <p className="text-sm text-muted-foreground">Group standings not available yet.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      {standings.map(g => (
        <div key={g.group}>
          <p className="text-[11px] font-black tracking-[0.14em] uppercase text-muted-foreground/80 mb-2">
            Group {g.group}
          </p>
          <GroupTable group={g.group} teams={g.teams} />
        </div>
      ))}
    </div>
  )
}

function GroupTable({ group, teams }: { group: string; teams: ApiTeamStanding[] }) {
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-card">
      <div className="flex items-center px-3 py-2 border-b border-border bg-surface-elevated">
        <span className="text-2xs font-bold text-muted-foreground uppercase tracking-widest w-6 text-center flex-shrink-0">#</span>
        <span className="text-2xs font-bold text-muted-foreground uppercase tracking-widest flex-1 pl-2">Group {group}</span>
        <div className="flex gap-0 text-2xs font-bold text-muted-foreground uppercase tracking-widest">
          {['P','W','D','L','GD','Pts'].map((h, i) => (
            <span key={h} className={cn('text-center flex-shrink-0', i < 4 ? 'w-7' : i === 4 ? 'w-8' : 'w-8 text-primary')}>{h}</span>
          ))}
        </div>
      </div>
      {teams.map((team, i) => (
        <GroupRow key={team.isTbd ? `tbd-${i}` : team.id} team={team} rank={i + 1} isLast={i === teams.length - 1} />
      ))}
    </div>
  )
}

function GroupRow({ team, rank, isLast }: { team: ApiTeamStanding; rank: number; isLast: boolean }) {
  const qualified         = !team.isTbd && rank <= 2
  const possiblyQualified = !team.isTbd && team.possiblyQualified
  const gd                = team.goalDiff

  return (
    <div className={cn('flex items-center px-3 py-2.5 relative', !isLast && 'border-b border-border', team.isTbd && 'opacity-50')}>
      {qualified         && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-primary" />}
      {possiblyQualified && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-amber-400" />}

      <span className={cn('text-xs font-bold w-6 text-center flex-shrink-0',
        qualified ? 'text-primary' : possiblyQualified ? 'text-amber-400' : 'text-muted-foreground',
      )}>
        {rank}
      </span>

      <div className="flex items-center gap-2 flex-1 min-w-0 pl-2">
        {team.isTbd ? (
          <span className="w-5 h-3.5 rounded-sm bg-surface-elevated border border-border/60 flex-shrink-0" />
        ) : team.flagUrl ? (
          <Image src={hqFlag(team.flagUrl)!} alt={team.shortCode} width={20} height={14} sizes="20px" className="rounded-sm object-cover flex-shrink-0" />
        ) : (
          <span className="w-5 h-3.5 rounded-sm bg-surface-elevated flex-shrink-0" />
        )}
        <span className={cn('text-sm truncate',
          team.isTbd ? 'text-muted-foreground italic font-medium'
            : qualified || possiblyQualified ? 'font-semibold text-foreground'
            : 'font-semibold text-muted-foreground',
        )}>
          {team.isTbd ? 'TBD' : team.name}
        </span>
      </div>

      {team.isTbd ? (
        <div className="flex gap-0 text-xs text-muted-foreground tabular">
          {['w-7','w-7','w-7','w-7','w-8','w-8'].map((w, i) => (
            <span key={i} className={cn('text-center flex-shrink-0', w)}>—</span>
          ))}
        </div>
      ) : (
        <div className="flex gap-0 text-xs tabular">
          <span className="w-7 text-center flex-shrink-0 font-medium text-muted-foreground">{team.played}</span>
          <span className="w-7 text-center flex-shrink-0 font-medium text-muted-foreground">{team.won}</span>
          <span className="w-7 text-center flex-shrink-0 font-medium text-muted-foreground">{team.drawn}</span>
          <span className="w-7 text-center flex-shrink-0 font-medium text-muted-foreground">{team.lost}</span>
          <span className="w-8 text-center flex-shrink-0 font-medium text-muted-foreground">{gd >= 0 ? `+${gd}` : gd}</span>
          <span className={cn('w-8 text-center flex-shrink-0 font-bold', qualified ? 'text-primary' : possiblyQualified ? 'text-amber-400' : 'text-foreground')}>{team.points}</span>
        </div>
      )}
    </div>
  )
}

// ─── Client island ────────────────────────────────────────────

interface MatchesClientProps {
  initialMatches:     Match[]
  initialPredictions: Prediction[]
  initialStandings:   ApiGroupStandings[]
}

export function MatchesClient({ initialMatches, initialPredictions, initialStandings }: MatchesClientProps) {
  const [predictions, setPredictions] = useState<Prediction[]>(initialPredictions)
  const [filter,      setFilter]      = useState<FilterValue>('all')

  // liveCount drives <LiveRefresh>. It is derived from initialMatches directly:
  // router.refresh() (triggered by LiveRefresh) causes the Server Component to
  // re-execute with fresh data and push new initialMatches into this component.
  const liveCount = initialMatches.filter(m => m.status === 'live').length

  const lastFetchRef = useRef(0)

  useEffect(() => {
    function refreshPredictions() {
      const now = Date.now()
      if (now - lastFetchRef.current < 5_000) return  // 5s cooldown
      lastFetchRef.current = now
      apiFetch('/api/predictions/me')
        .then(r => r.ok ? r.json() : null)
        .then(ps => { if (ps) setPredictions(ps) })
        .catch(() => {})
    }

    // On mount (covers Link/router.push navigation to this page)
    refreshPredictions()

    // On window regain focus (user switches apps and returns)
    function onFocus() { refreshPredictions() }

    // On browser back/forward from bfcache (e.persisted = true)
    function onPageShow(e: PageTransitionEvent) { if (e.persisted) refreshPredictions() }

    window.addEventListener('focus', onFocus)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [])

  const pendingCount = useMemo(() =>
    initialMatches.filter(m => m.status === 'scheduled' && !predictions.find(p => p.matchId === m.id)).length,
    [initialMatches, predictions],
  )
  const dateGroups = useMemo(
    () => groupByDate(applyFilter(initialMatches, filter)),
    [initialMatches, filter],
  )

  return (
    <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
      {/* Triggers router.refresh() every 30 s while any match is live, which
          re-runs the Server Component and pushes fresh match data into this
          component — same mechanism as the home page. */}
      <LiveRefresh active={liveCount > 0} />

      <ContextHeader
        title="Schedule"
        actions={
          liveCount > 0 ? (
            <span className="flex items-center gap-1.5 bg-status-live-bg text-status-live rounded-full px-2.5 py-1 text-2xs font-bold">
              <span className="size-1.5 rounded-full bg-status-live animate-live-pulse" />
              {liveCount} Live
            </span>
          ) : undefined
        }
      />

      <SegmentedFilter active={filter} liveCount={liveCount} onChange={setFilter} />

      {filter === 'groups' ? (
        <AllGroupsView standings={initialStandings} />
      ) : (
        <>
          {pendingCount > 0 && filter !== 'finished' && (
            <div className="mx-4 mt-3 flex items-center gap-3 px-4 py-3 rounded-2xl bg-primary/[0.08] border border-primary/20 shadow-primary-glow/5">
              <div className="size-7 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 text-sm">
                ⚡
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-foreground leading-tight">
                  {pendingCount} prediction{pendingCount !== 1 ? 's' : ''} waiting
                </p>
                <p className="text-[11px] text-muted-foreground/60">Pick your scores before kick off</p>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-6 p-4">
            {dateGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
                <p className="text-sm text-muted-foreground">No matches found.</p>
                <button onClick={() => setFilter('all')} className="text-xs font-bold text-primary">
                  Clear filter
                </button>
              </div>
            ) : (
              dateGroups.map(({ dateKey, dateLabel, matches: dayMatches }) => {
                const smartLabel = getSmartDateLabel(dateKey, dateLabel)
                const isToday    = smartLabel === 'Today'
                return (
                  <section key={dateLabel}>
                    <div className="flex items-center gap-3 mb-3">
                      <p className={cn(
                        'text-[11px] font-black tracking-[0.14em] uppercase whitespace-nowrap',
                        isToday ? 'text-primary' : 'text-muted-foreground/80',
                      )}>
                        {smartLabel}
                      </p>
                      <div className={cn('flex-1 h-px', isToday ? 'bg-primary/30' : 'bg-border')} />
                    </div>
                    <div className="flex flex-col gap-3">
                      {dayMatches.map(match => (
                        <MatchCard
                          key={match.id}
                          match={match}
                          prediction={predictions.find(p => p.matchId === match.id)}
                        />
                      ))}
                    </div>
                  </section>
                )
              })
            )}
          </div>
        </>
      )}
    </div>
  )
}
