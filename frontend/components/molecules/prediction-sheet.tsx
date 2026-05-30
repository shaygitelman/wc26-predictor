'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { X, Check, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ROUND_POINTS } from '@/lib/constants'
import { TeamFlag } from '@/components/atoms/team-flag'
import type { Match } from '@/types/match'
import type { Prediction } from '@/types/prediction'
import { trackPredictionSubmitted } from '@/lib/analytics'
import { apiFetch } from '@/lib/api-client'

interface PredictionSheetProps {
  match: Match
  existingHome?: number
  existingAway?: number
  onSaved?: (prediction: Prediction) => void
  trigger?: React.ReactNode   // custom trigger — falls back to full-width primary button
}

type SheetStatus = 'idle' | 'saving' | 'saved' | 'error'

export function PredictionSheet({
  match,
  existingHome,
  existingAway,
  onSaved,
  trigger,
}: PredictionSheetProps) {
  const hasExisting = existingHome !== undefined
  const router = useRouter()

  const [isOpen,    setIsOpen]    = useState(false)
  const [homeScore, setHomeScore] = useState(existingHome ?? 1)
  const [awayScore, setAwayScore] = useState(existingAway ?? 0)
  const [status,    setStatus]    = useState<SheetStatus>('idle')
  const [errorMsg,  setErrorMsg]  = useState('')
  const submittingRef = useRef(false)

  const canPredict = match.status === 'scheduled'

  const open  = () => { if (canPredict) setIsOpen(true) }
  const close = () => { if (status !== 'saving') { setIsOpen(false); setStatus('idle') } }

  const confirm = async () => {
    if (submittingRef.current) return   // synchronous double-submit guard
    submittingRef.current = true
    setStatus('saving')
    setErrorMsg('')
    try {
      const res = await apiFetch(`/api/predictions/${match.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ predictedHome: homeScore, predictedAway: awayScore }),
      })
      if (!res.ok) throw new Error(await res.text())
      const prediction: Prediction = await res.json()
      trackPredictionSubmitted({
        matchId:   match.id,
        round:     match.round,
        isNew:     !hasExisting,
        homeScore,
        awayScore,
      })
      onSaved?.(prediction)
      router.refresh()
      setStatus('saved')
      setTimeout(() => { setIsOpen(false); setStatus('idle') }, 900)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save. Try again.')
      setStatus('error')
    } finally {
      submittingRef.current = false
    }
  }

  if (!canPredict) return null

  return (
    <>
      {/* ── Trigger ───────────────────────────────────────── */}
      {trigger ? (
        <div role="button" tabIndex={0} onClick={open} onKeyDown={e => e.key === 'Enter' && open()}>
          {trigger}
        </div>
      ) : (
        <button
          onClick={open}
          className={cn(
            'w-full flex items-center justify-center gap-2 rounded-xl py-4',
            'text-[15px] font-bold transition-all duration-150',
            'bg-gold text-background',
            'hover:opacity-90 active:scale-[0.98]',
          )}
        >
          {hasExisting ? (
            <>
              <Lock className="size-4" strokeWidth={2.5} />
              Edit Prediction
            </>
          ) : (
            'Make Prediction →'
          )}
        </button>
      )}

      {/* ── Backdrop ──────────────────────────────────────── */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-[55] animate-fade-in"
          onClick={close}
        />
      )}

      {/* ── Sheet ─────────────────────────────────────────── */}
      <div
        className={cn(
          'fixed left-0 right-0 bottom-0 z-[60]',
          'bg-card border-t border-border rounded-t-[28px]',
          'pb-safe transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
          isOpen ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full bg-border" />
        </div>

        {/* Close button */}
        <button
          onClick={close}
          className="absolute top-4 right-4 size-8 flex items-center justify-center rounded-full bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="size-4" />
        </button>

        <div className="px-6 pt-3 pb-2">
          <p className="text-center text-2xs font-bold tracking-[0.12em] uppercase text-muted-foreground">
            Your Prediction
          </p>
        </div>

        {/* ── Score steppers ──────────────────────────────── */}
        <div className="flex items-center justify-between gap-2 px-6 py-6">
          {/* Home team */}
          <div className="flex flex-col items-center gap-2 flex-1">
            <TeamFlag team={match.homeTeam} size="xl" showCode />
          </div>

          {/* Steppers */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <ScoreStepper value={homeScore} onChange={setHomeScore} />
            <span className="text-2xl font-light text-muted-foreground w-4 text-center">:</span>
            <ScoreStepper value={awayScore} onChange={setAwayScore} />
          </div>

          {/* Away team */}
          <div className="flex flex-col items-center gap-2 flex-1">
            <TeamFlag team={match.awayTeam} size="xl" showCode />
          </div>
        </div>

        {/* ── Confirm button ──────────────────────────────── */}
        <div className="px-6 pb-3">
          <button
            onClick={confirm}
            disabled={status === 'saving' || status === 'saved'}
            className={cn(
              'w-full flex items-center justify-center gap-2 rounded-xl py-4',
              'text-[15px] font-bold transition-all duration-200',
              status === 'saved'
                ? 'bg-status-won text-white'
                : status === 'error'
                ? 'bg-status-lost/20 text-status-lost border border-status-lost/30'
                : 'bg-gold text-background hover:opacity-90 active:scale-[0.98]',
              status === 'saving' && 'opacity-70 cursor-wait',
            )}
          >
            {status === 'saved' ? (
              <><Check className="size-4" strokeWidth={3} /> Prediction Saved!</>
            ) : status === 'saving' ? (
              'Saving…'
            ) : status === 'error' ? (
              'Retry'
            ) : (
              `Confirm ${homeScore} – ${awayScore}`
            )}
          </button>
          {status === 'error' && errorMsg && (
            <p className="text-center text-2xs text-status-lost mt-1.5">{errorMsg}</p>
          )}
          <p className="text-center text-2xs text-muted-foreground mt-2.5">
            Locks 5 min before kickoff · Cannot be changed after
          </p>
        </div>

        {/* ── Scoring guide ───────────────────────────────── */}
        {(() => {
          const pts = ROUND_POINTS[match.round] ?? ROUND_POINTS.group
          return (
            <div className="flex justify-around border-t border-border mx-6 pt-4 pb-6">
              <ScoringRule pts={pts.exact}     label="Exact score" />
              <ScoringRule pts={pts.direction} label="Correct outcome" />
              <ScoringRule pts={0}             label="Wrong" />
            </div>
          )
        })()}
      </div>
    </>
  )
}

// ─── Score stepper ───────────────────────────────────────────
function ScoreStepper({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={() => onChange(value + 1)}
        className={cn(
          'size-11 rounded-full bg-surface-elevated',
          'flex items-center justify-center',
          'text-xl font-bold text-foreground',
          'hover:bg-surface-overlay active:scale-90',
          'transition-all duration-100',
        )}
      >
        +
      </button>
      <span className="text-5xl font-black tabular text-foreground w-14 text-center leading-none">
        {value}
      </span>
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        className={cn(
          'size-11 rounded-full bg-surface-elevated',
          'flex items-center justify-center',
          'text-xl font-bold text-foreground',
          'hover:bg-surface-overlay active:scale-90',
          'transition-all duration-100',
        )}
      >
        −
      </button>
    </div>
  )
}

// ─── Scoring rule ────────────────────────────────────────────
function ScoringRule({ pts, label }: { pts: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-base font-black text-primary tabular">{pts}</span>
      <span className="text-2xs text-muted-foreground font-medium text-center">{label}</span>
    </div>
  )
}
