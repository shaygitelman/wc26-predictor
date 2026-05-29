'use client'

import { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, Check, ChevronRight, Loader2 } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { cn } from '@/lib/utils'
import {
  trackOnboardingStarted,
  trackOnboardingStep,
  trackOnboardingCompleted,
} from '@/lib/analytics'
import { InstallPrompt, type BeforeInstallPromptEvent } from '@/components/install-prompt'
import { apiFetch } from '@/lib/api-client'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Team {
  code:    string
  name:    string
  flagUrl: string | null
  group:   string
}

interface Player {
  id:            string
  teamId:        string | null
  teamName:      string | null
  teamFlagUrl:   string | null
  name:          string
  position:      string | null
  photoUrl:      string | null
}

// ─── Confetti ─────────────────────────────────────────────────────────────────

const CONFETTI_COLORS = ['#8875FF', '#FFD700', '#FF6B6B', '#4ECDC4', '#A8E6CF', '#FFB347']

function Confetti() {
  const pieces = useMemo(() =>
    Array.from({ length: 55 }, (_, i) => ({
      id:       i,
      left:     (i * 1.8182 + 7) % 100,
      delay:    (i * 0.0327) % 1.8,
      duration: 2.5 + (i * 0.0364) % 2,
      color:    CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size:     6 + (i % 8),
      sway:     0.8 + (i * 0.02) % 1.2,
    })), [])

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-10">
      {pieces.map(p => (
        <div
          key={p.id}
          className="absolute rounded-sm"
          style={{
            left:            `${p.left}%`,
            top:             '-16px',
            width:           p.size,
            height:          p.size,
            backgroundColor: p.color,
            animation:       `confettiFall ${p.duration}s ${p.delay}s ease-in forwards,
                              confettiSway ${p.sway}s ${p.delay}s ease-in-out infinite alternate`,
          }}
        />
      ))}
    </div>
  )
}

// ─── Progress dots ────────────────────────────────────────────────────────────

function ProgressDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={cn(
            'rounded-full transition-all duration-300',
            i < step
              ? 'w-2 h-2 bg-primary'
              : i === step
                ? 'w-5 h-2 bg-primary'
                : 'w-2 h-2 bg-primary/20',
          )}
        />
      ))}
    </div>
  )
}

// ─── Step 0: Welcome ──────────────────────────────────────────────────────────

function WelcomeStep({ onNext, isLocked }: { onNext: () => void; isLocked?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-8 text-center gap-8">
      {/* Brand icon */}
      <div className="relative flex items-center justify-center animate-in zoom-in-50 duration-700">
        <div
          className="absolute pointer-events-none"
          style={{
            width: 190, height: 190,
            background: 'radial-gradient(ellipse at center, rgba(240,168,12,0.2) 0%, transparent 65%)',
          }}
          aria-hidden="true"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/apple-icon.png"
          alt="MatchPoint26"
          width={96}
          height={96}
          className="relative rounded-[22%]"
          style={{ filter: 'drop-shadow(0 4px 24px rgba(240,168,12,0.38))' }}
        />
      </div>

      <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
        <p className="text-xs font-black tracking-[0.3em] uppercase text-primary/70">
          FIFA World Cup 2026
        </p>
        <h1 className="text-4xl font-black text-foreground leading-tight">
          Your tournament<br />starts here
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
          Before you start predicting matches, tell us who you think will go all the way.
        </p>
      </div>

      <div className="w-full max-w-xs animate-in fade-in duration-700 delay-500">
        <button
          onClick={onNext}
          className="w-full h-14 rounded-2xl bg-primary text-primary-foreground text-[15px] font-black
            flex items-center justify-center gap-2
            shadow-lg shadow-primary/30 hover:opacity-90 active:scale-[0.98] transition-all"
        >
          Make My Predictions
          <ChevronRight className="size-5" strokeWidth={2.5} />
        </button>
        <p className="text-2xs text-muted-foreground/50 mt-3">2 quick picks · takes under a minute</p>
        <p className="text-2xs text-muted-foreground/40 mt-1">
          {isLocked ? 'The tournament has started — your picks lock on submission.' : 'You can change your picks anytime before the tournament starts.'}
        </p>
      </div>
    </div>
  )
}

// ─── Step 1: Tournament Winner ────────────────────────────────────────────────

function WinnerStep({
  teams,
  selected,
  onSelect,
  onNext,
  isLocked,
}: {
  teams:    Team[]
  selected: Team | null
  onSelect: (t: Team) => void
  onNext:   () => void
  isLocked?: boolean
}) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return q ? teams.filter(t => t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q)) : teams
  }, [teams, search])

  // Group by group letter when not searching
  const grouped = useMemo(() => {
    if (search.trim()) return null
    const map: Record<string, Team[]> = {}
    for (const t of filtered) {
      if (!map[t.group]) map[t.group] = []
      map[t.group].push(t)
    }
    return map
  }, [filtered, search])

  return (
    <div className="flex flex-col min-h-dvh">
      {/* Fixed header */}
      <div className="px-5 pt-12 pb-4 bg-background/95 backdrop-blur-sm sticky top-0 z-10">
        <ProgressDots step={1} total={2} />
        <h1 className="text-2xl font-black text-foreground mt-3 leading-tight">
          Who wins the<br />2026 World Cup?
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Pick the team you think goes all the way</p>

        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search team…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-4 rounded-xl bg-surface-elevated border border-border
              text-sm text-foreground placeholder:text-muted-foreground/60
              focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
          />
        </div>
      </div>

      {/* Scrollable team grid */}
      <div className="flex-1 overflow-y-auto px-5 pb-32">
        {grouped ? (
          Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([group, groupTeams]) => (
            <div key={group} className="mb-5">
              <p className="text-2xs font-black tracking-[0.15em] uppercase text-muted-foreground/60 mb-2">
                Group {group}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {groupTeams.map(team => (
                  <TeamCard key={team.code} team={team} isSelected={selected?.code === team.code} onSelect={onSelect} />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="grid grid-cols-2 gap-2 pt-2">
            {filtered.map(team => (
              <TeamCard key={team.code} team={team} isSelected={selected?.code === team.code} onSelect={onSelect} />
            ))}
          </div>
        )}
        {filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">No teams found</p>
        )}
      </div>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-background via-background/95 to-transparent pt-8">
        <button
          onClick={onNext}
          disabled={!selected}
          className="w-full h-13 rounded-2xl bg-primary text-primary-foreground text-sm font-black
            flex items-center justify-center gap-2 shadow-lg shadow-primary/30
            disabled:opacity-30 disabled:cursor-not-allowed
            hover:opacity-90 active:scale-[0.98] transition-all"
        >
          {selected ? (
            <>
              <img src={selected.flagUrl ?? ''} alt="" className="size-5 rounded-sm object-cover" />
              {selected.name} — Next
              <ChevronRight className="size-4" strokeWidth={2.5} />
            </>
          ) : 'Pick a team to continue'}
        </button>
        <p className="text-center text-2xs text-muted-foreground/45 mt-2.5">
          {isLocked ? 'The tournament has started — your picks will be locked after submission.' : 'You can edit this pick before the tournament lock date.'}
        </p>
      </div>
    </div>
  )
}

function TeamCard({ team, isSelected, onSelect }: { team: Team; isSelected: boolean; onSelect: (t: Team) => void }) {
  return (
    <button
      onClick={() => onSelect(team)}
      className={cn(
        'relative flex flex-col items-center gap-2 p-3 rounded-2xl border-2 text-center transition-all duration-150 active:scale-[0.97]',
        isSelected
          ? 'border-primary bg-primary/10 shadow-lg shadow-primary/20'
          : 'border-border bg-card hover:border-primary/30 hover:bg-surface-elevated',
      )}
    >
      {isSelected && (
        <span className="absolute top-2 right-2 size-5 rounded-full bg-primary flex items-center justify-center">
          <Check className="size-3 text-primary-foreground" strokeWidth={3} />
        </span>
      )}
      {team.flagUrl ? (
        <img
          src={team.flagUrl}
          alt={team.name}
          className="w-12 h-8 object-cover rounded-md shadow-sm"
        />
      ) : (
        <div className="w-12 h-8 rounded-md bg-surface-elevated flex items-center justify-center text-xs font-bold text-muted-foreground">
          {team.code}
        </div>
      )}
      <p className={cn(
        'text-xs font-bold leading-tight',
        isSelected ? 'text-primary' : 'text-foreground',
      )}>
        {team.name}
      </p>
    </button>
  )
}

// ─── Step 2: Golden Boot ──────────────────────────────────────────────────────

function ScorerStep({
  selected,
  onSelect,
  onSubmit,
  submitting,
  isLocked,
}: {
  selected:   Player | null
  onSelect:   (p: Player) => void
  onSubmit:   () => void
  submitting: boolean
  isLocked?:  boolean
}) {
  const [search,    setSearch]    = useState('')
  const [players,   setPlayers]   = useState<Player[]>([])
  const [loading,   setLoading]   = useState(true)
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef     = useRef<AbortController | null>(null)

  // Load favorites on mount
  useEffect(() => {
    const ac = new AbortController()
    fetch('/api/players/favorites', { signal: ac.signal })
      .then(r => r.ok ? r.json() : [])
      .then(setPlayers)
      .catch(e => { if (e.name !== 'AbortError') setPlayers([]) })
      .finally(() => setLoading(false))
    return () => ac.abort()
  }, [])

  // Debounced search with abort-on-stale
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()

    if (!search.trim()) {
      setLoading(true)
      const ac = new AbortController()
      abortRef.current = ac
      fetch('/api/players/favorites', { signal: ac.signal })
        .then(r => r.ok ? r.json() : [])
        .then(setPlayers)
        .catch(e => { if (e.name !== 'AbortError') setPlayers([]) })
        .finally(() => setLoading(false))
      return () => ac.abort()
    }

    const ac = new AbortController()
    abortRef.current = ac
    debounceRef.current = setTimeout(() => {
      setLoading(true)
      fetch(`/api/players?search=${encodeURIComponent(search)}`, { signal: ac.signal })
        .then(r => r.ok ? r.json() : [])
        .then(setPlayers)
        .catch(e => { if (e.name !== 'AbortError') setPlayers([]) })
        .finally(() => setLoading(false))
    }, 300)
    return () => { clearTimeout(debounceRef.current!); ac.abort() }
  }, [search])

  return (
    <div className="flex flex-col min-h-dvh">
      {/* Fixed header */}
      <div className="px-5 pt-12 pb-4 bg-background/95 backdrop-blur-sm sticky top-0 z-10">
        <ProgressDots step={2} total={2} />
        <h1 className="text-2xl font-black text-foreground mt-3 leading-tight">
          Who wins the<br />Golden Boot?
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {search.trim() ? 'Search results' : 'Top contenders — or search any player'}
        </p>

        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search player…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-4 rounded-xl bg-surface-elevated border border-border
              text-sm text-foreground placeholder:text-muted-foreground/60
              focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
          />
        </div>
      </div>

      {/* Player list */}
      <div className="flex-1 overflow-y-auto px-5 pb-32">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-5 text-muted-foreground animate-spin" />
          </div>
        ) : players.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">No players found</p>
        ) : (
          <div className="flex flex-col gap-1 pt-1">
            {players.map(player => (
              <PlayerRow
                key={player.id}
                player={player}
                isSelected={selected?.id === player.id}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-background via-background/95 to-transparent pt-8">
        <button
          onClick={onSubmit}
          disabled={!selected || submitting}
          className="w-full h-13 rounded-2xl bg-primary text-primary-foreground text-sm font-black
            flex items-center justify-center gap-2 shadow-lg shadow-primary/30
            disabled:opacity-30 disabled:cursor-not-allowed
            hover:opacity-90 active:scale-[0.98] transition-all"
        >
          {submitting ? (
            <><Loader2 className="size-4 animate-spin" /> Saving picks…</>
          ) : selected ? (
            <>{selected.name} — Save My Picks</>
          ) : 'Pick a player to continue'}
        </button>
        <p className="text-center text-2xs text-muted-foreground/45 mt-2.5">
          {isLocked ? 'The tournament has started — your picks will be locked after submission.' : 'You can edit this pick before the tournament lock date.'}
        </p>
      </div>
    </div>
  )
}

function PlayerRow({ player, isSelected, onSelect }: { player: Player; isSelected: boolean; onSelect: (p: Player) => void }) {
  const positionColor: Record<string, string> = {
    GK:  'text-yellow-400',
    DEF: 'text-blue-400',
    MID: 'text-green-400',
    FWD: 'text-red-400',
  }

  return (
    <button
      onClick={() => onSelect(player)}
      className={cn(
        'flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-150 active:scale-[0.98] text-left w-full',
        isSelected
          ? 'bg-primary/10 border border-primary/30'
          : 'hover:bg-surface-elevated border border-transparent',
      )}
    >
      {/* Player photo */}
      <div className="size-11 rounded-xl overflow-hidden bg-surface-elevated flex-shrink-0">
        {player.photoUrl ? (
          <img src={player.photoUrl} alt={player.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-lg">👤</div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-bold truncate', isSelected ? 'text-primary' : 'text-foreground')}>
          {player.name}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {player.teamFlagUrl && (
            <img src={player.teamFlagUrl} alt="" className="h-3 w-5 object-cover rounded-[2px]" />
          )}
          <span className="text-xs text-muted-foreground truncate">{player.teamName ?? '—'}</span>
          {player.position && (
            <span className={cn('text-2xs font-bold ml-0.5', positionColor[player.position] ?? 'text-muted-foreground')}>
              {player.position}
            </span>
          )}
        </div>
      </div>

      {/* Selected indicator */}
      {isSelected && (
        <span className="size-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
          <Check className="size-3.5 text-primary-foreground" strokeWidth={3} />
        </span>
      )}
    </button>
  )
}

// ─── Step 3: Celebration ──────────────────────────────────────────────────────

function CelebrationStep({
  winner:        winnerTeam,
  scorer:        scorerPlayer,
  onEnter,
  joining,
}: {
  winner:   Team
  scorer:   Player
  onEnter:  () => void
  joining?: boolean
}) {
  return (
    <div className="relative flex flex-col items-center justify-center min-h-dvh px-8 text-center gap-6">
      <Confetti />

      <div className="relative z-20 flex flex-col items-center gap-6 animate-in fade-in zoom-in-95 duration-500">
        <div className="text-5xl animate-in zoom-in duration-700 delay-300">🎉</div>

        <div>
          <p className="text-xs font-black tracking-[0.25em] uppercase text-primary/70 mb-2">
            Your picks are saved
          </p>
          <h1 className="text-3xl font-black text-foreground leading-tight">
            Let the tournament<br />begin!
          </h1>
          <p className="text-xs text-muted-foreground/60 mt-2">
            You can update your picks anytime before the tournament starts.
          </p>
        </div>

        {/* Picks summary card */}
        <div className="w-full max-w-xs bg-card border border-border rounded-2xl overflow-hidden shadow-xl">
          <div className="h-0.5 w-full bg-gradient-to-r from-primary/40 via-primary to-primary/40" />
          <div className="p-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-black text-primary">
                🏆
              </div>
              <div className="text-left">
                <p className="text-2xs text-muted-foreground font-medium">Tournament Winner</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {winnerTeam.flagUrl && (
                    <img src={winnerTeam.flagUrl} alt="" className="h-4 w-6 object-cover rounded-[3px]" />
                  )}
                  <p className="text-sm font-bold text-foreground">{winnerTeam.name}</p>
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="flex items-center gap-3">
              <div className="size-8 rounded-lg overflow-hidden bg-surface-elevated flex-shrink-0">
                {scorerPlayer.photoUrl
                  ? <img src={scorerPlayer.photoUrl} alt="" className="w-full h-full object-cover" />
                  : <span className="text-lg flex items-center justify-center h-full">👟</span>
                }
              </div>
              <div className="text-left">
                <p className="text-2xs text-muted-foreground font-medium">Golden Boot</p>
                <p className="text-sm font-bold text-foreground">{scorerPlayer.name}</p>
                <p className="text-xs text-muted-foreground">{scorerPlayer.teamName}</p>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={onEnter}
          disabled={joining}
          className="w-full max-w-xs h-14 rounded-2xl bg-primary text-primary-foreground text-[15px] font-black
            flex items-center justify-center gap-2
            shadow-lg shadow-primary/30 hover:opacity-90 active:scale-[0.98] transition-all
            disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {joining ? (
            <><Loader2 className="size-5 animate-spin" /> Joining league…</>
          ) : (
            <>Enter MatchPoint26 <ChevronRight className="size-5" strokeWidth={2.5} /></>
          )}
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

/** Only allow same-origin relative paths to prevent open-redirect. */
function safeNext(raw: string | null): string {
  if (!raw) return '/'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/'
  return raw
}

function OnboardingPageInner() {
  const { user, isLoading } = useAuth()
  const router       = useRouter()
  const searchParams = useSearchParams()
  const next         = safeNext(searchParams.get('next'))

  const [step,                 setStep]                 = useState(0)
  const [teams,                setTeams]                = useState<Team[]>([])
  const [winner,               setWinner]               = useState<Team | null>(null)
  const [scorer,               setScorer]               = useState<Player | null>(null)
  const [submitting,           setSubmitting]           = useState(false)
  const [joining,              setJoining]              = useState(false)
  const [error,                setError]                = useState<string | null>(null)
  const [isLocked,             setIsLocked]             = useState(false)
  const [showInstallPrompt,    setShowInstallPrompt]    = useState(false)
  const [installDest,          setInstallDest]          = useState('/')
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => { trackOnboardingStarted() }, [])

  // Capture the browser's native PWA install prompt for Android Chrome.
  // Must be registered early — the event fires once on page load.
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredInstallPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const goToStep = useCallback((s: number) => {
    setStep(s)
    const names: Record<number, 'welcome' | 'winner' | 'scorer' | 'celebration'> = {
      0: 'welcome', 1: 'winner', 2: 'scorer', 3: 'celebration',
    }
    if (names[s]) trackOnboardingStep(names[s])
  }, [])

  // If already onboarded, go to the intended destination (not always '/')
  useEffect(() => {
    if (!isLoading && user?.onboardingCompleted) {
      router.replace(next)
    }
  }, [user, isLoading, router, next])

  // Fetch teams + lock status in parallel
  useEffect(() => {
    fetch('/api/tournament/teams')
      .then(r => r.ok ? r.json() : [])
      .then(setTeams)
      .catch(() => setTeams([]))
    fetch('/api/tournament/lock-status')
      .then(r => r.ok ? r.json() : null)
      .then((d: { isLocked?: boolean } | null) => { if (d?.isLocked) setIsLocked(true) })
      .catch(() => {})
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!winner || !scorer) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await apiFetch('/api/tournament/onboarding', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ winner_team_code: winner.code, top_scorer_id: scorer.id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.detail ?? 'Something went wrong. Please try again.')
        return
      }
      trackOnboardingCompleted({ pickedWinner: !!winner, pickedScorer: !!scorer, hadInvite: /^\/join\//.test(next) })
      goToStep(3)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }, [winner, scorer])

  // Show the install prompt once for mobile first-timers, then navigate.
  // Hard navigation ensures the new page mounts with a fresh RootLayout SSR
  // read of the updated session cookie (onboarding_completed: true).
  const navigateOrPrompt = useCallback((dest: string) => {
    const shouldPrompt = (() => {
      try {
        return (
          localStorage.getItem('mp26_install_shown') !== '1' &&
          !window.matchMedia('(display-mode: standalone)').matches &&
          /iPhone|iPad|iPod|Android/.test(navigator.userAgent)
        )
      } catch { return false }
    })()
    if (shouldPrompt) {
      setInstallDest(dest)
      setShowInstallPrompt(true)
    } else {
      window.location.href = dest
    }
  }, [])

  const handleEnter = useCallback(async () => {
    const inviteMatch = /^\/join\/([A-Za-z0-9]+)$/.exec(next)
    if (inviteMatch) {
      setJoining(true)
      try {
        const res = await apiFetch('/api/leagues/join', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ inviteCode: inviteMatch[1] }),
        })
        if (res.ok) {
          const data = await res.json()
          setJoining(false)
          navigateOrPrompt(`/leagues/${data.id}`)
          return
        }
      } catch {}
      // Auto-join failed — fall through to the join page for its error UI.
      setJoining(false)
    }
    navigateOrPrompt(next)
  }, [next, navigateOrPrompt])

  if (isLoading || !user) return null

  return (
    <div className="min-h-dvh bg-background">
      {error && (
        <div className="fixed top-4 left-4 right-4 z-50 bg-destructive text-destructive-foreground
          text-sm font-semibold px-4 py-3 rounded-xl shadow-lg animate-in slide-in-from-top-2 duration-200">
          {error}
        </div>
      )}

      {showInstallPrompt && (
        <InstallPrompt
          deferredPrompt={deferredInstallPrompt}
          onDone={() => {
            setShowInstallPrompt(false)
            window.location.href = installDest
          }}
        />
      )}

      <div key={step} className="animate-in fade-in duration-300">
        {step === 0 && <WelcomeStep onNext={() => goToStep(1)} isLocked={isLocked} />}

        {step === 1 && (
          <WinnerStep
            teams={teams}
            selected={winner}
            onSelect={setWinner}
            onNext={() => goToStep(2)}
            isLocked={isLocked}
          />
        )}

        {step === 2 && (
          <ScorerStep
            selected={scorer}
            onSelect={setScorer}
            onSubmit={handleSubmit}
            submitting={submitting}
            isLocked={isLocked}
          />
        )}

        {step === 3 && winner && scorer && (
          <CelebrationStep
            winner={winner}
            scorer={scorer}
            onEnter={handleEnter}
            joining={joining}
          />
        )}
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingPageInner />
    </Suspense>
  )
}
