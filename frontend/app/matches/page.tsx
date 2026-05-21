'use client'

import { useState, useMemo, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { ContextHeader } from '@/components/layout/context-header'
import { MatchCard } from '@/components/molecules/match-card'
import { LiveDot } from '@/components/atoms/live-dot'
import { formatMatchDate } from '@/lib/utils'
import type { Match } from '@/types/match'
import type { Prediction } from '@/types/prediction'

// ─── Filter config ────────────────────────────────────────────

const FILTERS = [
  { value: 'all',      label: 'All Matches'  },
  { value: 'today',    label: 'Today'        },
  { value: 'finished', label: 'Finished'     },
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
  return Array.from(map.entries()).map(([key, ms]) => ({
    dateKey: key,
    dateLabel: formatMatchDate(ms[0].scheduledAt),
    matches: ms,
  }))
}

function getSmartDateLabel(dateKey: string, dateLabel: string): string {
  const today    = new Date().toLocaleDateString('en-CA', { timeZone: IL_TZ })
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: IL_TZ })
  if (dateKey === today)    return 'Today'
  if (dateKey === tomorrow) return 'Tomorrow'
  return dateLabel
}

// ─── Segmented filter control ─────────────────────────────────

function SegmentedFilter({
  active,
  liveCount,
  onChange,
}: {
  active: FilterValue
  liveCount: number
  onChange: (v: FilterValue) => void
}) {
  const idx = FILTERS.findIndex(f => f.value === active)

  return (
    <div className="sticky top-0 z-10 px-4 py-3 border-b border-border/60 bg-background/95 backdrop-blur-sm">
      <div className="relative flex bg-surface-elevated rounded-xl p-1">
        {/* Sliding pill */}
        <span
          className="absolute top-1 bottom-1 rounded-[10px] bg-card shadow-sm border border-border/60 transition-transform duration-200 ease-out pointer-events-none"
          style={{
            width: `calc((100% - 8px) / ${FILTERS.length})`,
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
                'text-sm font-semibold rounded-[10px] transition-colors duration-150',
                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/70',
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

// ─── Page ─────────────────────────────────────────────────────

export default function MatchesPage() {
  const [matches,     setMatches]     = useState<Match[]>([])
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(false)
  const [filter,      setFilter]      = useState<FilterValue>('all')

  function load() {
    setLoading(true)
    setError(false)
    Promise.all([
      fetch('/api/matches').then(r => { if (!r.ok) throw new Error(); return r.json() }),
      fetch('/api/predictions/me').then(r => r.ok ? r.json() : []),
    ])
      .then(([ms, ps]) => {
        setMatches(ms)
        setPredictions(ps)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh predictions when the user returns to this tab
  useEffect(() => {
    function onFocus() {
      fetch('/api/predictions/me').then(r => r.ok ? r.json() : null).then(ps => {
        if (ps) setPredictions(ps)
      }).catch(() => {})
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const liveCount    = matches.filter(m => m.status === 'live').length
  const pendingCount = useMemo(() =>
    matches.filter(m => m.status === 'scheduled' && !predictions.find(p => p.matchId === m.id)).length,
    [matches, predictions],
  )
  const groups = useMemo(() => groupByDate(applyFilter(matches, filter)), [matches, filter])

  if (loading) {
    return (
      <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
        <ContextHeader title="Schedule" />
        <div className="flex flex-1 items-center justify-center">
          <div className="size-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
        <ContextHeader title="Schedule" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm text-muted-foreground">Could not load matches.</p>
          <button onClick={load} className="text-xs font-bold text-primary">
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
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

      {pendingCount > 0 && filter !== 'finished' && (
        <div className="mx-4 mt-3 flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/[0.07] border border-primary/15">
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
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
            <p className="text-sm text-muted-foreground">No matches found.</p>
            <button
              onClick={() => setFilter('all')}
              className="text-xs font-bold text-primary"
            >
              Clear filter
            </button>
          </div>
        ) : (
          groups.map(({ dateKey, dateLabel, matches: dayMatches }) => {
            const smartLabel = getSmartDateLabel(dateKey, dateLabel)
            const isToday    = smartLabel === 'Today'
            return (
              <section key={dateLabel}>
                <div className="flex items-center gap-3 mb-3">
                  <p className={cn(
                    'text-2xs font-bold tracking-[0.12em] whitespace-nowrap',
                    isToday ? 'text-primary' : 'text-muted-foreground',
                  )}>
                    {smartLabel}
                  </p>
                  <div className={cn('flex-1 h-px', isToday ? 'bg-primary/25' : 'bg-border')} />
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
    </div>
  )
}
