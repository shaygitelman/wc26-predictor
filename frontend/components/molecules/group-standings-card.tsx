'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { TableProperties } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ApiGroupStandings, ApiTeamStanding } from '@/types/standings'

interface Props {
  matchId:     string
  homeCode:    string
  awayCode:    string
  matchStatus: string
  group:       string
}

// Upgrade flagcdn.com URLs to high-DPI resolution (w160 = sharp at 2× retina)
function hqFlag(url: string | null | undefined): string | null {
  if (!url) return null
  return url.includes('flagcdn.com') ? url.replace(/\/w\d+\//, '/w160/') : url
}

export function GroupStandingsCard({ matchId, homeCode, awayCode, matchStatus, group }: Props) {
  const [data,   setData]   = useState<ApiGroupStandings | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  const isLive = matchStatus === 'live'

  useEffect(() => {
    let cancelled = false

    const load = () => {
      fetch(`/api/matches/${matchId}/group`, { cache: 'no-store' })
        .then(r => {
          if (r.status === 404) { setStatus('error'); return null }
          if (!r.ok) throw new Error(String(r.status))
          return r.json() as Promise<ApiGroupStandings>
        })
        .then(d => {
          if (cancelled || !d) return
          setData(d)
          setStatus('ready')
        })
        .catch(() => { if (!cancelled) setStatus('error') })
    }

    load()

    if (isLive) {
      const iv = setInterval(load, 60_000)
      return () => { cancelled = true; clearInterval(iv) }
    }
    return () => { cancelled = true }
  }, [matchId, isLive])

  if (status === 'error') return null
  if (status === 'loading' || !data) return <Skeleton />

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-card animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <TableProperties className="size-[15px] text-muted-foreground flex-shrink-0" strokeWidth={1.75} />
          <span className="text-[13px] font-bold text-foreground tracking-[-0.01em]">
            Group {group}
          </span>
        </div>
        {isLive && (
          <span className="flex items-center gap-1.5 text-[9px] font-black tracking-[0.06em] uppercase px-2 py-[3px] rounded-full bg-status-live/10 text-status-live border border-status-live/20">
            <span className="size-1.5 rounded-full bg-status-live animate-live-pulse" />
            Live
          </span>
        )}
      </div>

      {/* ── Column headers ── */}
      <div className="flex items-center px-3 py-1.5 bg-surface-elevated/60 border-b border-border/40">
        <span className="w-5 flex-shrink-0" />
        <span className="flex-1 pl-8 text-[9px] font-black tracking-[0.13em] uppercase text-muted-foreground/50">
          Team
        </span>
        <div className="flex gap-0">
          <ColHead w="w-7">P</ColHead>
          <ColHead w="w-7">W</ColHead>
          <ColHead w="w-7">D</ColHead>
          <ColHead w="w-7">L</ColHead>
          <ColHead w="w-8">GD</ColHead>
          <ColHead w="w-8" accent>Pts</ColHead>
        </div>
      </div>

      {/* ── Rows ── */}
      {data.teams.map((team, i) => {
        const highlighted =
          !team.isTbd && (
            team.shortCode.toUpperCase() === homeCode.toUpperCase() ||
            team.shortCode.toUpperCase() === awayCode.toUpperCase()
          )
        return (
          <StandingRow
            key={team.isTbd ? `tbd-${i}` : team.id}
            team={team}
            rank={i + 1}
            isLast={i === data.teams.length - 1}
            highlighted={highlighted}
          />
        )
      })}

      {/* ── Legend ── */}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-border/40 bg-surface-elevated/30">
        <LegendDot color="bg-primary" label="Advances to R32" />
        <LegendDot color="bg-amber-400" label="Possible best 3rd" />
      </div>

    </div>
  )
}

// ─── Standing row ─────────────────────────────────────────────

function StandingRow({
  team,
  rank,
  isLast,
  highlighted,
}: {
  team:        ApiTeamStanding
  rank:        number
  isLast:      boolean
  highlighted: boolean
}) {
  const qualifies  = !team.isTbd && rank <= 2
  const mayQualify = !team.isTbd && team.possiblyQualified
  const gd         = team.goalDiff

  return (
    <div className={cn(
      'flex items-center px-3 py-2.5 relative transition-colors',
      !isLast && 'border-b border-border/40',
      highlighted && 'bg-primary/[0.04]',
      team.isTbd && 'opacity-40',
    )}>

      {/* Qualification bar */}
      {qualifies  && <span className="absolute left-0 top-[6px] bottom-[6px] w-[3px] rounded-r-full bg-primary" />}
      {mayQualify && <span className="absolute left-0 top-[6px] bottom-[6px] w-[3px] rounded-r-full bg-amber-400" />}

      {/* Rank */}
      <span className={cn(
        'text-[11px] font-bold w-5 text-center flex-shrink-0',
        qualifies  ? 'text-primary'       :
        mayQualify ? 'text-amber-400'     :
                     'text-muted-foreground/50',
      )}>
        {rank}
      </span>

      {/* Flag + name */}
      <div className="flex items-center gap-2 flex-1 min-w-0 pl-2">
        {team.isTbd ? (
          <span className="w-5 h-3.5 rounded-sm bg-surface-elevated border border-border/60 flex-shrink-0" />
        ) : hqFlag(team.flagUrl) ? (
          <Image
            src={hqFlag(team.flagUrl)!}
            alt={team.shortCode}
            width={20}
            height={14}
            sizes="20px"
            className="rounded-sm object-cover flex-shrink-0"
            style={{ width: 20, height: 14 }}
          />
        ) : (
          <span className="w-5 h-3.5 rounded-sm bg-surface-elevated flex-shrink-0" />
        )}
        <span className={cn(
          'text-[12px] truncate leading-none',
          highlighted
            ? 'font-bold text-foreground'
            : team.isTbd
            ? 'text-muted-foreground italic'
            : qualifies || mayQualify
            ? 'font-semibold text-foreground'
            : 'font-medium text-muted-foreground/80',
        )}>
          {team.isTbd ? 'TBD' : team.shortCode}
        </span>
      </div>

      {/* Stats */}
      {team.isTbd ? (
        <div className="flex gap-0 text-[11px] text-muted-foreground/30 tabular-nums">
          {(['w-7','w-7','w-7','w-7','w-8','w-8'] as const).map((w, i) => (
            <span key={i} className={cn('text-center flex-shrink-0', w)}>—</span>
          ))}
        </div>
      ) : (
        <div className="flex gap-0 text-[11px] tabular-nums">
          <StatCell w="w-7" value={team.played}                          />
          <StatCell w="w-7" value={team.won}                             />
          <StatCell w="w-7" value={team.drawn}                           />
          <StatCell w="w-7" value={team.lost}                            />
          <StatCell w="w-8" value={gd >= 0 ? `+${gd}` : String(gd)}     />
          <StatCell w="w-8" value={team.points} bold accent={qualifies} amberAccent={mayQualify} highlighted={highlighted} />
        </div>
      )}
    </div>
  )
}

// ─── Primitives ───────────────────────────────────────────────

function ColHead({ w, accent, children }: { w: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <span className={cn(
      'text-[9px] font-black tracking-[0.1em] uppercase text-center flex-shrink-0',
      w,
      accent ? 'text-primary/60' : 'text-muted-foreground/50',
    )}>
      {children}
    </span>
  )
}

function StatCell({
  w,
  value,
  bold,
  accent,
  amberAccent,
  highlighted,
}: {
  w:           string
  value:       number | string
  bold?:       boolean
  accent?:     boolean
  amberAccent?: boolean
  highlighted?: boolean
}) {
  return (
    <span className={cn(
      'text-center flex-shrink-0',
      w,
      bold ? 'font-bold' : 'font-medium',
      accent      ? 'text-primary'           :
      amberAccent ? 'text-amber-400'         :
      highlighted ? 'text-foreground'        :
                    'text-muted-foreground/60',
    )}>
      {value}
    </span>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('size-[6px] rounded-full flex-shrink-0', color)} />
      <span className="text-[9px] text-muted-foreground/50">{label}</span>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden animate-pulse">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="h-3.5 w-28 rounded-full bg-surface-elevated" />
      </div>
      <div className="px-3 py-1.5 border-b border-border/40 bg-surface-elevated/60">
        <div className="h-2.5 w-40 rounded-full bg-surface-elevated" />
      </div>
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3 border-b border-border/40 last:border-0">
          <div className="w-5 h-2.5 rounded-full bg-surface-elevated" />
          <div className="w-5 h-3.5 rounded-sm bg-surface-elevated" />
          <div className="h-3 w-20 rounded-full bg-surface-elevated" />
          <div className="ml-auto h-2.5 w-32 rounded-full bg-surface-elevated" />
        </div>
      ))}
    </div>
  )
}
