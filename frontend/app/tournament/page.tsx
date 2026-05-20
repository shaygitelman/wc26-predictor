'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Check, Lock, Search, X, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ContextHeader } from '@/components/layout/context-header'
import { TeamFlag } from '@/components/atoms/team-flag'
import type { Team, TeamDetail, Player } from '@/types/match'
import { TOURNAMENT_BONUS } from '@/lib/constants'
import type { TournamentPick } from '@/types/tournament'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const POSITION_COLORS: Record<string, string> = {
  FWD: 'bg-orange-500/15 text-orange-500',
  MID: 'bg-blue-500/15 text-blue-500',
  DEF: 'bg-green-500/15 text-green-500',
  GK:  'bg-purple-500/15 text-purple-500',
}

export default function TournamentPage() {
  const [teams,          setTeams]          = useState<Team[]>([])
  const [favorites,      setFavorites]      = useState<Player[]>([])
  const [searchQuery,    setSearchQuery]    = useState('')
  const [searchResults,  setSearchResults]  = useState<Player[]>([])
  const [isSearching,    setIsSearching]    = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [winnerId,       setWinnerId]       = useState<string | undefined>()
  const [scorerId,       setScorerId]       = useState<string | undefined>()
  const [isLocked,       setIsLocked]       = useState(false)
  const [loading,        setLoading]        = useState(true)
  const [saveState,      setSaveState]      = useState<SaveState>('idle')
  const [saveError,      setSaveError]      = useState('')
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/teams').then(r => r.ok ? r.json() : []),
      fetch('/api/tournament/picks').then(r => r.ok ? r.json() : null),
      fetch('/api/players/favorites').then(r => r.ok ? r.json() : []),
    ]).then(([teamList, pick, favList]: [TeamDetail[], TournamentPick | null, Player[]]) => {
      const derived: Team[] = (Array.isArray(teamList) ? teamList : []).map(t => ({
        id:        t.id,
        name:      t.name,
        shortCode: t.shortCode,
        flagUrl:   t.flagUrl,
        group:     t.groupName ?? undefined,
      })).sort((a, b) => a.name.localeCompare(b.name))
      setTeams(derived)
      setFavorites(Array.isArray(favList) ? favList : [])

      if (pick) {
        setWinnerId(pick.winnerId ?? undefined)
        setScorerId(pick.topScorerId ?? undefined)
        setIsLocked(pick.isLocked)

        // Hydrate selected player from embedded scorer data in pick response
        if (pick.scorer) {
          setSelectedPlayer({
            id:            pick.scorer.id,
            name:          pick.scorer.name,
            photoUrl:      pick.scorer.photoUrl,
            teamName:      pick.scorer.teamName,
            teamShortCode: pick.scorer.teamShortCode,
            teamFlagUrl:   pick.scorer.teamFlagUrl,
          })
        }
      }
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSearchResults([])
      setIsSearching(false)
      return
    }
    setIsSearching(true)
    try {
      const res = await fetch(`/api/players?search=${encodeURIComponent(q.trim())}`)
      const data: Player[] = res.ok ? await res.json() : []
      setSearchResults(data.slice(0, 50))
    } catch {
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  function handleSearchChange(value: string) {
    setSearchQuery(value)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => runSearch(value), 300)
  }

  function selectScorer(player: Player) {
    if (isLocked) return
    if (scorerId === player.id) {
      setScorerId(undefined)
      setSelectedPlayer(null)
    } else {
      setScorerId(player.id)
      setSelectedPlayer(player)
    }
    setSearchQuery('')
    setSearchResults([])
  }

  const canSave = !isLocked && (winnerId !== undefined || scorerId !== undefined)

  async function handleSave() {
    if (!canSave || saveState !== 'idle') return
    setSaveState('saving'); setSaveError('')
    try {
      const payload = { winnerId: winnerId ?? null, topScorerId: scorerId ?? null }
      console.log('[tournament] saving picks:', payload)
      const res = await fetch('/api/tournament/picks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        console.error('[tournament] save failed %d:', res.status, data)
        throw new Error(data?.detail ?? data?.error ?? `Save failed (${res.status})`)
      }
      console.log('[tournament] save success:', data)
      setWinnerId(data.winnerId ?? undefined)
      setScorerId(data.topScorerId ?? undefined)
      setIsLocked(data.isLocked)
      if (data.scorer) {
        setSelectedPlayer({
          id:            data.scorer.id,
          name:          data.scorer.name,
          photoUrl:      data.scorer.photoUrl,
          teamName:      data.scorer.teamName,
          teamShortCode: data.scorer.teamShortCode,
          teamFlagUrl:   data.scorer.teamFlagUrl,
        })
      } else {
        setSelectedPlayer(null)
      }
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 1800)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong')
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 2500)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
        <ContextHeader title="Tournament Picks" back="/profile" />
        <div className="flex flex-1 items-center justify-center">
          <div className="size-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </div>
    )
  }

  const showingSearchResults = searchQuery.trim().length > 0

  return (
    <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
      <ContextHeader title="Tournament Picks" back="/profile" />

      <div className="flex flex-col gap-6 p-4">

        {isLocked && (
          <div className="flex items-center gap-3 bg-surface-elevated rounded-xl border border-border p-4">
            <Lock className="size-5 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-foreground">Picks are locked</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tournament predictions locked at kickoff.
              </p>
            </div>
          </div>
        )}

        {/* Points callout */}
        <div className="flex gap-3">
          <PointPill pts={TOURNAMENT_BONUS.WINNER}     label="Tournament Winner" />
          <PointPill pts={TOURNAMENT_BONUS.TOP_SCORER} label="Top Goal Scorer" />
        </div>

        {/* ── Pick tournament winner ───────────────────────── */}
        <section>
          <SectionLabel>Pick Tournament Winner</SectionLabel>
          {teams.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No teams available yet.</p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {teams.map(team => (
                <TeamTile
                  key={team.id}
                  team={team}
                  selected={winnerId === team.id}
                  disabled={isLocked}
                  onSelect={() => !isLocked && setWinnerId(id => id === team.id ? undefined : team.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Pick top scorer ──────────────────────────────── */}
        <section className="flex flex-col gap-4">
          <SectionLabel>Pick Top Goal Scorer</SectionLabel>

          {/* Selected player card */}
          {selectedPlayer && (
            <SelectedPlayerCard
              player={selectedPlayer}
              onClear={isLocked ? undefined : () => { setScorerId(undefined); setSelectedPlayer(null) }}
            />
          )}

          {!isLocked && (
            <>
              {/* Favorites strip */}
              {!showingSearchResults && favorites.length > 0 && (
                <div>
                  <p className="text-2xs font-bold tracking-[0.10em] uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Star className="size-3 fill-amber-400 text-amber-400" />
                    Recommended Picks
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 snap-x snap-mandatory scrollbar-none">
                    {favorites.map(player => (
                      <FavoriteCard
                        key={player.id}
                        player={player}
                        selected={scorerId === player.id}
                        onSelect={() => selectScorer(player)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <input
                  ref={searchRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => handleSearchChange(e.target.value)}
                  placeholder="Search all 1600+ players…"
                  className="w-full bg-surface-elevated border border-border rounded-xl pl-10 pr-10 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50"
                />
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(''); setSearchResults([]); searchRef.current?.focus() }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>

              {/* Search results */}
              {showingSearchResults && (
                <div className="flex flex-col gap-1">
                  {isSearching ? (
                    <div className="flex items-center justify-center py-6">
                      <div className="size-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-sm text-muted-foreground">No players found for &ldquo;{searchQuery}&rdquo;</p>
                    </div>
                  ) : (
                    searchResults.map(player => (
                      <PlayerRow
                        key={player.id}
                        player={player}
                        selected={scorerId === player.id}
                        onSelect={() => selectScorer(player)}
                      />
                    ))
                  )}
                </div>
              )}

              {/* Empty state when no selection and no search */}
              {!selectedPlayer && !showingSearchResults && favorites.length === 0 && (
                <div className="bg-card rounded-xl border border-border px-4 py-6 text-center">
                  <p className="text-sm text-muted-foreground">Player rosters not yet available.</p>
                  <p className="text-xs text-muted-foreground mt-1">Check back closer to the tournament.</p>
                </div>
              )}
            </>
          )}

          {/* Locked state — show selection only */}
          {isLocked && !selectedPlayer && (
            <div className="bg-card rounded-xl border border-border px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">No top scorer selected.</p>
            </div>
          )}
        </section>

        {/* ── Save button ─────────────────────────────────── */}
        {!isLocked && (
          <>
            <button
              onClick={handleSave}
              disabled={!canSave || saveState !== 'idle'}
              className={cn(
                'w-full rounded-xl py-4 font-bold text-[15px] transition-all duration-200',
                saveState === 'saved'
                  ? 'bg-status-won text-white'
                  : saveState === 'error'
                  ? 'bg-status-lost/80 text-white'
                  : canSave
                  ? 'bg-primary text-white active:scale-[0.98]'
                  : 'bg-surface-elevated text-muted-foreground cursor-not-allowed',
              )}
            >
              {saveState === 'saving' ? 'Saving…'
                : saveState === 'saved' ? '✓ Picks Saved!'
                : saveState === 'error' ? 'Save Failed — Tap to Retry'
                : 'Save My Picks'}
            </button>
            {saveError && (
              <p className="text-center text-xs text-status-lost -mt-3">{saveError}</p>
            )}
          </>
        )}

        <p className="text-center text-xs text-muted-foreground -mt-2">
          Picks lock when the first match kicks off · One submission only
        </p>
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-2xs font-bold tracking-[0.12em] uppercase text-muted-foreground mb-3">
      {children}
    </p>
  )
}

function PointPill({ pts, label }: { pts: number; label: string }) {
  return (
    <div className="flex-1 bg-primary-muted border border-primary/20 rounded-xl p-3 text-center">
      <p className="text-xl font-black text-primary tabular">+{pts}</p>
      <p className="text-2xs text-muted-foreground font-medium leading-tight mt-0.5">{label}</p>
    </div>
  )
}

function TeamTile({
  team,
  selected,
  disabled,
  onSelect,
}: {
  team: Team
  selected: boolean
  disabled: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-xl border py-3 px-1 transition-all duration-150',
        selected
          ? 'border-primary bg-primary-muted ring-1 ring-primary/40 scale-[1.02]'
          : 'border-border bg-card hover:border-primary/40',
        disabled && 'opacity-60 cursor-not-allowed',
      )}
    >
      <div className="relative">
        <TeamFlag team={team} size="md" />
        {selected && (
          <span className="absolute -top-1 -right-1 size-4 rounded-full bg-primary flex items-center justify-center">
            <Check className="size-2.5 text-white" strokeWidth={3} />
          </span>
        )}
      </div>
      <span className="text-2xs font-bold text-foreground">{team.shortCode}</span>
    </button>
  )
}

function PlayerPhoto({ src, name, size = 40 }: { src?: string; name: string; size?: number }) {
  const [err, setErr] = useState(false)
  if (!src || err) {
    const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    return (
      <span
        className="rounded-full bg-surface-elevated flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0"
        style={{ width: size, height: size }}
      >
        {initials}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      onError={() => setErr(true)}
      className="rounded-full object-cover flex-shrink-0"
      style={{ width: size, height: size }}
    />
  )
}

function FlagImg({ url, code }: { url?: string; code: string }) {
  if (!url) return (
    <span className="text-2xs font-bold text-muted-foreground bg-surface-elevated rounded px-1">{code}</span>
  )
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={code} className="w-5 h-3.5 rounded-[2px] object-cover flex-shrink-0" />
  )
}

function SelectedPlayerCard({ player, onClear }: { player: Player; onClear?: () => void }) {
  return (
    <div className="flex items-center gap-3 bg-primary-muted border border-primary/30 rounded-xl px-4 py-3 ring-1 ring-primary/20">
      <PlayerPhoto src={player.photoUrl} name={player.name} size={44} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground truncate">{player.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <FlagImg url={player.teamFlagUrl} code={player.teamShortCode ?? ''} />
          <p className="text-xs text-muted-foreground truncate">{player.teamName}</p>
          {player.position && (
            <span className={cn('text-2xs font-bold px-1.5 py-0.5 rounded', POSITION_COLORS[player.position] ?? 'bg-muted text-muted-foreground')}>
              {player.position}
            </span>
          )}
        </div>
      </div>
      <Check className="size-5 text-primary flex-shrink-0" strokeWidth={2.5} />
      {onClear && (
        <button onClick={onClear} className="ml-1 text-muted-foreground hover:text-foreground flex-shrink-0">
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}

function FavoriteCard({ player, selected, onSelect }: { player: Player; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all duration-150 snap-start flex-shrink-0 w-[80px]',
        selected
          ? 'border-primary bg-primary-muted ring-1 ring-primary/40'
          : 'border-border bg-card hover:border-primary/40',
      )}
    >
      <div className="relative">
        <PlayerPhoto src={player.photoUrl} name={player.name} size={44} />
        {selected && (
          <span className="absolute -top-1 -right-1 size-4 rounded-full bg-primary flex items-center justify-center">
            <Check className="size-2.5 text-white" strokeWidth={3} />
          </span>
        )}
      </div>
      <FlagImg url={player.teamFlagUrl} code={player.teamShortCode ?? ''} />
      <p className="text-2xs font-bold text-foreground text-center leading-tight line-clamp-2">
        {player.name.split(' ').slice(-1)[0]}
      </p>
    </button>
  )
}

function PlayerRow({ player, selected, onSelect }: { player: Player; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-150 text-left w-full',
        selected
          ? 'border-primary bg-primary-muted ring-1 ring-primary/40'
          : 'border-border bg-card hover:border-primary/40',
      )}
    >
      <PlayerPhoto src={player.photoUrl} name={player.name} size={36} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground truncate">{player.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <FlagImg url={player.teamFlagUrl} code={player.teamShortCode ?? ''} />
          <p className="text-xs text-muted-foreground truncate">{player.teamName}</p>
        </div>
      </div>
      {player.position && (
        <span className={cn('text-2xs font-bold px-1.5 py-0.5 rounded flex-shrink-0', POSITION_COLORS[player.position] ?? 'bg-muted text-muted-foreground')}>
          {player.position}
        </span>
      )}
      {selected && (
        <Check className="size-4 text-primary flex-shrink-0" strokeWidth={2.5} />
      )}
    </button>
  )
}
