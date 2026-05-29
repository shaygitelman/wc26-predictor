'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, Hash, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LeagueCard } from '@/components/molecules/league-card'
import { SectionHeader } from '@/components/molecules/section-header'
import type { League } from '@/types/league'
import { trackLeagueCreated, trackLeagueJoined } from '@/lib/analytics'
import { apiFetch } from '@/lib/api-client'

type SheetMode   = 'create' | 'join' | null
type SheetStatus = 'idle' | 'loading' | 'success' | 'error'

function sortLeagues(list: League[]): League[] {
  return [...list].sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1
    if (!a.isDefault && b.isDefault) return 1
    return 0
  })
}

export function LeaguesClient({ initialLeagues }: { initialLeagues: League[] }) {
  const [leagues, setLeagues] = useState<League[]>(sortLeagues(initialLeagues))
  const [sheet,   setSheet]   = useState<SheetMode>(null)

  // Create sheet state
  const [leagueName,   setLeagueName]   = useState('')
  const [createStatus, setCreateStatus] = useState<SheetStatus>('idle')
  const [createError,  setCreateError]  = useState('')

  // Join sheet state
  const [inviteCode, setInviteCode] = useState('')
  const [joinStatus, setJoinStatus] = useState<SheetStatus>('idle')
  const [joinError,  setJoinError]  = useState('')

  const nameInputRef = useRef<HTMLInputElement>(null)
  const codeInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (sheet === 'create') setTimeout(() => nameInputRef.current?.focus(), 200)
    if (sheet === 'join')   setTimeout(() => codeInputRef.current?.focus(), 200)
  }, [sheet])

  const closeSheet = () => {
    setSheet(null)
    setLeagueName(''); setCreateStatus('idle'); setCreateError('')
    setInviteCode(''); setJoinStatus('idle');   setJoinError('')
  }

  const isSheetBusy = createStatus === 'loading' || joinStatus === 'loading'

  const handleCreate = async () => {
    const name = leagueName.trim()
    if (!name || name.length < 2) { setCreateError('Name must be at least 2 characters.'); return }
    setCreateStatus('loading'); setCreateError('')
    try {
      const res  = await apiFetch('/api/leagues', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.detail ?? data?.error ?? 'Failed to create league')
      const newLeague: League = data
      trackLeagueCreated()
      setLeagues(prev => sortLeagues([newLeague, ...prev]))
      closeSheet()
      // Hard navigate so the league detail page loads fresh from the server.
      // router.refresh() + router.push() together cause a concurrent-startTransition
      // conflict that throws a global error; hard nav avoids it entirely.
      window.location.href = `/leagues/${newLeague.id}`
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Something went wrong')
      setCreateStatus('error')
    }
  }

  const handleJoin = async () => {
    const code = inviteCode.trim().toUpperCase()
    if (!code) { setJoinError('Enter an invite code.'); return }
    setJoinStatus('loading'); setJoinError('')
    try {
      const res  = await apiFetch('/api/leagues/join', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ inviteCode: code }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409) throw new Error("You're already a member of this league.")
        if (res.status === 404) throw new Error('Invalid invite code. Check and try again.')
        throw new Error(data?.detail ?? data?.error ?? 'Failed to join league')
      }
      const joined: League = data
      trackLeagueJoined({ source: 'code_entry' })
      setLeagues(prev => prev.some(l => l.id === joined.id) ? prev : sortLeagues([joined, ...prev]))
      closeSheet()
      window.location.href = `/leagues/${joined.id}`
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Something went wrong')
      setJoinStatus('error')
    }
  }

  return (
    <>
      <div className="flex flex-col gap-5 p-4">
        {/* ── Action buttons ──────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setSheet('create')}
            className={cn(
              'flex items-center justify-center gap-2 rounded-2xl py-3.5',
              'text-sm font-bold bg-primary text-primary-foreground',
              'hover:opacity-90 active:scale-[0.98] transition-all duration-150 shadow-primary-glow',
            )}
          >
            <Plus className="size-4" strokeWidth={2.5} />
            Create League
          </button>
          <button
            onClick={() => setSheet('join')}
            className={cn(
              'flex items-center justify-center gap-2 rounded-2xl py-3.5',
              'text-sm font-bold bg-card text-foreground border border-border',
              'hover:bg-surface-elevated active:scale-[0.98] transition-all duration-150 shadow-card',
            )}
          >
            <Hash className="size-4" strokeWidth={2.5} />
            Join with Code
          </button>
        </div>

        {/* ── My leagues ──────────────────────────────────────── */}
        <section>
          <SectionHeader title="My Leagues" />
          {leagues.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-6 text-center shadow-card">
              <p className="text-sm font-semibold text-foreground mb-1">No leagues yet</p>
              <p className="text-xs text-muted-foreground">
                Create one or join a friend&apos;s with their invite code.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {leagues.map(league => (
                <LeagueCard key={league.id} league={league} />
              ))}
            </div>
          )}
        </section>

        {/* ── Invite hint ─────────────────────────────────────── */}
        {leagues.length > 0 && (
          <div className="bg-card rounded-2xl border border-border p-4 text-center shadow-card">
            <p className="text-sm font-semibold text-foreground mb-1">
              Want to compete with more friends?
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              Create a private league and share your invite code.
              Up to 500 members per league.
            </p>
            <button
              onClick={() => setSheet('create')}
              className="text-xs font-bold text-primary hover:text-primary/80 transition-colors"
            >
              Create a new league →
            </button>
          </div>
        )}
      </div>

      {/* ── Sheet backdrop ──────────────────────────────────────── */}
      {sheet && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-[55] animate-fade-in"
          onClick={() => { if (!isSheetBusy) closeSheet() }}
        />
      )}

      {/* ── Create League sheet ─────────────────────────────────── */}
      <BottomSheet open={sheet === 'create'}>
        <SheetHandle />
        <SheetCloseButton onClose={closeSheet} disabled={isSheetBusy} />
        <div className="px-6 pt-3 pb-2">
          <p className="text-center text-[11px] font-black tracking-[0.14em] uppercase text-muted-foreground/80">
            Create League
          </p>
        </div>
        <div className="px-6 py-4 flex flex-col gap-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1.5">League Name</label>
            <input
              ref={nameInputRef}
              value={leagueName}
              onChange={e => { setLeagueName(e.target.value); setCreateError('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
              placeholder="e.g. The Office FC"
              maxLength={50}
              className={cn(
                'w-full rounded-xl border bg-surface-elevated px-4 py-3',
                'text-[15px] text-foreground placeholder:text-muted-foreground',
                'focus:outline-none focus:border-primary transition-colors',
                createError ? 'border-status-lost' : 'border-border',
              )}
            />
            {createError && <p className="text-xs text-status-lost mt-1.5">{createError}</p>}
          </div>
          <button
            onClick={handleCreate}
            disabled={createStatus === 'loading' || createStatus === 'success'}
            className={cn(
              'w-full flex items-center justify-center gap-2 rounded-xl py-4',
              'text-[15px] font-bold transition-all duration-200',
              createStatus === 'success'
                ? 'bg-status-won text-white'
                : 'bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98]',
              createStatus === 'loading' && 'opacity-70 cursor-wait',
            )}
          >
            {createStatus === 'success' ? <><Check className="size-4" strokeWidth={3} /> League Created!</>
              : createStatus === 'loading' ? 'Creating…'
              : 'Create League'}
          </button>
          <p className="text-center text-2xs text-muted-foreground">
            You&apos;ll get a unique invite code to share with friends.
          </p>
        </div>
      </BottomSheet>

      {/* ── Join League sheet ───────────────────────────────────── */}
      <BottomSheet open={sheet === 'join'}>
        <SheetHandle />
        <SheetCloseButton onClose={closeSheet} disabled={isSheetBusy} />
        <div className="px-6 pt-3 pb-2">
          <p className="text-center text-[11px] font-black tracking-[0.14em] uppercase text-muted-foreground/80">
            Join with Invite Code
          </p>
        </div>
        <div className="px-6 py-4 flex flex-col gap-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Invite Code</label>
            <input
              ref={codeInputRef}
              value={inviteCode}
              onChange={e => { setInviteCode(e.target.value.toUpperCase()); setJoinError('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleJoin() }}
              placeholder="e.g. ABCD1234"
              maxLength={8}
              className={cn(
                'w-full rounded-xl border bg-surface-elevated px-4 py-3',
                'text-[15px] text-foreground placeholder:text-muted-foreground font-mono tracking-widest',
                'focus:outline-none focus:border-primary transition-colors uppercase',
                joinError ? 'border-status-lost' : 'border-border',
              )}
            />
            {joinError && <p className="text-xs text-status-lost mt-1.5">{joinError}</p>}
          </div>
          <button
            onClick={handleJoin}
            disabled={joinStatus === 'loading' || joinStatus === 'success'}
            className={cn(
              'w-full flex items-center justify-center gap-2 rounded-xl py-4',
              'text-[15px] font-bold transition-all duration-200',
              joinStatus === 'success'
                ? 'bg-status-won text-white'
                : 'bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98]',
              joinStatus === 'loading' && 'opacity-70 cursor-wait',
            )}
          >
            {joinStatus === 'success' ? <><Check className="size-4" strokeWidth={3} /> Joined!</>
              : joinStatus === 'loading' ? 'Joining…'
              : 'Join League'}
          </button>
          <p className="text-center text-2xs text-muted-foreground">
            Ask a friend to share their league&apos;s invite code.
          </p>
        </div>
      </BottomSheet>
    </>
  )
}

function BottomSheet({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div className={cn(
      'fixed left-0 right-0 bottom-0 z-[60]',
      'bg-card border-t border-border rounded-t-[28px]',
      'pb-safe transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
      open ? 'translate-y-0' : 'translate-y-full',
    )}>
      {children}
    </div>
  )
}

function SheetHandle() {
  return (
    <div className="flex justify-center pt-3 pb-1">
      <div className="w-9 h-1 rounded-full bg-border" />
    </div>
  )
}

function SheetCloseButton({ onClose, disabled }: { onClose: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClose}
      disabled={disabled}
      className="absolute top-4 right-4 size-8 flex items-center justify-center rounded-full bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
    >
      <X className="size-4" />
    </button>
  )
}
