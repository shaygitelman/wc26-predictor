'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Sparkles, WifiOff, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FormBubble } from '@/components/atoms/form-bubble'
import type { MatchInsights, ConfidenceLevel } from '@/types/insights'

// ─── Props ───────────────────────────────────────────────────────

interface TeamProp {
  name:     string
  shortCode: string
  flagUrl?:  string
}

interface Props {
  matchId:      string
  homeTeam:     TeamProp
  awayTeam:     TeamProp
  initialData?: MatchInsights | null
}

// ─── Confidence config ────────────────────────────────────────────

const CONFIDENCE_CONFIG: Record<ConfidenceLevel, { cls: string; label: string }> = {
  high:   { cls: 'bg-status-won/15 text-status-won border-status-won/25',     label: 'High Confidence'   },
  medium: { cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25',        label: 'Medium Confidence' },
  low:    { cls: 'bg-muted-foreground/10 text-muted-foreground border-border', label: 'Low Confidence'    },
}

// ─── Sub-components ───────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] font-black tracking-[0.14em] uppercase text-muted-foreground/50 mb-2">
      {children}
    </p>
  )
}

function Divider() {
  return <div className="border-t border-border/30" />
}

function FlagImg({ flagUrl, name, shortCode }: { flagUrl?: string; name: string; shortCode: string }) {
  if (flagUrl) {
    const hqUrl = flagUrl.includes('flagcdn.com')
      ? flagUrl.replace(/\/w\d+\//, '/w80/')
      : flagUrl
    return (
      <Image
        src={hqUrl}
        alt={name}
        width={24}
        height={16}
        className="rounded-[2px] object-cover shrink-0"
        style={{ width: 24, height: 16 }}
      />
    )
  }
  return (
    <span className="inline-flex items-center justify-center rounded-[2px] bg-surface-elevated text-[8px] font-bold text-muted-foreground shrink-0" style={{ width: 24, height: 16 }}>
      {shortCode}
    </span>
  )
}

// ─── Skeleton ────────────────────────────────────────────────────

function InsightsSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border shadow-card animate-pulse">
      <div className="h-0.5 bg-gold/30" />
      <div className="bg-card p-4 space-y-4">
        {/* header */}
        <div className="flex items-center justify-between">
          <div className="h-3 w-32 rounded bg-muted-foreground/10" />
          <div className="flex gap-1">
            {[...Array(5)].map((_, i) => <div key={i} className="size-5 rounded-full bg-muted-foreground/10" />)}
          </div>
        </div>
        {/* story block */}
        <div className="space-y-1.5">
          <div className="h-2 w-16 rounded bg-muted-foreground/10" />
          <div className="h-3 w-full rounded bg-muted-foreground/10" />
          <div className="h-3 w-4/5 rounded bg-muted-foreground/10" />
          <div className="h-3 w-3/5 rounded bg-muted-foreground/10" />
        </div>
        <div className="border-t border-border/30" />
        {/* edge block */}
        <div className="space-y-1.5">
          <div className="h-2 w-14 rounded bg-muted-foreground/10" />
          <div className="flex items-center gap-2">
            <div className="w-6 h-4 rounded-sm bg-muted-foreground/10 shrink-0" />
            <div className="h-4 w-24 rounded bg-muted-foreground/10" />
            <div className="h-4 w-28 rounded-full bg-muted-foreground/10 ml-1" />
          </div>
          <div className="h-3 w-full rounded bg-muted-foreground/10" />
          <div className="h-3 w-3/4 rounded bg-muted-foreground/10" />
        </div>
        <div className="border-t border-border/30" />
        {/* factors block */}
        <div className="space-y-1.5">
          <div className="h-2 w-40 rounded bg-muted-foreground/10" />
          {[...Array(3)].map((_, i) => <div key={i} className="h-3 w-11/12 rounded bg-muted-foreground/10" />)}
        </div>
        <div className="border-t border-border/30" />
        {/* prediction block */}
        <div className="space-y-2">
          <div className="h-2 w-24 rounded bg-muted-foreground/10" />
          <div className="flex items-center justify-between">
            <div className="h-8 w-12 rounded bg-muted-foreground/10" />
            <div className="h-4 w-8 rounded bg-muted-foreground/10" />
            <div className="h-8 w-12 rounded bg-muted-foreground/10" />
          </div>
          {[...Array(2)].map((_, i) => <div key={i} className="h-3 w-full rounded bg-muted-foreground/10" />)}
        </div>
      </div>
    </div>
  )
}

// ─── Error card ───────────────────────────────────────────────────

function InsightsErrorCard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border shadow-card">
      <div className="h-0.5 bg-muted-foreground/30" />
      <div className="bg-card px-4 py-5 flex items-center gap-3">
        <WifiOff className="size-4 text-muted-foreground/40 shrink-0" />
        <p className="text-[13px] text-muted-foreground/60">
          AI insights couldn't be loaded — refresh to try again.
        </p>
      </div>
    </div>
  )
}

// ─── Pending card (TBD teams) ─────────────────────────────────────

function InsightsPendingCard({ homeTeam, awayTeam }: { homeTeam: TeamProp; awayTeam: TeamProp }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border shadow-card">
      <div className="h-0.5 bg-gold/30" />
      <div className="bg-card px-4 py-5 flex items-start gap-3">
        <Clock className="size-4 text-gold/60 shrink-0 mt-[2px]" />
        <div>
          <p className="text-[12px] font-bold text-foreground/70 mb-0.5">AI Insights Pending</p>
          <p className="text-[13px] text-muted-foreground/60">
            Match analysis will be available once {homeTeam.name === 'TBD' ? 'both teams' : homeTeam.name} and {awayTeam.name === 'TBD' ? 'the opponent are' : `${awayTeam.name} are`} confirmed.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Main content ─────────────────────────────────────────────────

function InsightsContent({ insights, homeTeam, awayTeam }: {
  insights: MatchInsights
  homeTeam: TeamProp
  awayTeam: TeamProp
}) {
  const { story, keyEdge, decidingFactors, prediction, form } = insights
  const edgeTeam = keyEdge.side === 'home' ? homeTeam : awayTeam
  const confCfg  = CONFIDENCE_CONFIG[prediction.confidence] ?? CONFIDENCE_CONFIG.low

  const homeFormDisplay = form.home.slice(-5)
  const awayFormDisplay = form.away.slice(-5)
  const hasForm = homeFormDisplay.length > 0 || awayFormDisplay.length > 0

  return (
    <div className="overflow-hidden rounded-2xl border border-border shadow-card">
      {/* Gold accent stripe */}
      <div className="h-0.5 bg-gradient-to-r from-gold via-gold/40 to-transparent" />

      <div className="bg-card px-4 pt-3 pb-4 space-y-3.5">

        {/* ── Header ─────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles className="size-3 text-gold shrink-0" />
            <span className="text-[9px] font-black tracking-[0.14em] uppercase text-gold/80 whitespace-nowrap">
              AI Match Insights
            </span>
          </div>
          {hasForm && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-[3px]">
                {homeFormDisplay.map((r, i) => <FormBubble key={i} result={r} size="sm" />)}
              </div>
              <span className="text-[9px] text-muted-foreground/30 font-bold">vs</span>
              <div className="flex items-center gap-[3px]">
                {awayFormDisplay.map((r, i) => <FormBubble key={i} result={r} size="sm" />)}
              </div>
            </div>
          )}
        </div>

        <Divider />

        {/* ── Section 1: Match Story ──────────────────────────────── */}
        <section>
          <SectionLabel>Match Story</SectionLabel>
          <p className="text-[13.5px] leading-[1.55] text-foreground/85">{story}</p>
        </section>

        <Divider />

        {/* ── Section 2: Key Edge ─────────────────────────────────── */}
        <section>
          <SectionLabel>Key Edge</SectionLabel>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <FlagImg flagUrl={edgeTeam.flagUrl} name={keyEdge.teamName} shortCode={keyEdge.teamCode} />
            <span className="text-[14px] font-bold text-foreground">{keyEdge.teamName}</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gold/15 text-gold border border-gold/25 whitespace-nowrap">
              {keyEdge.label}
            </span>
          </div>
          <p className="text-[13px] leading-[1.5] text-foreground/75">{keyEdge.explanation}</p>
        </section>

        <Divider />

        {/* ── Section 3: Deciding Factors ─────────────────────────── */}
        <section>
          <SectionLabel>What Could Decide This Match?</SectionLabel>
          <ul className="space-y-1.5">
            {decidingFactors.map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-gold mt-[5px] leading-none text-[5px]">●</span>
                <span className="text-[13px] leading-[1.45] text-foreground/80">{f}</span>
              </li>
            ))}
          </ul>
        </section>

        <Divider />

        {/* ── Section 4: AI Prediction ─────────────────────────────── */}
        <section>
          <SectionLabel>AI Prediction</SectionLabel>

          {/* Score row */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex-1 min-w-0 text-center">
              <p className="text-[10px] text-muted-foreground/50 mb-0.5 truncate px-1">{prediction.homeTeamName}</p>
              <p className="text-[30px] font-black text-foreground leading-none">{prediction.homeScore}</p>
            </div>
            <div className="px-2">
              <p className="text-[16px] font-black text-foreground/25 leading-none">—</p>
            </div>
            <div className="flex-1 min-w-0 text-center">
              <p className="text-[10px] text-muted-foreground/50 mb-0.5 truncate px-1">{prediction.awayTeamName}</p>
              <p className="text-[30px] font-black text-foreground leading-none">{prediction.awayScore}</p>
            </div>
          </div>

          {/* Confidence badge */}
          <div className="flex justify-center mb-2.5">
            <span className={cn('px-2.5 py-0.5 rounded-full text-[9px] font-bold border', confCfg.cls)}>
              {confCfg.label}
            </span>
          </div>

          {/* Reasoning */}
          <ul className="space-y-1.5">
            {prediction.reasoning.map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-gold mt-[5px] leading-none text-[5px]">●</span>
                <span className="text-[13px] leading-[1.45] text-foreground/80">{r}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Footer */}
        <p className="text-[9px] text-muted-foreground/30 text-center pt-0.5">
          Generated by Groq AI · Updates as match data becomes available
        </p>

      </div>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────

export function MatchInsightsCard({ matchId, homeTeam, awayTeam, initialData }: Props) {
  const [insights, setInsights] = useState<MatchInsights | null>(initialData ?? null)
  const [status,   setStatus]   = useState<'loading' | 'ready' | 'error'>(initialData ? 'ready' : 'loading')

  const skipInitialFetch = useRef(!!initialData)

  useEffect(() => {
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false
      return
    }

    const ctrl  = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 12000)

    fetch(`/api/matches/${matchId}/insights`, { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: MatchInsights) => { setInsights(d); setStatus('ready') })
      .catch(() => setStatus('error'))
      .finally(() => clearTimeout(timer))

    return () => { ctrl.abort(); clearTimeout(timer) }
  }, [matchId])

  if (status === 'error')                return <InsightsErrorCard />
  if (status === 'loading' || !insights) return <InsightsSkeleton />
  if (insights.insufficientData)         return <InsightsPendingCard homeTeam={homeTeam} awayTeam={awayTeam} />

  return <InsightsContent insights={insights} homeTeam={homeTeam} awayTeam={awayTeam} />
}
