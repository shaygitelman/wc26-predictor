import Link from 'next/link'
import { cn } from '@/lib/utils'
import { TeamFlag } from '@/components/atoms/team-flag'
import { PointsBadge } from '@/components/atoms/points-badge'
import { RoundBadge } from '@/components/atoms/round-badge'
import type { Match } from '@/types/match'
import type { Prediction } from '@/types/prediction'

interface PredictionResultCardProps {
  match: Match
  prediction: Prediction
  className?: string
}

const OUTCOME_LABEL: Record<string, string> = {
  exact:      '🎯 Exact score!',
  difference: '✓ Goal diff correct',
  outcome:    '✓ Correct outcome',
  wrong:      '✗ Incorrect',
  pending:    '⏳ Awaiting result',
}

export function PredictionResultCard({
  match,
  prediction,
  className,
}: PredictionResultCardProps) {
  const isFinished = match.status === 'finished'
  const isPending  = prediction.outcome === 'pending'

  return (
    <Link
      href={`/matches/${match.id}`}
      className={cn(
        'block bg-card rounded-xl border border-border p-4',
        'hover:border-primary/30 active:scale-[0.985] transition-all duration-150',
        className,
      )}
    >
      {/* Top row */}
      <div className="flex items-center justify-between mb-3">
        <RoundBadge round={match.round} group={match.group} />
        {isFinished && !isPending && prediction.pointsEarned !== undefined ? (
          <PointsBadge points={prediction.pointsEarned} outcome={prediction.outcome} />
        ) : isPending ? (
          <span className="text-2xs font-bold text-muted-foreground bg-surface-elevated px-2 py-0.5 rounded-full">
            LIVE / UPCOMING
          </span>
        ) : null}
      </div>

      {/* Teams */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <TeamFlag team={match.homeTeam} size="sm" />
          <span className="text-sm font-semibold text-foreground truncate">
            {match.homeTeam.name}
          </span>
        </div>
        <span className="text-xs text-muted-foreground font-medium flex-shrink-0">vs</span>
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          <span className="text-sm font-semibold text-foreground truncate">
            {match.awayTeam.name}
          </span>
          <TeamFlag team={match.awayTeam} size="sm" />
        </div>
      </div>

      {/* Scores row */}
      <div className="flex items-center gap-2 bg-surface-elevated rounded-lg p-3">
        <div className="flex-1 text-center">
          <p className="text-2xs text-muted-foreground font-medium mb-0.5">Your pick</p>
          <p className="text-base font-black tabular text-foreground">
            {prediction.predictedHome} – {prediction.predictedAway}
          </p>
        </div>

        {isFinished && (
          <>
            <div className="w-px h-8 bg-border" />
            <div className="flex-1 text-center">
              <p className="text-2xs text-muted-foreground font-medium mb-0.5">Result</p>
              <p className="text-base font-black tabular text-foreground">
                {match.homeScore} – {match.awayScore}
              </p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="flex-1 text-center">
              <p className="text-2xs font-bold" style={{
                color: prediction.outcome === 'exact'       ? 'var(--status-won)'
                     : prediction.outcome === 'wrong'       ? 'var(--status-lost)'
                     : 'var(--status-partial)',
              }}>
                {OUTCOME_LABEL[prediction.outcome ?? 'pending']}
              </p>
            </div>
          </>
        )}
      </div>
    </Link>
  )
}
