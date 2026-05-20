import Link from 'next/link'
import { ChevronRight, Trophy, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TOURNAMENT_BONUS } from '@/lib/constants'
import type { TournamentPick, ScorerInfo } from '@/types/tournament'
import type { Team } from '@/types/match'

interface TournamentPicksCardProps {
  pick:  TournamentPick
  teams: Team[]
}

export function TournamentPicksCard({ pick, teams }: TournamentPicksCardProps) {
  const hasPicks = pick.winnerId || pick.topScorerId
  const winner   = teams.find(t => t.id === pick.winnerId)

  return (
    <Link
      href="/tournament"
      className={cn(
        'flex flex-col rounded-xl border overflow-hidden transition-colors',
        hasPicks ? 'bg-card border-gold-border' : 'bg-primary-muted border-primary/20',
      )}
    >
      {/* Header row */}
      <div className={cn(
        'flex items-center justify-between px-4 py-3 border-b',
        hasPicks ? 'border-gold-border bg-gold-muted' : 'border-border',
      )}>
        <div className="flex items-center gap-2">
          <Trophy className={cn('size-4 flex-shrink-0', hasPicks ? 'text-gold' : 'text-primary')} strokeWidth={2} />
          <span className="text-sm font-bold text-foreground">Tournament Picks</span>
          {pick.isLocked && (
            <span className="text-2xs font-bold text-muted-foreground bg-surface-elevated rounded-full px-2 py-0.5">
              Locked
            </span>
          )}
        </div>
        <ChevronRight className="size-4 text-muted-foreground" />
      </div>

      {hasPicks ? (
        <div className="grid grid-cols-2 divide-x divide-border">
          {/* Winner cell */}
          <div className="flex flex-col items-center py-3 px-2 gap-1">
            <p className="text-2xs font-bold tracking-[0.1em] uppercase text-muted-foreground">Winner</p>
            {winner?.flagUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={winner.flagUrl} alt={winner.name} className="w-7 h-[18px] rounded-sm object-cover" />
            )}
            <p className="text-sm font-bold text-foreground text-center leading-tight">
              {winner ? winner.name : '—'}
            </p>
            <span className="text-2xs font-bold text-gold">+{TOURNAMENT_BONUS.WINNER} pts</span>
          </div>

          {/* Top scorer cell */}
          <ScorerCell scorer={pick.scorer} />
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-3">
          <Zap className="size-4 text-primary flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-primary">Make your tournament picks!</p>
            <p className="text-xs text-muted-foreground">Earn up to +{TOURNAMENT_BONUS.WINNER + TOURNAMENT_BONUS.TOP_SCORER} bonus points</p>
          </div>
        </div>
      )}
    </Link>
  )
}

function ScorerCell({ scorer }: { scorer?: ScorerInfo }) {
  return (
    <div className="flex flex-col items-center py-3 px-2 gap-1">
      <p className="text-2xs font-bold tracking-[0.1em] uppercase text-muted-foreground">Top Scorer</p>
      {scorer ? (
        <>
          <ScorerPhoto scorer={scorer} />
          <p className="text-sm font-bold text-foreground text-center leading-tight">{scorer.name}</p>
          {scorer.teamFlagUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={scorer.teamFlagUrl} alt={scorer.teamShortCode ?? ''} className="w-5 h-[13px] rounded-[2px] object-cover" />
          )}
        </>
      ) : (
        <p className="text-sm font-bold text-muted-foreground text-center leading-tight">—</p>
      )}
      <span className="text-2xs font-bold text-gold">+{TOURNAMENT_BONUS.TOP_SCORER} pts</span>
    </div>
  )
}

function ScorerPhoto({ scorer }: { scorer: ScorerInfo }) {
  if (scorer.photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={scorer.photoUrl}
        alt={scorer.name}
        className="size-8 rounded-full object-cover"
      />
    )
  }
  const initials = scorer.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <span className="size-8 rounded-full bg-surface-elevated flex items-center justify-center text-xs font-bold text-muted-foreground">
      {initials}
    </span>
  )
}
