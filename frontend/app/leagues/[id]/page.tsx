'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, notFound, useRouter } from 'next/navigation'
import { Copy, Share2, Users, Check, MoreVertical, Trash2, LogOut, X, QrCode, Link2, Globe } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { ContextHeader } from '@/components/layout/context-header'
import { LeaderboardRow } from '@/components/molecules/leaderboard-row'
import { useAuth } from '@/providers/auth-provider'
import type { League, LeagueStanding } from '@/types/league'

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LeagueDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const router = useRouter()

  const [league,      setLeague]      = useState<League | null>(null)
  const [standings,   setStandings]   = useState<LeagueStanding[]>([])
  const [loading,     setLoading]     = useState(true)
  const [notFound404, setNotFound404] = useState(false)

  const [copyState,   setCopyState]   = useState<'idle' | 'copied'>('idle')
  const [showQR,      setShowQR]      = useState(false)
  const [modal,       setModal]       = useState<'delete' | 'leave' | null>(null)
  const [actionBusy,  setActionBusy]  = useState(false)
  const [toast,       setToast]       = useState<ToastState | null>(null)

  const showToast = (message: string, type: ToastType) =>
    setToast({ message, type, id: Date.now() })

  useEffect(() => {
    if (!id) return
    Promise.all([
      fetch(`/api/leagues/${id}`).then(r => {
        if (r.status === 404 || r.status === 403) { setNotFound404(true); return null }
        return r.json()
      }),
      fetch(`/api/leagues/${id}/standings`).then(r => r.ok ? r.json() : []),
    ])
      .then(([l, s]) => {
        if (l) setLeague(l)
        setStandings(Array.isArray(s) ? s : [])
      })
      .catch(() => setNotFound404(true))
      .finally(() => setLoading(false))
  }, [id])

  const inviteUrl = league ? `${window.location.origin}/join/${league.inviteCode}` : ''
  const shareText = league
    ? `Join my MatchPoint26 league:\n${league.name} ⚽\n\n${inviteUrl}`
    : ''

  const handleShare = async () => {
    if (!league) return
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
    if (!league) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
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
      const res = await fetch(`/api/leagues/${id}`, { method: 'DELETE' })
      if (res.ok || res.status === 204) {
        setModal(null)
        showToast('League deleted.', 'success')
        setTimeout(() => router.push('/leagues'), 1200)
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
      const res = await fetch(`/api/leagues/${id}/leave`, { method: 'DELETE' })
      if (res.ok || res.status === 204) {
        setModal(null)
        showToast('You have left the league.', 'success')
        setTimeout(() => router.push('/leagues'), 1200)
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

  // ── Loading ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
        <ContextHeader title="League" back="/leagues" />
        <div className="flex flex-1 items-center justify-center">
          <div className="size-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </div>
    )
  }

  if (notFound404 || !league) return notFound()

  const leader    = standings[0]
  const isOwner   = !!user && league.createdBy === user.sub
  const isDefault = !!league.isDefault

  return (
    <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
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
                  matchpoint26.vercel.app/join/<span className="text-primary font-bold">{league.inviteCode}</span>
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

        {/* ── Standings ─────────────────────────────────────── */}
        <div>
          <p className="text-2xs font-bold tracking-[0.12em] uppercase text-muted-foreground mb-3">
            Standings
          </p>
          {standings.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">No standings yet — predictions needed.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {standings.map(s => (
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
          )}
        </div>

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
