'use client'

import { useState, useEffect } from 'react'
import { useParams, notFound } from 'next/navigation'
import { Copy, Share2, Users, Check } from 'lucide-react'
import { ContextHeader } from '@/components/layout/context-header'
import { LeaderboardRow } from '@/components/molecules/leaderboard-row'
import { useAuth } from '@/providers/auth-provider'
import type { League, LeagueStanding } from '@/types/league'

export default function LeagueDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()

  const [league,   setLeague]   = useState<League | null>(null)
  const [standings, setStandings] = useState<LeagueStanding[]>([])
  const [loading,  setLoading]  = useState(true)
  const [notFound404, setNotFound404] = useState(false)
  const [copied,   setCopied]   = useState(false)

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

  const copyInviteCode = async () => {
    if (!league) return
    try {
      await navigator.clipboard.writeText(league.inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API not available — silently ignore
    }
  }

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

  const leader = standings[0]

  return (
    <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
      <ContextHeader
        title={league.name}
        back="/leagues"
        actions={
          <button
            className="flex items-center justify-center size-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Share"
          >
            <Share2 className="size-4" strokeWidth={1.75} />
          </button>
        }
      />

      <div className="flex flex-col gap-4 p-4">
        {/* ── League header card ──────────────────────────── */}
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[17px] font-bold text-foreground">{league.name}</h2>
              <div className="flex items-center gap-1.5 text-muted-foreground mt-0.5">
                <Users className="size-3.5" />
                <span className="text-sm">{league.memberCount} member{league.memberCount !== 1 ? 's' : ''}</span>
              </div>
            </div>
            {leader && (
              <div className="text-right">
                <p className="text-2xs text-muted-foreground font-medium">Leader</p>
                <p className="text-sm font-bold text-foreground truncate max-w-[100px]">
                  {leader.username}
                </p>
                <p className="text-xs font-black text-primary tabular">
                  {leader.totalPoints !== null ? `${leader.totalPoints} pts` : '—'}
                </p>
              </div>
            )}
          </div>

          {/* Invite code */}
          <div className="flex items-center justify-between bg-surface-elevated rounded-lg px-3 py-2.5">
            <div>
              <p className="text-2xs text-muted-foreground font-medium mb-0.5">Invite Code</p>
              <p className="text-sm font-black text-primary tracking-widest font-mono">
                {league.inviteCode}
              </p>
            </div>
            <button
              onClick={copyInviteCode}
              className="flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors"
            >
              {copied
                ? <><Check className="size-3.5" /> Copied!</>
                : <><Copy className="size-3.5" /> Copy</>
              }
            </button>
          </div>
        </div>

        {/* ── Standings ───────────────────────────────────── */}
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
    </div>
  )
}
