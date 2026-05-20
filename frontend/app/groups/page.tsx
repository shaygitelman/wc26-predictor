'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { cn, formatKickoffTime } from '@/lib/utils'
import { ContextHeader } from '@/components/layout/context-header'
import type { ApiGroupStandings, ApiTeamStanding, ApiBracketEntry } from '@/types/standings'

const ROUNDS: { key: string; label: string }[] = [
  { key: 'r32',   label: 'Round of 32'    },
  { key: 'r16',   label: 'Round of 16'    },
  { key: 'qf',    label: 'Quarter Finals' },
  { key: 'sf',    label: 'Semi Finals'    },
  { key: '3rd',   label: '3rd Place'      },
  { key: 'final', label: 'Final'          },
]

type Tab = 'groups' | 'bracket'

export default function GroupsPage() {
  const [tab,            setTab]            = useState<Tab>('groups')
  const [standings,      setStandings]      = useState<ApiGroupStandings[]>([])
  const [bracket,        setBracket]        = useState<ApiBracketEntry[]>([])
  const [activeGroup,    setActiveGroup]    = useState<string>('')
  const [loadingGroups,  setLoadingGroups]  = useState(true)
  const [loadingBracket, setLoadingBracket] = useState(true)
  const [error,          setError]          = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/groups/standings')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: ApiGroupStandings[]) => {
        setStandings(data)
        if (data.length > 0) setActiveGroup(data[0].group)
      })
      .catch(() => setError('Failed to load group standings.'))
      .finally(() => setLoadingGroups(false))
  }, [])

  useEffect(() => {
    fetch('/api/groups/bracket')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: ApiBracketEntry[]) => setBracket(data))
      .catch(() => {})
      .finally(() => setLoadingBracket(false))
  }, [])

  const groupList  = standings.map(g => g.group)   // already in A–L order from backend
  const activeData = standings.find(g => g.group === activeGroup) ?? null

  return (
    <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
      <ContextHeader title="Tournament" />

      {/* ── Tab switcher ─────────────────────────────────────── */}
      <div className="flex border-b border-border bg-card">
        <TabPill label="Groups"  active={tab === 'groups'}  onClick={() => setTab('groups')}  />
        <TabPill label="Bracket" active={tab === 'bracket'} onClick={() => setTab('bracket')} />
      </div>

      {tab === 'groups' ? (
        <GroupsView
          loading={loadingGroups}
          error={error}
          groupList={groupList}
          activeGroup={activeGroup}
          activeData={activeData}
          onGroupChange={setActiveGroup}
        />
      ) : (
        <BracketView loading={loadingBracket} bracket={bracket} />
      )}
    </div>
  )
}

// ─── Groups view ─────────────────────────────────────────────

function GroupsView({
  loading,
  error,
  groupList,
  activeGroup,
  activeData,
  onGroupChange,
}: {
  loading:       boolean
  error:         string | null
  groupList:     string[]
  activeGroup:   string
  activeData:    ApiGroupStandings | null
  onGroupChange: (g: string) => void
}) {
  if (loading) {
    return (
      <div className="flex flex-col flex-1">
        {/* Shimmer group selector — 12 groups A–L */}
        <div className="flex gap-2 px-4 py-3 bg-card border-b border-border overflow-x-auto scrollbar-none">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-8 w-8 rounded-lg bg-surface-elevated animate-pulse flex-shrink-0" />
          ))}
        </div>
        <div className="p-4">
          <StandingsSkeleton />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-xs font-bold text-primary"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (groupList.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <p className="text-sm text-muted-foreground">No group data available yet.</p>
      </div>
    )
  }

  const tbdCount = activeData?.teams.filter(t => t.isTbd).length ?? 0

  return (
    <div className="flex flex-col flex-1">
      {/* Group selector */}
      <div className="flex gap-1.5 px-4 py-3 bg-card border-b border-border overflow-x-auto scrollbar-none">
        {groupList.map(g => (
          <button
            key={g}
            onClick={() => onGroupChange(g)}
            className={cn(
              'flex-shrink-0 rounded-lg w-9 h-9 text-sm font-bold transition-colors duration-150',
              activeGroup === g
                ? 'bg-primary text-white'
                : 'bg-surface-elevated text-muted-foreground hover:text-foreground',
            )}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Standings + fixtures */}
      {activeData && (
        <div className="p-4 flex flex-col gap-4">
          {/* Incomplete group notice */}
          {tbdCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-elevated border border-border">
              <span className="text-muted-foreground text-xs">
                {tbdCount === activeData.teams.length
                  ? 'Teams for this group have not been announced yet.'
                  : `${activeData.teams.length - tbdCount} of ${activeData.teams.length} teams confirmed · remaining TBD`}
              </span>
            </div>
          )}

          <StandingsTable group={activeData.group} teams={activeData.teams} />

          {/* Legend */}
          <div className="flex items-center gap-4 px-1 flex-wrap">
            <LegendDot color="bg-primary"   label="Advances to Round of 32" />
            <LegendDot color="bg-amber-400" label="3rd Place · may qualify (best 8)" />
          </div>

          {/* Group fixtures */}
          {activeData.matches.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-2xs font-bold tracking-[0.12em] uppercase text-muted-foreground">Fixtures</p>
              {activeData.matches.map(m => (
                <GroupFixtureRow key={m.id} match={m} />
              ))}
            </div>
          )}

          {activeData.matches.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Fixture schedule not yet published.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function StandingsTable({ group, teams }: { group: string; teams: ApiTeamStanding[] }) {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center px-3 py-2 border-b border-border bg-surface-elevated">
        <span className="text-2xs font-bold text-muted-foreground uppercase tracking-widest w-6 text-center flex-shrink-0">
          #
        </span>
        <span className="text-2xs font-bold text-muted-foreground uppercase tracking-widest flex-1 pl-2">
          Group {group}
        </span>
        <div className="flex gap-0 text-2xs font-bold text-muted-foreground uppercase tracking-widest">
          <ColHead w="w-7">P</ColHead>
          <ColHead w="w-7">W</ColHead>
          <ColHead w="w-7">D</ColHead>
          <ColHead w="w-7">L</ColHead>
          <ColHead w="w-8">GD</ColHead>
          <ColHead w="w-8" accent>Pts</ColHead>
        </div>
      </div>

      {teams.map((team, i) => (
        <StandingsRow
          key={team.isTbd ? `tbd-${i}` : team.id}
          team={team}
          rank={i + 1}
          isLast={i === teams.length - 1}
        />
      ))}
    </div>
  )
}

function StandingsRow({
  team,
  rank,
  isLast,
}: {
  team:   ApiTeamStanding
  rank:   number
  isLast: boolean
}) {
  // TBD slots never count as qualified; only top 2 real teams auto-advance, rank 3 may qualify
  const qualified         = !team.isTbd && rank <= 2
  const possiblyQualified = !team.isTbd && team.possiblyQualified
  const gd                = team.goalDiff

  return (
    <div className={cn(
      'flex items-center px-3 py-2.5 relative',
      !isLast && 'border-b border-border',
      team.isTbd && 'opacity-50',
    )}>
      {qualified && (
        <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-primary" />
      )}
      {possiblyQualified && (
        <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-amber-400" />
      )}

      <span className={cn(
        'text-xs font-bold w-6 text-center flex-shrink-0',
        qualified         ? 'text-primary'          :
        possiblyQualified ? 'text-amber-400'         :
                            'text-muted-foreground',
      )}>
        {rank}
      </span>

      <div className="flex items-center gap-2 flex-1 min-w-0 pl-2">
        {team.isTbd ? (
          /* TBD flag placeholder */
          <span className="w-5 h-3.5 rounded-sm bg-surface-elevated border border-border/60 flex-shrink-0" />
        ) : team.flagUrl ? (
          <Image
            src={team.flagUrl}
            alt={team.shortCode}
            width={20}
            height={14}
            className="rounded-sm object-cover flex-shrink-0"
          />
        ) : (
          <span className="w-5 h-3.5 rounded-sm bg-surface-elevated flex-shrink-0" />
        )}
        <span className={cn(
          'text-sm truncate',
          team.isTbd
            ? 'text-muted-foreground italic font-medium'
            : qualified || possiblyQualified ? 'font-semibold text-foreground' : 'font-semibold text-muted-foreground',
        )}>
          {team.isTbd ? 'TBD' : team.name}
        </span>
      </div>

      {team.isTbd ? (
        /* Show dashes for all stats */
        <div className="flex gap-0 text-xs text-muted-foreground tabular">
          {['w-7','w-7','w-7','w-7','w-8','w-8'].map((w, i) => (
            <span key={i} className={cn('text-center flex-shrink-0', w)}>—</span>
          ))}
        </div>
      ) : (
        <div className="flex gap-0 text-xs tabular">
          <StatCell w="w-7" value={team.played}                              dim />
          <StatCell w="w-7" value={team.won}                                 dim />
          <StatCell w="w-7" value={team.drawn}                               dim />
          <StatCell w="w-7" value={team.lost}                                dim />
          <StatCell w="w-8" value={gd >= 0 ? `+${gd}` : gd}                 dim />
          <StatCell w="w-8" value={team.points} bold accent={qualified} amberAccent={possiblyQualified} />
        </div>
      )}
    </div>
  )
}

function GroupFixtureRow({ match }: { match: import('@/types/standings').ApiGroupFixture }) {
  const isFinished  = match.status === 'finished'
  const isLive      = match.status === 'live'
  const eitherTbd   = match.homeCode === 'TBD' || match.awayCode === 'TBD'

  return (
    <div className={cn(
      'bg-card rounded-xl border px-3 py-2.5 flex items-center gap-3',
      isLive    ? 'border-status-live/40' : 'border-border',
      eitherTbd && 'opacity-70',
    )}>
      {/* Home */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {match.homeFlag ? (
          <Image src={match.homeFlag} alt={match.homeCode} width={18} height={12}
            className="rounded-sm object-cover flex-shrink-0" />
        ) : (
          <span className="w-[18px] h-3 rounded-sm bg-surface-elevated border border-border/40 flex-shrink-0" />
        )}
        <span className={cn(
          'text-xs font-semibold truncate',
          match.homeCode === 'TBD' && 'italic text-muted-foreground',
        )}>
          {match.homeCode === 'TBD' ? 'TBD' : match.homeName}
        </span>
      </div>

      {/* Score / time */}
      <div className="flex-shrink-0 text-center min-w-[52px]">
        {isFinished || isLive ? (
          <span className={cn('text-sm font-black tabular', isLive && 'text-status-live')}>
            {match.homeScore ?? 0} – {match.awayScore ?? 0}
          </span>
        ) : (
          <span className="text-xs font-semibold text-muted-foreground tabular">
            {formatKickoffTime(match.scheduledAt)}
          </span>
        )}
      </div>

      {/* Away */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
        <span className={cn(
          'text-xs font-semibold truncate text-right',
          match.awayCode === 'TBD' && 'italic text-muted-foreground',
        )}>
          {match.awayCode === 'TBD' ? 'TBD' : match.awayName}
        </span>
        {match.awayFlag ? (
          <Image src={match.awayFlag} alt={match.awayCode} width={18} height={12}
            className="rounded-sm object-cover flex-shrink-0" />
        ) : (
          <span className="w-[18px] h-3 rounded-sm bg-surface-elevated border border-border/40 flex-shrink-0" />
        )}
      </div>
    </div>
  )
}

function StandingsSkeleton() {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="h-9 bg-surface-elevated border-b border-border animate-pulse" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className={cn('flex items-center gap-3 px-3 py-2.5', i < 3 && 'border-b border-border')}>
          <div className="w-6 h-4 rounded bg-surface-elevated animate-pulse" />
          <div className="flex items-center gap-2 flex-1">
            <div className="w-5 h-3.5 rounded-sm bg-surface-elevated animate-pulse" />
            <div className="h-4 w-28 rounded bg-surface-elevated animate-pulse" />
          </div>
          <div className="flex gap-1">
            {Array.from({ length: 6 }).map((_, j) => (
              <div key={j} className="w-7 h-4 rounded bg-surface-elevated animate-pulse" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Bracket view ─────────────────────────────────────────────

function BracketView({ loading, bracket }: { loading: boolean; bracket: ApiBracketEntry[] }) {
  if (loading) {
    return (
      <div className="flex flex-col gap-5 p-4">
        {ROUNDS.slice(0, 3).map(r => (
          <section key={r.key}>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-3 w-28 rounded bg-surface-elevated animate-pulse" />
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="flex flex-col gap-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-24 bg-card rounded-xl border border-border animate-pulse" />
              ))}
            </div>
          </section>
        ))}
      </div>
    )
  }

  const byRound = ROUNDS.reduce<Record<string, ApiBracketEntry[]>>((acc, r) => {
    acc[r.key] = bracket.filter(m => m.round === r.key)
    return acc
  }, {})

  const hasAny = ROUNDS.some(r => byRound[r.key].length > 0)

  if (!hasAny) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <p className="text-sm text-muted-foreground">Knockout stage fixtures not yet available.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      {ROUNDS.map(({ key, label }) => {
        const matches = byRound[key]
        if (matches.length === 0) return null
        return (
          <section key={key}>
            <RoundLabel label={label} count={matches.length} />
            <div className="flex flex-col gap-2">
              {matches.map(match => (
                <BracketMatchCard key={match.id} match={match} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function RoundLabel({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <p className="text-2xs font-bold tracking-[0.12em] uppercase text-muted-foreground whitespace-nowrap">
        {label}
      </p>
      <div className="flex-1 h-px bg-border" />
      <span className="text-2xs text-muted-foreground flex-shrink-0">{count} matches</span>
    </div>
  )
}

function BracketMatchCard({ match }: { match: ApiBracketEntry }) {
  const isFinished = match.status === 'finished'
  const isLive     = match.status === 'live'

  return (
    <div className={cn(
      'bg-card rounded-xl border overflow-hidden',
      isLive ? 'border-status-live/40' : 'border-border',
    )}>
      {(match.scheduledAt || isLive || isFinished) && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface-elevated">
          <span className="text-2xs font-semibold text-muted-foreground">
            {match.scheduledAt ? formatKickoffTime(match.scheduledAt) : '—'}
          </span>
          {isLive && (
            <span className="flex items-center gap-1 text-2xs font-bold text-status-live">
              <span className="size-1.5 rounded-full bg-status-live animate-live-pulse" />
              LIVE
            </span>
          )}
          {isFinished && (
            <span className="text-2xs font-bold text-muted-foreground tracking-widest">FT</span>
          )}
        </div>
      )}

      <BracketTeamRow slot={match.homeSlot} isFinished={isFinished} />
      <div className="h-px bg-border mx-3" />
      <BracketTeamRow slot={match.awaySlot} isFinished={isFinished} />
    </div>
  )
}

function BracketTeamRow({
  slot,
  isFinished,
}: {
  slot:       import('@/types/standings').ApiBracketSlot
  isFinished: boolean
}) {
  const hasTeam = !!slot.name && !!slot.code

  return (
    <div className={cn(
      'flex items-center gap-3 px-3 py-2.5',
      isFinished && slot.isWinner && 'bg-primary-muted',
      !hasTeam && 'opacity-60',
    )}>
      {slot.flagUrl ? (
        <Image
          src={slot.flagUrl}
          alt={slot.code ?? ''}
          width={22}
          height={15}
          className="rounded-sm object-cover flex-shrink-0"
        />
      ) : (
        <span className="w-[22px] h-[15px] rounded-sm bg-surface-elevated border border-border/40 flex-shrink-0" />
      )}

      <span className={cn(
        'flex-1 text-sm',
        hasTeam
          ? isFinished && slot.isWinner ? 'font-bold text-foreground' : 'font-semibold text-foreground'
          : 'font-medium text-muted-foreground italic',
      )}>
        {hasTeam ? slot.name : 'TBD'}
      </span>

      {isFinished && slot.score !== null ? (
        <span className={cn(
          'text-base font-black tabular w-6 text-center',
          slot.isWinner ? 'text-foreground' : 'text-muted-foreground',
        )}>
          {slot.score}
        </span>
      ) : (
        <span className="text-2xs font-bold text-muted-foreground/60 bg-surface-elevated rounded px-1.5 py-0.5">
          –
        </span>
      )}
    </div>
  )
}

// ─── Shared atoms ─────────────────────────────────────────────

function ColHead({ children, w, accent }: { children: React.ReactNode; w: string; accent?: boolean }) {
  return (
    <span className={cn('text-center flex-shrink-0', w, accent && 'text-primary')}>
      {children}
    </span>
  )
}

function StatCell({
  w, value, dim, bold, accent, amberAccent,
}: {
  w:           string
  value:       string | number
  dim?:        boolean
  bold?:       boolean
  accent?:     boolean
  amberAccent?: boolean
}) {
  return (
    <span className={cn(
      'text-center flex-shrink-0',
      w,
      bold ? 'font-bold' : 'font-medium',
      accent      ? 'text-primary'          :
      amberAccent ? 'text-amber-400'        :
      dim         ? 'text-muted-foreground' : 'text-foreground',
    )}>
      {value}
    </span>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('size-2 rounded-full flex-shrink-0', color)} />
      <span className="text-2xs text-muted-foreground">{label}</span>
    </div>
  )
}

function TabPill({
  label,
  active,
  onClick,
}: {
  label:   string
  active:  boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 py-3 text-sm font-bold transition-colors duration-150 relative',
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
      {active && (
        <span className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full bg-primary" />
      )}
    </button>
  )
}
