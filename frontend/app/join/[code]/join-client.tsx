'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'
import { Users, Trophy, Loader2, Share2 } from 'lucide-react'
import { trackLeagueJoined } from '@/lib/analytics'

interface Props {
  name:            string
  memberCount:     number
  creatorUsername: string
  inviteCode:      string
  initialError?:   string | null
}

export function JoinClient({ name, memberCount, creatorUsername, inviteCode, initialError = null }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(initialError)

  const inviteUrl = typeof window !== 'undefined' ? `${window.location.origin}/join/${inviteCode}` : ''

  const handleJoin = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/leagues/join', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ inviteCode }),
      })
      const data = await res.json()

      if (res.ok) {
        trackLeagueJoined({ source: 'invite_link' })
        router.push(`/leagues/${data.id}`)
        return
      }
      setError(data?.detail ?? 'Could not join league. Please try again.')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col min-h-dvh items-center justify-center p-6 bg-background">
      {/* App wordmark */}
      <p className="text-xs font-black tracking-[0.2em] uppercase text-muted-foreground mb-8">
        MatchPoint26
      </p>

      {/* Card */}
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl overflow-hidden shadow-2xl">

        {/* Top accent stripe */}
        <div className="h-1 w-full bg-gradient-to-r from-primary/60 via-primary to-primary/60" />

        <div className="p-6 flex flex-col gap-5">
          {/* Icon + league name */}
          <div className="flex flex-col items-center gap-3 text-center pt-1">
            <div className="size-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-inner">
              <Trophy className="size-8 text-primary" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-1">You've been invited to join</p>
              <h1 className="text-xl font-black text-foreground leading-tight">{name}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Created by <span className="font-semibold text-foreground">{creatorUsername}</span>
              </p>
            </div>
          </div>

          {/* Members pill */}
          <div className="flex items-center justify-center gap-2 py-2.5 px-4 bg-surface-elevated rounded-xl border border-border">
            <Users className="size-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">
              {memberCount} member{memberCount !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive text-center font-medium -mb-1">{error}</p>
          )}

          {/* Join CTA */}
          <button
            onClick={handleJoin}
            disabled={loading}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground text-[15px] font-bold
              transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
          >
            {loading
              ? <><Loader2 className="size-4 animate-spin" /> Joining…</>
              : 'Join League'
            }
          </button>

          {/* Invite URL — de-emphasized */}
          <div className="flex items-center gap-1.5 justify-center">
            <Share2 className="size-3 text-muted-foreground/50 flex-shrink-0" />
            <p className="text-2xs text-muted-foreground/60 font-mono truncate">
              {inviteUrl || `wc26-predictor-xi.vercel.app/join/${inviteCode}`}
            </p>
          </div>
        </div>
      </div>

      {/* Already have account link */}
      <a
        href="/leagues"
        className="mt-6 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        Go to my leagues
      </a>
    </div>
  )
}
