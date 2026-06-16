'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { UserAvatar } from '@/components/atoms/user-avatar'
import { PointsBadge } from '@/components/atoms/points-badge'
import { apiFetch } from '@/lib/api-client'
import type { LeagueActivityMatch, LeagueActivityPrediction } from '@/types/league'
import type { PredictionOutcome } from '@/types/prediction'

// ── Round labels ──────────────────────────────────────────────────────────────

const ROUND_LABELS: Record<string, string> = {
  group: 'Group Stage',
  r32:   'Round of 32',
  r16:   'Round of 16',
  qf:    'Quarter-final',
  sf:    'Semi-final',
  '3rd': '3rd Place',
  final: 'Final',
}

// ── Headline computation ──────────────────────────────────────────────────────

type HeadlineType = 'perfect' | 'sole_believer' | 'against_crowd' | 'sweep' | 'nobody'

interface Headline {
  type: HeadlineType
  text: string
}

function isCorrectOutcome(outcome: string | null): boolean {
  return outcome === 'exact' || outcome === 'difference' || outcome === 'outcome'
}

function getDirection(home: number, away: number): 'home' | 'draw' | 'away' {
  if (home > away) return 'home'
  if (home < away) return 'away'
  return 'draw'
}

function getPredictedDirection(p: LeagueActivityPrediction): 'home' | 'draw' | 'away' {
  if (p.predictedHome === null || p.predictedAway === null) return 'draw'
  return getDirection(p.predictedHome, p.predictedAway)
}

function displayName(p: LeagueActivityPrediction): string {
  return p.isCurrentUser ? 'You' : p.username
}

function nameList(names: string[]): string {
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names[0]} and ${names.length - 1} others`
}

function computeHeadline(match: LeagueActivityMatch): Headline | null {
  const preds     = match.predictions
  const submitted = preds.length
  if (submitted === 0) return null

  const exact   = preds.filter(p => p.outcome === 'exact')
  const correct = preds.filter(p => isCorrectOutcome(p.outcome))
  const wrong   = preds.filter(p => p.outcome === 'wrong')

  // Rule 1: Perfect Pick — at least one exact score
  if (exact.length > 0) {
    const names      = exact.map(displayName)
    const actualDir  = getDirection(match.homeScore, match.awayScore)
    const winnerTeam = actualDir === 'home' ? match.homeTeam : actualDir === 'away' ? match.awayTeam : null
    const scoreStr   = `${match.homeScore}–${match.awayScore}`
    const prefix = names.length === 1 && exact[0].isCurrentUser ? 'You' : null

    if (winnerTeam) {
      if (names.length === 1) {
        const subj = prefix ?? names[0]
        return { type: 'perfect', text: `${subj} called ${winnerTeam} ${scoreStr} exactly` }
      }
      if (names.length === 2) {
        return { type: 'perfect', text: `${names[0]} and ${names[1]} both called ${winnerTeam} ${scoreStr} exactly` }
      }
      return { type: 'perfect', text: `${names[0]} and ${exact.length - 1} others called ${winnerTeam} ${scoreStr} exactly` }
    } else {
      if (names.length === 1) {
        const subj = prefix ?? names[0]
        return { type: 'perfect', text: `${subj} called the ${scoreStr} draw exactly` }
      }
      if (names.length === 2) {
        return { type: 'perfect', text: `${names[0]} and ${names[1]} both called the ${scoreStr} draw exactly` }
      }
      return { type: 'perfect', text: `${names[0]} and ${exact.length - 1} others called the ${scoreStr} draw exactly` }
    }
  }

  // Rule 2: Sole Believer — exactly 1 correct, ≥2 wrong
  if (correct.length === 1 && wrong.length >= 2) {
    const who       = displayName(correct[0])
    const isYou     = correct[0].isCurrentUser
    const actualDir = getDirection(match.homeScore, match.awayScore)
    const teamName  = actualDir === 'home'
      ? match.homeTeam
      : actualDir === 'away'
        ? match.awayTeam
        : 'the draw'
    const verb = isYou ? 'were' : 'was'
    return { type: 'sole_believer', text: `${who} ${verb} the only one who backed ${teamName}` }
  }

  // Rule 3: Against the Crowd — ≥60% wrong, 1–2 correct, ≥3 submitted
  if (submitted >= 3 && correct.length >= 1 && correct.length <= 2 && wrong.length / submitted >= 0.6) {
    const wrongDirCounts: Record<string, number> = {}
    for (const p of wrong) {
      const dir = getPredictedDirection(p)
      wrongDirCounts[dir] = (wrongDirCounts[dir] ?? 0) + 1
    }
    const crowdDir       = (Object.entries(wrongDirCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'home') as 'home' | 'draw' | 'away'
    const crowdPickCount = wrongDirCounts[crowdDir] ?? wrong.length
    const crowdTeam      = crowdDir === 'home' ? match.homeTeam : crowdDir === 'away' ? match.awayTeam : 'a draw'
    const contrarianText = nameList(correct.map(displayName))
    return {
      type: 'against_crowd',
      text: `${contrarianText} called it while ${crowdPickCount} of ${submitted} backed ${crowdTeam}`,
    }
  }

  // Rule 4: Clean Sweep — all correct, ≥3 submitted, zero wrong
  if (submitted >= 3 && correct.length === submitted && wrong.length === 0) {
    return { type: 'sweep', text: `Everyone called it — all ${submitted} members got this right` }
  }

  // Rule 5: Nobody Saw It Coming — zero correct, ≥3 submitted
  if (correct.length === 0 && submitted >= 3) {
    return { type: 'nobody', text: `Nobody called this — the whole league missed` }
  }

  return null
}

// ── Streak computation ────────────────────────────────────────────────────────

function computeCurrentStreaks(matches: LeagueActivityMatch[]): Map<string, number> {
  const streaks = new Map<string, number>()
  const done    = new Set<string>()

  for (const match of matches) {
    for (const pred of match.predictions) {
      if (done.has(pred.userId)) continue
      if (isCorrectOutcome(pred.outcome)) {
        streaks.set(pred.userId, (streaks.get(pred.userId) ?? 0) + 1)
      } else {
        done.add(pred.userId)
        if (!streaks.has(pred.userId)) streaks.set(pred.userId, 0)
      }
    }
  }

  return streaks
}

// ── Headline banner ───────────────────────────────────────────────────────────

const HEADLINE_STYLE: Record<HeadlineType, { emoji: string; wrapper: string; text: string }> = {
  perfect:       { emoji: '⭐', wrapper: 'bg-gold-muted border-gold-border',              text: 'text-gold font-bold' },
  sole_believer: { emoji: '🎯', wrapper: 'bg-status-partial-bg border-status-partial/25', text: 'text-status-partial font-semibold' },
  against_crowd: { emoji: '🔮', wrapper: 'bg-violet-500/[0.08] border-violet-500/20',    text: 'text-violet-300 font-semibold' },
  sweep:         { emoji: '🎊', wrapper: 'bg-status-partial-bg border-status-partial/25', text: 'text-status-partial font-semibold' },
  nobody:        { emoji: '😬', wrapper: 'bg-surface-elevated border-border',             text: 'text-muted-foreground font-semibold' },
}

function HeadlineBanner({ headline }: { headline: Headline }) {
  const style = HEADLINE_STYLE[headline.type]
  return (
    <div className={cn('flex items-center gap-2.5 px-3 py-2.5 rounded-xl border mx-3', style.wrapper)}>
      <span className="text-base leading-none flex-shrink-0">{style.emoji}</span>
      <p className={cn('text-[13px] leading-snug', style.text)}>{headline.text}</p>
    </div>
  )
}

// ── Prediction row ────────────────────────────────────────────────────────────

function formatPrediction(p: LeagueActivityPrediction): string {
  if (p.predictedHome === null || p.predictedAway === null) return '—'
  return `${p.predictedHome}–${p.predictedAway}`
}

function PredictionRow({
  pred,
  streak,
}: {
  pred:   LeagueActivityPrediction
  streak: number
}) {
  const isExact   = pred.outcome === 'exact'
  const isCorrect = isCorrectOutcome(pred.outcome)
  const isWrong   = pred.outcome === 'wrong'

  return (
    <div className={cn(
      'flex items-center gap-2.5 px-3 py-2',
      isExact   ? 'bg-gold-muted/60'                : '',
      isCorrect && !isExact ? 'bg-card'             : '',
      pred.isCurrentUser ? 'ring-1 ring-primary/40' : '',
    )}>
      <span className={cn(
        'text-[13px] leading-none flex-shrink-0 w-4 text-center',
        isExact   ? 'text-gold'                 : '',
        isCorrect && !isExact ? 'text-status-partial' : '',
        isWrong   ? 'text-muted-foreground/40'  : '',
      )}>
        {isExact ? '⭐' : isCorrect ? '✓' : '·'}
      </span>

      <UserAvatar
        username={pred.username}
        avatarUrl={pred.avatarUrl ?? undefined}
        avatarId={pred.avatarId ?? undefined}
        size="xs"
      />

      <span className={cn(
        'flex-1 text-[13px] font-semibold truncate min-w-0',
        isWrong        ? 'text-muted-foreground' : 'text-foreground',
        pred.isCurrentUser ? 'text-foreground' : '',
      )}>
        {streak >= 3 && isCorrect && <span className="mr-1">🔥</span>}
        {pred.isCurrentUser ? 'You' : pred.username}
        {pred.isAutoPick && (
          <span className="ml-1 text-[10px] font-normal text-muted-foreground/50">auto</span>
        )}
      </span>

      <span className={cn(
        'text-[12px] tabular flex-shrink-0',
        isWrong ? 'text-muted-foreground/40' : 'text-muted-foreground',
      )}>
        {formatPrediction(pred)}
      </span>

      {pred.pointsEarned !== null && !isWrong && (
        <PointsBadge
          points={pred.pointsEarned}
          outcome={(pred.outcome ?? 'pending') as PredictionOutcome}
          className="flex-shrink-0 text-[11px] px-2 py-0.5"
        />
      )}
    </div>
  )
}

// ── Match card ────────────────────────────────────────────────────────────────

function MatchCard({
  match,
  streaks,
}: {
  match:   LeagueActivityMatch
  streaks: Map<string, number>
}) {
  const preds     = match.predictions
  const headline  = computeHeadline(match)
  const roundLabel = ROUND_LABELS[match.round] ?? match.round

  const correct = preds.filter(p => isCorrectOutcome(p.outcome))
  const wrong   = preds.filter(p => p.outcome === 'wrong')

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      {/* Match header */}
      <div className="px-3 py-3 border-b border-border/50 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {match.homeFlagUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={match.homeFlagUrl} alt={match.homeTeam} className="w-6 h-[15px] rounded-[3px] object-cover" />
            )}
            <span className="text-[15px] font-black tabular text-foreground">
              {match.homeScore}–{match.awayScore}
            </span>
            {match.awayFlagUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={match.awayFlagUrl} alt={match.awayTeam} className="w-6 h-[15px] rounded-[3px] object-cover" />
            )}
          </div>
          <span className="text-[12px] text-muted-foreground truncate">
            {match.homeTeam} vs {match.awayTeam}
          </span>
        </div>
        <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wide flex-shrink-0">
          {roundLabel}
        </span>
      </div>

      {/* Headline banner */}
      {headline && (
        <div className="py-2.5">
          <HeadlineBanner headline={headline} />
        </div>
      )}

      {/* Prediction rows */}
      <div className={cn('flex flex-col gap-0', !headline && 'pt-1')}>
        {correct.map(pred => (
          <PredictionRow key={pred.userId} pred={pred} streak={streaks.get(pred.userId) ?? 0} />
        ))}
        {wrong.map(pred => (
          <PredictionRow key={pred.userId} pred={pred} streak={streaks.get(pred.userId) ?? 0} />
        ))}
      </div>

      {/* Bottom padding */}
      <div className="h-2" />
    </div>
  )
}

// ── League Pulse bar ──────────────────────────────────────────────────────────

function PulseBar({ matches, streaks }: { matches: LeagueActivityMatch[]; streaks: Map<string, number> }) {
  let topStreakUserId = ''
  let topStreakCount  = 0
  let topStreakName   = ''
  for (const [uid, count] of streaks) {
    if (count > topStreakCount) { topStreakCount = count; topStreakUserId = uid }
  }
  if (topStreakCount >= 3 && topStreakUserId) {
    for (const match of matches) {
      const found = match.predictions.find(p => p.userId === topStreakUserId)
      if (found) { topStreakName = found.isCurrentUser ? 'You' : found.username; break }
    }
  }

  const exactCounts = new Map<string, { count: number; name: string }>()
  for (const match of matches) {
    for (const pred of match.predictions) {
      if (pred.outcome === 'exact') {
        const prev = exactCounts.get(pred.userId)
        const name = pred.isCurrentUser ? 'You' : pred.username
        exactCounts.set(pred.userId, { count: (prev?.count ?? 0) + 1, name })
      }
    }
  }
  let topExactName  = ''
  let topExactCount = 0
  for (const { count, name } of exactCounts.values()) {
    if (count > topExactCount) { topExactCount = count; topExactName = name }
  }

  const items: { emoji: string; text: string }[] = []
  if (topStreakCount >= 3 && topStreakName) {
    items.push({ emoji: '🔥', text: `${topStreakName} — ${topStreakCount} correct in a row` })
  }
  if (topExactCount >= 2 && topExactName) {
    items.push({ emoji: '⭐', text: `${topExactName} — ${topExactCount} exact scores` })
  }

  if (items.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5 px-3 py-3 rounded-2xl bg-surface-elevated border border-border">
      <p className="text-2xs font-black tracking-[0.12em] uppercase text-muted-foreground/60 mb-0.5">
        League Highlights
      </p>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-sm leading-none">{item.emoji}</span>
          <p className="text-[13px] text-foreground font-semibold">{item.text}</p>
        </div>
      ))}
    </div>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {/* Nav skeleton */}
      <div className="flex items-center gap-2">
        <div className="h-8 w-16 rounded-xl bg-muted animate-pulse" />
        <div className="flex-1 h-4 mx-4 rounded-full bg-muted animate-pulse" />
        <div className="h-8 w-16 rounded-xl bg-muted animate-pulse" />
      </div>
      {/* Card skeleton */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-3 py-3 border-b border-border/50 flex items-center gap-2">
          <div className="h-4 w-6 rounded-sm bg-surface-elevated animate-pulse" />
          <div className="h-4 w-8 rounded bg-surface-elevated animate-pulse" />
          <div className="h-4 w-6 rounded-sm bg-surface-elevated animate-pulse" />
          <div className="h-3 w-32 rounded-full bg-surface-elevated animate-pulse ml-1" />
        </div>
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-2.5 px-3 py-2">
            <div className="w-4 h-3 rounded-full bg-surface-elevated animate-pulse" />
            <div className="size-6 rounded-full bg-surface-elevated animate-pulse" />
            <div className="flex-1 h-3 rounded-full bg-surface-elevated animate-pulse" />
            <div className="h-3 w-8 rounded-full bg-surface-elevated animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function LeagueMatchBrowser({
  leagueId,
  currentUserId: _currentUserId,
}: {
  leagueId:       string
  currentUserId?: string
}) {
  const [matches,      setMatches]      = useState<LeagueActivityMatch[] | null>(null)
  const [error,        setError]        = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    apiFetch(`/api/leagues/${leagueId}/activity?limit=100`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: LeagueActivityMatch[]) => setMatches(data))
      .catch(() => setError(true))
  }, [leagueId])

  if (error) {
    return (
      <div className="bg-card rounded-xl border border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">Could not load picks. Please try again.</p>
      </div>
    )
  }

  if (matches === null) return <LoadingSkeleton />

  if (matches.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-6 text-center">
        <p className="text-sm font-semibold text-foreground mb-1">Nothing to show yet</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          The first finished match with league predictions will appear here.
        </p>
      </div>
    )
  }

  const streaks   = computeCurrentStreaks(matches)
  const total     = matches.length
  const match     = matches[currentIndex]
  // matches[0] = most recent; higher index = older
  const canOlder  = currentIndex < total - 1
  const canNewer  = currentIndex > 0

  return (
    <div className="flex flex-col gap-4">
      <PulseBar matches={matches} streaks={streaks} />

      {/* Navigation bar */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setCurrentIndex(i => i + 1)}
          disabled={!canOlder}
          aria-label="Older match"
          className={cn(
            'flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold transition-colors select-none',
            canOlder
              ? 'text-foreground bg-surface-elevated hover:bg-accent active:scale-95'
              : 'text-muted-foreground/25 cursor-not-allowed',
          )}
        >
          <ChevronLeft className="size-3.5 flex-shrink-0" />
          Older
        </button>

        <span className="flex-1 text-center text-[11px] font-semibold text-muted-foreground tabular-nums select-none">
          Match {currentIndex + 1} of {total}
        </span>

        <button
          onClick={() => setCurrentIndex(i => i - 1)}
          disabled={!canNewer}
          aria-label="Newer match"
          className={cn(
            'flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold transition-colors select-none',
            canNewer
              ? 'text-foreground bg-surface-elevated hover:bg-accent active:scale-95'
              : 'text-muted-foreground/25 cursor-not-allowed',
          )}
        >
          Newer
          <ChevronRight className="size-3.5 flex-shrink-0" />
        </button>
      </div>

      {/* Single match card */}
      <MatchCard key={currentIndex} match={match} streaks={streaks} />
    </div>
  )
}
