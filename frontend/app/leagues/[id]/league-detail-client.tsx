'use client'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { Copy, Share2, Users, Check, MoreVertical, Trash2, LogOut, X, QrCode, Link2, Globe, Trophy, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ContextHeader } from '@/components/layout/context-header'
import { LeaderboardRow } from '@/components/molecules/leaderboard-row'
import { UserAvatar } from '@/components/atoms/user-avatar'
import { LiveRefresh } from '@/components/atoms/live-refresh'
import { useAuth } from '@/providers/auth-provider'
import { apiFetch } from '@/lib/api-client'
import type { League, LeagueStanding, LeagueTournamentPicksData, LeagueMemberTournamentPick, MostPicked } from '@/types/league'
import { trackInviteLinkCopied } from '@/lib/analytics'
import { LeagueActivityFeed } from '@/components/molecules/league-activity-feed'

// Lazy-load the QR library (~80KB) — only downloaded when the modal opens.
const QRCodeSVG = dynamic(
  () => import('qrcode.react').then(m => m.QRCodeSVG),
  { loading: () => <div className="size-[200px] rounded-2xl bg-muted animate-pulse" /> },
)

// ─── Toast ────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error'
interface ToastState { message: string; type: ToastType; id: number }

function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000)
    return () => clearTimeout(t)
  }, [toast.id, onDismiss])

  return (
    <div
      className={`fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] left-4 right-4 z-50
        flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl shadow-xl
        text-sm font-bold animate-in slide-in-from-bottom-3 duration-300
        ${toast.type === 'success'
          ? 'bg-emerald-600 text-white'
          : 'bg-destructive text-destructive-foreground'
        }`}
    >
      <div className="flex items-center gap-2.5">
        {toast.type === 'success'
          ? <Check className="size-4 flex-shrink-0" />
          : <X    className="size-4 flex-shrink-0" />
        }
        <span>{toast.message}</span>
      </div>
      <button onClick={onDismiss} aria-label="Dismiss">
        <X className="size-4 opacity-60 hover:opacity-100" />
      </button>
    </div>
  )
}

// ─── QR code modal ────────────────────────────────────────────────────────────

function QRModal({ url, leagueName, onClose }: { url: string; leagueName: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-2xl p-6 flex flex-col items-center gap-4 shadow-2xl w-full max-w-xs"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between w-full">
          <p className="text-sm font-bold text-foreground">Scan to Join</p>
          <button
            onClick={onClose}
            className="size-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-4 bg-white rounded-2xl">
          <QRCodeSVG
            value={url}
            size={200}
            bgColor="#ffffff"
            fgColor="#0D1B3E"
            level="M"
          />
        </div>

        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">{leagueName}</p>
          <p className="text-2xs text-muted-foreground mt-0.5 font-mono break-all">{url}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Confirm modal ────────────────────────────────────────────────────────────

interface ConfirmModalProps {
  title: string
  body: string
  confirmLabel: string
  danger?: boolean
  loading: boolean
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmModal({ title, body, confirmLabel, danger = false, loading, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 flex flex-col gap-4 shadow-2xl">
        <h2 className="text-[17px] font-bold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
        <div className="flex flex-col gap-2 pt-1">
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`w-full h-11 rounded-xl text-sm font-bold transition-opacity
              ${danger ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'}
              ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'}`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="size-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                Loading…
              </span>
            ) : confirmLabel}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="w-full h-11 rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Settings menu ────────────────────────────────────────────────────────────

function SettingsMenu({ isOwner, onDelete, onLeave }: { isOwner: boolean; onDelete: () => void; onLeave: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-center size-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label="League settings"
      >
        <MoreVertical className="size-4" strokeWidth={1.75} />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-[500] bg-card border border-border rounded-xl shadow-2xl min-w-[160px] overflow-hidden">
          {isOwner ? (
            <button
              onClick={() => { setOpen(false); onDelete() }}
              className="flex items-center gap-2.5 w-full px-4 py-3 text-sm font-semibold text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="size-4" /> Delete League
            </button>
          ) : (
            <button
              onClick={() => { setOpen(false); onLeave() }}
              className="flex items-center gap-2.5 w-full px-4 py-3 text-sm font-semibold text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="size-4" /> Leave League
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Tournament picks tab ────────────────────────────────────────────────────

function InsightCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 min-w-0 bg-card rounded-2xl border border-border p-3 flex flex-col gap-2">
      <p className="text-2xs font-black tracking-[0.12em] uppercase text-muted-foreground/70">{label}</p>
      {children}
    </div>
  )
}

function WinnerInsight({ w }: { w: MostPicked }) {
  return (
    <div className="flex items-center gap-2">
      {w.flagUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={w.flagUrl} alt={w.name} className="w-7 h-[18px] rounded-sm object-cover flex-shrink-0" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-bold text-foreground truncate leading-tight">{w.name}</p>
        <p className="text-2xs text-muted-foreground">{w.count} pick{w.count !== 1 ? 's' : ''}</p>
      </div>
    </div>
  )
}

function ScorerInsight({ s }: { s: MostPicked }) {
  const initials = s.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="flex items-center gap-2">
      {s.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.photoUrl} alt={s.name} className="size-8 rounded-full object-cover flex-shrink-0" />
      ) : (
        <span className="size-8 rounded-full bg-surface-elevated border border-border flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">
          {initials}
        </span>
      )}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-bold text-foreground truncate leading-tight">{s.name}</p>
          {s.teamFlagUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.teamFlagUrl} alt={s.teamCode ?? ''} className="w-4 h-[10px] rounded-[2px] object-cover flex-shrink-0" />
          )}
        </div>
        <p className="text-2xs text-muted-foreground">{s.count} pick{s.count !== 1 ? 's' : ''}</p>
      </div>
    </div>
  )
}

function PickRow({ pick, isCurrentUser }: { pick: LeagueMemberTournamentPick; isCurrentUser: boolean }) {
  const initials = pick.scorerName
    ? pick.scorerName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : null

  return (
    <div className={cn(
      'flex items-center gap-3 px-3 py-2.5 rounded-xl border',
      isCurrentUser ? 'bg-primary/[0.06] border-primary/20' : 'bg-card border-border',
    )}>
      {/* User */}
      <div className="flex items-center gap-2 w-[100px] flex-shrink-0">
        <UserAvatar avatarUrl={pick.avatarUrl ?? undefined} avatarId={pick.avatarId ?? undefined} username={pick.username} size="xs" />
        <p className={cn('text-xs font-semibold truncate', isCurrentUser ? 'text-primary' : 'text-foreground')}>
          {pick.username}
        </p>
      </div>

      {/* Winner */}
      <div className="flex-1 flex items-center gap-1.5 min-w-0">
        {pick.winnerFlagUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pick.winnerFlagUrl} alt={pick.winnerName ?? ''} className="w-5 h-[14px] rounded-[3px] object-cover flex-shrink-0" />
        ) : (
          <span className="w-5 h-[14px] rounded-[3px] bg-surface-elevated border border-border/60 flex-shrink-0" />
        )}
        <span className="text-xs text-foreground truncate">
          {pick.winnerName ?? <span className="text-muted-foreground italic">—</span>}
        </span>
      </div>

      {/* Scorer */}
      <div className="flex items-center gap-1.5 w-[110px] flex-shrink-0">
        {pick.scorerPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pick.scorerPhotoUrl} alt={pick.scorerName ?? ''} className="size-5 rounded-full object-cover flex-shrink-0" />
        ) : initials ? (
          <span className="size-5 rounded-full bg-surface-elevated border border-border/60 flex items-center justify-center text-[9px] font-bold text-muted-foreground flex-shrink-0">
            {initials}
          </span>
        ) : (
          <span className="size-5 rounded-full bg-surface-elevated border border-border/60 flex-shrink-0" />
        )}
        <span className="text-xs text-foreground truncate">
          {pick.scorerName ?? <span className="text-muted-foreground italic">—</span>}
        </span>
      </div>
    </div>
  )
}

function TournamentPicksTab({
  data,
  currentUserId,
}: {
  data:           LeagueTournamentPicksData | null | undefined
  currentUserId?: string
}) {
  if (!data) {
    return (
      <div className="bg-card rounded-xl border border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">Tournament picks unavailable.</p>
      </div>
    )
  }

  const picksWithData = data.picks.filter(p => p.winnerId || p.topScorerId)
  const totalMembers  = data.picks.length
  const pickedCount   = picksWithData.length

  return (
    <div className="flex flex-col gap-4">

      {/* Before lock: banner */}
      {!data.isLocked && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-surface-elevated border border-border">
          <Lock className="size-4 text-muted-foreground flex-shrink-0 mt-0.5" strokeWidth={1.75} />
          <div>
            <p className="text-sm font-bold text-foreground">Picks revealed at kick-off</p>
            <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
              {pickedCount} of {totalMembers} member{totalMembers !== 1 ? 's' : ''} have made their picks.
              Individual selections are hidden until the tournament starts.
            </p>
          </div>
        </div>
      )}

      {/* Insights row (after lock) */}
      {data.isLocked && (data.mostPickedWinner || data.mostPickedScorer) && (
        <div>
          <p className="text-2xs font-black tracking-[0.12em] uppercase text-muted-foreground/70 mb-2">League Favourites</p>
          <div className="flex gap-3">
            <InsightCard label="Top Pick — Winner">
              {data.mostPickedWinner
                ? <WinnerInsight w={data.mostPickedWinner} />
                : <p className="text-sm text-muted-foreground italic">—</p>
              }
            </InsightCard>
            <InsightCard label="Top Pick — Golden Boot">
              {data.mostPickedScorer
                ? <ScorerInsight s={data.mostPickedScorer} />
                : <p className="text-sm text-muted-foreground italic">—</p>
              }
            </InsightCard>
          </div>
        </div>
      )}

      {/* Member picks table (after lock only) */}
      {data.isLocked && (
        <div>
          <div className="flex items-center px-3 py-1.5 mb-1">
            <span className="text-2xs font-bold text-muted-foreground w-[100px] flex-shrink-0">Player</span>
            <span className="text-2xs font-bold text-muted-foreground flex-1">Winner</span>
            <span className="text-2xs font-bold text-muted-foreground w-[110px] flex-shrink-0">Golden Boot</span>
          </div>
          <div className="flex flex-col gap-2">
            {data.picks.map(pick => (
              <PickRow
                key={pick.userId}
                pick={pick}
                isCurrentUser={pick.userId === currentUserId}
              />
            ))}
          </div>
        </div>
      )}

      {/* No picks at all */}
      {data.isLocked && data.picks.length === 0 && (
        <div className="bg-card rounded-xl border border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No members have made tournament picks yet.</p>
        </div>
      )}

    </div>
  )
}

// ─── Main client component ────────────────────────────────────────────────────

export function LeagueDetailClient({
  league,
  initialStandings,
  hasLiveMatches = false,
  initialTournamentPicks = null,
}: {
  league:                  League
  initialStandings:        LeagueStanding[]
  hasLiveMatches?:         boolean
  initialTournamentPicks?: LeagueTournamentPicksData | null
}) {
  const { user } = useAuth()

  const [activeTab,  setActiveTab]  = useState<'standings' | 'activity' | 'picks'>('standings')
  const [copyState,  setCopyState]  = useState<'idle' | 'copied'>('idle')
  const [showQR,     setShowQR]     = useState(false)
  const [modal,      setModal]      = useState<'delete' | 'leave' | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [toast,      setToast]      = useState<ToastState | null>(null)

  const showToast = (message: string, type: ToastType) =>
    setToast({ message, type, id: Date.now() })

  const inviteUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/join/${league.inviteCode}`
    : `https://wc26-predictor-xi.vercel.app/join/${league.inviteCode}`
  const shareText = `Join my MatchPoint26 league:\n${league.name} ⚽\n\n${inviteUrl}`

  const handleShare = async () => {
    try {
      if (navigator.share && navigator.canShare?.({ title: league.name, text: shareText, url: inviteUrl })) {
        await navigator.share({ title: league.name, text: shareText, url: inviteUrl })
      } else {
        await copyLink()
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        showToast('Could not open share sheet.', 'error')
      }
    }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      trackInviteLinkCopied({ leagueId: league.id })
      setCopyState('copied')
      showToast('Invite link copied!', 'success')
      setTimeout(() => setCopyState('idle'), 2500)
    } catch {
      showToast('Could not copy — please copy the link manually.', 'error')
    }
  }

  const handleDelete = async () => {
    setActionBusy(true)
    try {
      const res = await apiFetch(`/api/leagues/${league.id}`, { method: 'DELETE' })
      if (res.ok || res.status === 204) {
        setModal(null)
        showToast('League deleted.', 'success')
        // Hard navigate — avoids router.refresh() + router.push() concurrent-
        // startTransition conflict that triggers a global-error crash.
        window.location.href = '/leagues'
      } else {
        const data = await res.json().catch(() => ({}))
        showToast(data?.detail ?? 'Failed to delete league.', 'error')
        setModal(null)
      }
    } catch {
      showToast('Network error. Please try again.', 'error')
      setModal(null)
    } finally {
      setActionBusy(false)
    }
  }

  const handleLeave = async () => {
    setActionBusy(true)
    try {
      const res = await apiFetch(`/api/leagues/${league.id}/leave`, { method: 'DELETE' })
      if (res.ok || res.status === 204) {
        setModal(null)
        showToast('You have left the league.', 'success')
        window.location.href = '/leagues'
      } else {
        const data = await res.json().catch(() => ({}))
        showToast(data?.detail ?? 'Failed to leave league.', 'error')
        setModal(null)
      }
    } catch {
      showToast('Network error. Please try again.', 'error')
      setModal(null)
    } finally {
      setActionBusy(false)
    }
  }

  const leader    = initialStandings[0]
  const isOwner   = !!user && league.createdBy === user.sub
  const isDefault = !!league.isDefault

  return (
    <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
      <LiveRefresh active={hasLiveMatches} />
      <ContextHeader
        title={league.name}
        back="/leagues"
        actions={
          isDefault ? undefined : (
            <div className="flex items-center gap-1">
              <button
                onClick={handleShare}
                className="flex items-center justify-center size-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label="Share league"
              >
                <Share2 className="size-4" strokeWidth={1.75} />
              </button>
              <SettingsMenu
                isOwner={isOwner}
                onDelete={() => setModal('delete')}
                onLeave={() => setModal('leave')}
              />
            </div>
          )
        }
      />

      <div className="flex flex-col gap-4 p-4">

        {/* ── League info card ──────────────────────────────── */}
        <div className={`rounded-2xl border p-4 flex items-center justify-between ${
          isDefault ? 'bg-primary/[0.06] border-primary/25' : 'bg-card border-border'
        }`}>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              {isDefault && <Globe className="size-4 text-primary flex-shrink-0" strokeWidth={1.75} />}
              <h2 className="text-[17px] font-bold text-foreground">{league.name}</h2>
              {isDefault && (
                <span className="text-[9px] font-black tracking-[0.08em] uppercase
                  px-1.5 py-0.5 rounded-full bg-primary/15 text-primary leading-none flex-shrink-0">
                  Official
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground mt-0.5">
              <Users className="size-3.5" />
              <span className="text-sm">{league.memberCount} member{league.memberCount !== 1 ? 's' : ''}</span>
            </div>
          </div>
          {leader && (
            <div className="text-right">
              <p className="text-2xs text-muted-foreground font-medium">Leader</p>
              <p className="text-sm font-bold text-foreground truncate max-w-[100px]">{leader.username}</p>
              <p className="text-xs font-black text-primary tabular">
                {leader.totalPoints !== null ? `${leader.totalPoints} pts` : '—'}
              </p>
            </div>
          )}
        </div>

        {/* ── Invite card (private leagues) / Info banner (default league) ── */}
        {isDefault ? (
          <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] px-4 py-3.5 flex items-start gap-3">
            <Globe className="size-4 text-primary flex-shrink-0 mt-0.5" strokeWidth={1.75} />
            <div>
              <p className="text-sm font-bold text-foreground">Global league — everyone&apos;s here</p>
              <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                Every MatchPoint26 player is automatically a member. Use this as the official app-wide leaderboard.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-primary/25 bg-primary/[0.06] overflow-hidden">
            <div className="px-4 pt-4 pb-3">
              <p className="text-xs font-bold tracking-[0.1em] uppercase text-primary/70 mb-1">
                Invite Friends
              </p>

              {/* URL preview row */}
              <div className="flex items-center gap-2 mb-3">
                <Link2 className="size-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-xs text-muted-foreground font-mono truncate">
                  {inviteUrl.replace(/^https?:\/\//, '').replace(league.inviteCode, '')}
                  <span className="text-primary font-bold">{league.inviteCode}</span>
                </span>
              </div>

              {/* Primary — Share League */}
              <button
                onClick={handleShare}
                className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold
                  flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all duration-150 mb-2"
              >
                <Share2 className="size-4" strokeWidth={2} />
                Share League
              </button>

              {/* Secondary — Copy Link */}
              <button
                onClick={copyLink}
                className={`w-full h-10 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-all duration-200
                  ${copyState === 'copied'
                    ? 'bg-emerald-600/20 border border-emerald-500/40 text-emerald-400'
                    : 'bg-surface-elevated border border-border text-foreground hover:border-primary/40 hover:text-primary'
                  }`}
              >
                {copyState === 'copied'
                  ? <><Check className="size-3.5" strokeWidth={2.5} /> Copied!</>
                  : <><Copy className="size-3.5" /> Copy Link</>
                }
              </button>
            </div>

            {/* QR code toggle row */}
            <button
              onClick={() => setShowQR(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 border-t border-primary/10
                text-2xs font-semibold text-muted-foreground hover:text-primary transition-colors"
            >
              <QrCode className="size-3" />
              Show QR Code
            </button>
          </div>
        )}

      </div>

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <div className="px-4 pb-1">
        <div className="relative flex bg-surface-elevated rounded-xl p-1">
          <span
            className="absolute top-1 bottom-1 rounded-[10px] bg-card shadow-sm border border-border/60 transition-transform duration-200 ease-out pointer-events-none"
            style={{
              width: 'calc((100% - 8px) / 3)',
              transform: `translateX(${(['standings', 'activity', 'picks'] as const).indexOf(activeTab) * 100}%)`,
            }}
          />
          {(['standings', 'activity', 'picks'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2',
                'text-xs font-semibold rounded-[10px] transition-colors duration-150',
                activeTab === tab ? 'text-foreground font-bold' : 'text-muted-foreground hover:text-foreground/70',
              )}
            >
              {tab === 'standings' ? 'Standings' : tab === 'activity' ? 'Activity' : 'Tournament'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ──────────────────────────────────────── */}
      <div className="px-4 pb-4 pt-3">
        {activeTab === 'standings' ? (
          initialStandings.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">No standings yet — predictions needed.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {initialStandings.map(s => (
                <LeaderboardRow
                  key={s.userId}
                  rank={s.rank}
                  username={s.username}
                  avatarUrl={s.avatarUrl}
                  avatarId={s.avatarId}
                  points={s.totalPoints}
                  isCurrentUser={user ? s.userId === user.sub : false}
                />
              ))}
            </div>
          )
        ) : activeTab === 'activity' ? (
          <LeagueActivityFeed leagueId={league.id} currentUserId={user?.sub} />
        ) : (
          <TournamentPicksTab data={initialTournamentPicks} currentUserId={user?.sub} />
        )}
      </div>

      {/* ── QR modal ─────────────────────────────────────────── */}
      {!isDefault && showQR && (
        <QRModal url={inviteUrl} leagueName={league.name} onClose={() => setShowQR(false)} />
      )}

      {/* ── Confirm modals ────────────────────────────────────── */}
      {!isDefault && modal === 'delete' && (
        <ConfirmModal
          title="Delete League?"
          body={`"${league.name}" will be permanently deleted. All members will lose access and this cannot be undone.`}
          confirmLabel="Delete League"
          danger
          loading={actionBusy}
          onConfirm={handleDelete}
          onCancel={() => setModal(null)}
        />
      )}
      {!isDefault && modal === 'leave' && (
        <ConfirmModal
          title="Leave League?"
          body={`You will be removed from "${league.name}" and lose your standing. You can rejoin with the invite link.`}
          confirmLabel="Leave League"
          danger
          loading={actionBusy}
          onConfirm={handleLeave}
          onCancel={() => setModal(null)}
        />
      )}

      {/* ── Toast ─────────────────────────────────────────────── */}
      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}

    </div>
  )
}
