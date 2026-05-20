'use client'

import { useState, useEffect } from 'react'
import {
  Sparkles, Zap, TriangleAlert, Flame, BookOpen,
  Wind, ArrowRightLeft, Shield, Crosshair, Swords, Target,
  ChevronRight, ArrowUp, LayoutGrid, Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { FormBubble } from '@/components/atoms/form-bubble'
import type {
  MatchInsights, InsightBullet, ConfidenceLevel, FormResult,
  TacticalInsight, TacticalCategory, NarrativeInsight,
  MatchPersonality, SectionKey, InsightDataPoint,
} from '@/types/insights'

// ─── Props ───────────────────────────────────────────────────

interface Props {
  matchId:  string
  homeTeam: { name: string; shortCode: string }
  awayTeam: { name: string; shortCode: string }
}

// ─── Personality config ───────────────────────────────────────

const PERSONALITY_BADGE: Record<MatchPersonality, { cls: string }> = {
  'explosive':       { cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  'tactical-battle': { cls: 'bg-primary/10 text-primary border-primary/20' },
  'defensive-grind': { cls: 'bg-muted-foreground/15 text-muted-foreground border-muted-foreground/25' },
  'upset-alert':     { cls: 'bg-status-lost/10 text-status-lost border-status-lost/20' },
  'star-power':      { cls: 'bg-gold-muted text-gold border-gold-border' },
  'balanced':        { cls: 'bg-status-won/10 text-status-won border-status-won/20' },
}

const PERSONALITY_STRIPE: Record<MatchPersonality, string> = {
  'explosive':       'bg-gradient-to-r from-amber-500 via-amber-500/40 to-transparent',
  'tactical-battle': 'bg-gradient-to-r from-primary via-primary/40 to-transparent',
  'defensive-grind': 'bg-gradient-to-r from-muted-foreground/80 via-muted-foreground/30 to-transparent',
  'upset-alert':     'bg-gradient-to-r from-status-lost via-status-lost/40 to-transparent',
  'star-power':      'bg-gradient-to-r from-gold via-gold/40 to-transparent',
  'balanced':        'bg-gradient-to-r from-status-won via-status-won/40 to-transparent',
}

// ─── Tactical category config ─────────────────────────────────

const CATEGORY_LABEL: Record<TacticalCategory, string> = {
  'transition':       'Transition',
  'pressing':         'Pressing',
  'possession':       'Possession',
  'wide-threats':     'Wide Play',
  'set-pieces':       'Set Pieces',
  'defensive-shape':  'Defensive Shape',
  'midfield-control': 'Midfield',
  'counterattack':    'Counterattack',
  'finishing':        'Finishing',
  'high-line':        'High Line',
  'key-duel':         'Key Duel',
}

const CATEGORY_DOT: Record<TacticalCategory, string> = {
  'transition':       'bg-amber-500',
  'pressing':         'bg-primary',
  'possession':       'bg-primary/60',
  'wide-threats':     'bg-status-won/80',
  'set-pieces':       'bg-gold',
  'defensive-shape':  'bg-muted-foreground/60',
  'midfield-control': 'bg-primary/80',
  'counterattack':    'bg-status-partial',
  'finishing':        'bg-status-won',
  'high-line':        'bg-status-lost',
  'key-duel':         'bg-gold',
}

function CategoryIcon({ category }: { category: TacticalCategory }) {
  const cls = 'size-3 flex-shrink-0'
  switch (category) {
    case 'transition':       return <ArrowRightLeft className={cls} strokeWidth={2} />
    case 'pressing':         return <Wind className={cls} strokeWidth={2} />
    case 'possession':       return <LayoutGrid className={cls} strokeWidth={2} />
    case 'wide-threats':     return <ChevronRight className={cls} strokeWidth={2.5} />
    case 'set-pieces':       return <Crosshair className={cls} strokeWidth={2} />
    case 'defensive-shape':  return <Shield className={cls} strokeWidth={2} />
    case 'midfield-control': return <Swords className={cls} strokeWidth={1.75} />
    case 'counterattack':    return <Zap className={cls} strokeWidth={2.5} />
    case 'finishing':        return <Target className={cls} strokeWidth={2} />
    case 'high-line':        return <ArrowUp className={cls} strokeWidth={2.5} />
    case 'key-duel':         return <Swords className={cls} strokeWidth={1.75} />
    default:                 return <div className={cn('size-[5px] rounded-full', CATEGORY_DOT[category])} />
  }
}

// ─── Evidence pill mapping ────────────────────────────────────

const SOURCE_LABEL_MAP: Record<string, string> = {
  'avgGoalsScored':      'Avg goals scored',
  'avgGoalsConceded':    'Avg goals conceded',
  'cleanSheets':         'Clean sheets',
  'avgPossession':       'Possession %',
  'avgCorners':          'Corners / match',
  'scoredInMatches':     'Scoring run',
  'unavailablePlayers':  'Squad availability',
  'topScorer.goals':     'Tournament goals',
  'topAssister.assists': 'Tournament assists',
  'record':              'H2H record',
  'lastMeeting':         'Last meeting',
}

function parseSourcePills(source: string): string[] {
  const seen = new Set<string>()
  return source
    .split(',')
    .map(s => {
      const key = s.trim().replace(/^(home|away|h2h)\./, '')
      return SOURCE_LABEL_MAP[key] ?? null
    })
    .filter((v): v is string => v !== null && !seen.has(v) && (seen.add(v), true))
}

// ─── Safe fallback constants ─────────────────────────────────

const DEFAULT_SECTION_ORDER: SectionKey[] = [
  'form', 'tactical', 'key-players', 'head-to-head', 'coaching-hint',
]

const VALID_PERSONALITIES = new Set<string>([
  'explosive', 'tactical-battle', 'defensive-grind', 'upset-alert', 'star-power', 'balanced',
])

const VALID_CONFIDENCES = new Set<string>(['low', 'medium', 'high'])

const FALLBACK_EDGE: MatchInsights['edge'] = {
  team: 'draw', teamName: 'Either Side', strength: 'slight',
}

// ─── Main component ──────────────────────────────────────────

export function MatchInsightsCard({ matchId, homeTeam, awayTeam }: Props) {
  const [insights, setInsights] = useState<MatchInsights | null>(null)
  const [status,   setStatus]   = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    const ctrl  = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 12000)

    fetch(`/api/matches/${matchId}/insights`, { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: MatchInsights) => { setInsights(d); setStatus('ready') })
      .catch(() => setStatus('error'))
      .finally(() => clearTimeout(timer))

    return () => { ctrl.abort(); clearTimeout(timer) }
  }, [matchId])

  if (status === 'error') return null
  if (status === 'loading' || !insights) return <InsightsSkeleton />
  if (insights.insufficientData) return <InsightsPendingCard homeTeam={homeTeam} awayTeam={awayTeam} />

  // ── Defensive normalization ────────────────────────────────
  const {
    form, tactical, narrative, coachingHint, keyPlayers, headToHead,
    edge, confidence, upsetAlert, personality, personalityLabel,
    volatility, sectionOrder, generatedAt, formSampleSize,
  } = insights

  const missingFields = [
    !sectionOrder && 'sectionOrder',
    !personality  && 'personality',
    !tactical     && 'tactical',
  ].filter(Boolean)

  if (missingFields.length > 0) {
    console.warn(
      `[MatchInsightsCard] Payload for match "${matchId}" is missing fields: ${missingFields.join(', ')}. ` +
      'This is likely a stale cached response. Rendering with safe fallbacks.',
    )
  }

  const safePersonality: MatchPersonality =
    VALID_PERSONALITIES.has(personality as string)
      ? (personality as MatchPersonality)
      : 'balanced'

  const safePersonalityLabel = personalityLabel ?? 'Analysis'

  const safeVolatility =
    typeof volatility === 'number' && Number.isFinite(volatility) ? volatility : 0

  const safeConfidence: ConfidenceLevel =
    VALID_CONFIDENCES.has(confidence as string)
      ? (confidence as ConfidenceLevel)
      : 'medium'

  const safeForm = { home: form?.home ?? [], away: form?.away ?? [] }

  const safeTactical: TacticalInsight[]  = Array.isArray(tactical)    ? tactical    : []
  const safeKeyPlayers: InsightBullet[]  = Array.isArray(keyPlayers)  ? keyPlayers  : []
  const safeHeadToHead: InsightBullet[]  = Array.isArray(headToHead)  ? headToHead  : []

  const safeEdge       = edge       ?? FALLBACK_EDGE
  const safeUpsetAlert = upsetAlert ?? false
  const safeEdgeNote   = insights.edgeNote ?? ''

  const safeSectionOrder: SectionKey[] =
    Array.isArray(sectionOrder) && sectionOrder.length > 0
      ? sectionOrder
      : DEFAULT_SECTION_ORDER

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden animate-fade-in shadow-card">
      {/* Personality-tinted accent stripe */}
      <div className={cn('h-[2px]', PERSONALITY_STRIPE[safePersonality])} />

      <div className="divide-y divide-border/50">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="size-[14px] text-primary flex-shrink-0" strokeWidth={1.75} />
            <span className="text-[13px] font-bold text-foreground tracking-[-0.01em] flex-shrink-0">
              AI Match Insights
            </span>
            <PersonalityBadge personality={safePersonality} label={safePersonalityLabel} />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            {generatedAt && <DataFreshness generatedAt={generatedAt} />}
            {safeVolatility >= 7 && <VolatilityTag score={safeVolatility} />}
            <ConfidenceChip confidence={safeConfidence} />
          </div>
        </div>

        {/* ── Sparse data notice ── */}
        {safeConfidence === 'low' && (
          <div className="mx-4 my-1 px-3 py-2 rounded-lg bg-amber-500/[0.07] border border-amber-500/20 flex items-start gap-2">
            <TriangleAlert className="size-3 text-amber-500/70 flex-shrink-0 mt-[2px]" strokeWidth={2} />
            <p className="text-[10.5px] text-amber-500/70 leading-snug">
              Limited match data — insights reflect a smaller sample and confidence will increase as more matches are played.
            </p>
          </div>
        )}

        {/* ── Dynamic sections ── */}
        {safeSectionOrder.map(key => {
          switch (key) {
            case 'form':
              return (safeForm.home.length > 0 || safeForm.away.length > 0) ? (
                <section key="form" className="px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <SectionLabel>Recent Form</SectionLabel>
                    {formSampleSize && (
                      <span className="text-[9px] font-semibold text-muted-foreground/45 tracking-[0.04em]">
                        Last {Math.max(formSampleSize.home, formSampleSize.away)} matches
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <FormRow code={homeTeam.shortCode} form={safeForm.home} />
                    <FormRow code={awayTeam.shortCode} form={safeForm.away} />
                  </div>
                </section>
              ) : null

            case 'tactical':
              return safeTactical.length > 0 ? (
                <section key="tactical" className="px-4 py-3">
                  <SectionLabel>Tactical Intelligence</SectionLabel>
                  <TacticalSection insights={safeTactical} />
                </section>
              ) : null

            case 'narrative':
              return narrative?.headline && narrative?.body ? (
                <section key="narrative" className="px-4 py-3">
                  <NarrativeCallout narrative={narrative} />
                </section>
              ) : null

            case 'key-players':
              return safeKeyPlayers.length > 0 ? (
                <section key="key-players" className="px-4 py-3">
                  <SectionLabel>Players to Watch</SectionLabel>
                  <BulletList bullets={safeKeyPlayers} />
                </section>
              ) : null

            case 'head-to-head':
              return safeHeadToHead.length > 0 ? (
                <section key="head-to-head" className="px-4 py-3">
                  <SectionLabel>Head to Head</SectionLabel>
                  <BulletList bullets={safeHeadToHead} />
                </section>
              ) : null

            case 'coaching-hint':
              return coachingHint ? (
                <section key="coaching-hint" className="px-4 py-3">
                  <CoachingHint text={coachingHint} />
                </section>
              ) : null

            default:
              return null
          }
        })}

        {/* ── AI Edge — always at bottom ── */}
        <section className="px-4 py-3.5">
          <EdgeBanner edge={safeEdge} edgeNote={safeEdgeNote} />
          {safeUpsetAlert && (
            <div className="flex items-center justify-center gap-1.5 mt-2.5">
              <TriangleAlert className="size-3 text-amber-500 flex-shrink-0" strokeWidth={2} />
              <span className="text-[11px] font-semibold text-amber-500">
                Potential upset candidate
              </span>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold tracking-[0.13em] uppercase text-muted-foreground">
      {children}
    </p>
  )
}

function PersonalityBadge({ personality, label }: { personality: MatchPersonality; label: string }) {
  const { cls } = PERSONALITY_BADGE[personality]
  return (
    <span className={cn(
      'text-[9px] font-black tracking-[0.08em] uppercase px-1.5 py-[2px] rounded border flex-shrink-0',
      cls,
    )}>
      {label}
    </span>
  )
}

function VolatilityTag({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-0.5" title={`Volatility: ${score.toFixed(1)}/10`}>
      <Flame className="size-[11px] text-amber-500" strokeWidth={2} />
      <span className="text-[9px] font-bold text-amber-500">{Math.round(score)}</span>
    </div>
  )
}

function DataFreshness({ generatedAt }: { generatedAt: string }) {
  const [label, setLabel] = useState<string>('')

  useEffect(() => {
    function update() {
      const diff = Math.floor((Date.now() - new Date(generatedAt).getTime()) / 1000)
      if (diff < 60)        setLabel('just now')
      else if (diff < 3600) setLabel(`${Math.floor(diff / 60)}m ago`)
      else                  setLabel(`${Math.floor(diff / 3600)}h ago`)
    }
    update()
    const id = setInterval(update, 30_000)
    return () => clearInterval(id)
  }, [generatedAt])

  if (!label) return null
  return (
    <div className="flex items-center gap-1">
      <span className="size-[5px] rounded-full bg-status-won/60 animate-pulse flex-shrink-0" />
      <span className="text-[9.5px] font-medium text-muted-foreground/50">{label}</span>
    </div>
  )
}

function FormRow({ code, form }: { code: string; form: FormResult[] }) {
  const safe = Array.isArray(form) ? form : []
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-9 text-[11px] font-black uppercase tracking-wider text-muted-foreground flex-shrink-0 text-right">
        {code}
      </span>
      <div className="flex items-center gap-1.5">
        {safe.map((r, i) => <FormBubble key={i} result={r} />)}
      </div>
    </div>
  )
}

// ── Stat comparison strip shown above the AI insight text ──

function StatComparisonRow({ dataPoints }: { dataPoints: InsightDataPoint[] }) {
  const safe = dataPoints.slice(0, 2)
  if (safe.length === 0) return null

  if (safe.length === 1) {
    return (
      <div className="flex items-center gap-2 mb-2 px-2.5 py-1.5 rounded-lg bg-surface-elevated/60 border border-border/30">
        <span className="text-[10px] font-black tracking-[0.07em] uppercase text-muted-foreground/50 flex-shrink-0">
          {safe[0].teamName}
        </span>
        <span className="text-[11px] font-bold text-foreground/65">{safe[0].value}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between mb-2 px-2.5 py-1.5 rounded-lg bg-surface-elevated/60 border border-border/30 gap-3">
      {safe.map((dp, i) => (
        <div key={i} className={cn('flex items-baseline gap-1.5 min-w-0', i === 1 && 'text-right flex-row-reverse')}>
          <span className="text-[10px] font-black tracking-[0.05em] uppercase text-muted-foreground/45 flex-shrink-0 truncate max-w-[70px]">
            {dp.teamName}
          </span>
          <span className="text-[11px] font-bold text-foreground/70 flex-shrink-0">{dp.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Evidence pills — surface which data fields drove this insight ──

function EvidencePills({ source }: { source: string }) {
  const pills = parseSourcePills(source)
  if (pills.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {pills.map((pill, i) => (
        <span
          key={i}
          className="text-[9px] font-semibold tracking-[0.03em] px-1.5 py-[2px] rounded bg-muted/30 text-muted-foreground/55 border border-border/40"
        >
          {pill}
        </span>
      ))}
    </div>
  )
}

function TacticalSection({ insights }: { insights: TacticalInsight[] }) {
  const safe = Array.isArray(insights) ? insights : []
  if (safe.length === 0) return null
  return (
    <div className="flex flex-col gap-4 mt-1.5">
      {safe.map((t, i) => (
        <div key={i} className="flex items-start gap-2.5">
          {/* Category icon */}
          <div className={cn(
            'flex-shrink-0 mt-[3px] flex items-center justify-center size-[18px] rounded-md',
            'bg-surface-elevated',
          )}>
            <div className={cn('text-muted-foreground/70', categoryIconColor(t.category))}>
              <CategoryIcon category={t.category} />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            {/* Category label */}
            <span className="text-[9.5px] font-black tracking-[0.11em] uppercase text-muted-foreground/55 block mb-1.5">
              {CATEGORY_LABEL[t.category]}
            </span>

            {/* Stat comparison */}
            {t.dataPoints && t.dataPoints.length > 0 && (
              <StatComparisonRow dataPoints={t.dataPoints} />
            )}

            {/* AI insight text */}
            <span className={cn(
              'text-[12.5px] leading-snug block',
              t.highlight === 'warning'  ? 'text-amber-400/90'
              : t.highlight === 'positive' ? 'text-foreground/90'
              : t.highlight === 'negative' ? 'text-status-lost/90'
              : 'text-foreground/85',
            )}>
              {t.text}
            </span>

            {/* Evidence pills */}
            {t.source && <EvidencePills source={t.source} />}
          </div>
        </div>
      ))}
    </div>
  )
}

function categoryIconColor(category: TacticalCategory): string {
  switch (category) {
    case 'transition':       return 'text-amber-500'
    case 'pressing':         return 'text-primary'
    case 'wide-threats':     return 'text-status-won/80'
    case 'set-pieces':       return 'text-gold'
    case 'defensive-shape':  return 'text-muted-foreground'
    case 'counterattack':    return 'text-status-partial'
    case 'finishing':        return 'text-status-won'
    case 'high-line':        return 'text-status-lost'
    case 'key-duel':         return 'text-gold'
    default:                 return 'text-primary/70'
  }
}

function NarrativeCallout({ narrative }: { narrative: NarrativeInsight }) {
  return (
    <div className="rounded-xl bg-gold-muted border border-gold-border px-3.5 py-3">
      <div className="flex items-start gap-2.5">
        <BookOpen className="size-[13px] text-gold flex-shrink-0 mt-[2px]" strokeWidth={1.75} />
        <div>
          <p className="text-[11px] font-black tracking-[0.03em] text-gold mb-1.5">
            {narrative.headline}
          </p>
          <p className="text-[12px] text-foreground/80 leading-relaxed">
            {narrative.body}
          </p>
        </div>
      </div>
    </div>
  )
}

function CoachingHint({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5 bg-primary-muted rounded-xl px-3.5 py-2.5">
      <Sparkles className="size-[13px] text-primary flex-shrink-0 mt-[3px]" strokeWidth={1.75} />
      <p className="text-[12px] text-foreground/75 leading-relaxed italic">{text}</p>
    </div>
  )
}

function BulletList({ bullets }: { bullets: InsightBullet[] }) {
  const safe = Array.isArray(bullets) ? bullets : []
  if (safe.length === 0) return null
  return (
    <div className="flex flex-col gap-2 mt-1">
      {safe.map((b, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className={cn(
            'mt-[6px] size-[5px] rounded-full flex-shrink-0',
            b.highlight === 'positive' ? 'bg-status-won'
            : b.highlight === 'negative' ? 'bg-status-lost'
            : b.highlight === 'warning'  ? 'bg-amber-500'
            : 'bg-primary/50',
          )} />
          <div className="min-w-0">
            <span className="text-[13px] text-foreground/90 leading-snug">{b.text}</span>
            {b.source && <EvidencePills source={b.source} />}
          </div>
        </div>
      ))}
    </div>
  )
}

const CONFIDENCE_CONFIG: Record<ConfidenceLevel, { label: string; cls: string }> = {
  low:    { label: 'Limited data', cls: 'bg-amber-500/10 text-amber-500 border-amber-500/25' },
  medium: { label: 'Medium',       cls: 'bg-primary/10 text-primary border-primary/25' },
  high:   { label: 'High',         cls: 'bg-status-won/10 text-status-won border-status-won/25' },
}

function ConfidenceChip({ confidence }: { confidence: ConfidenceLevel }) {
  const { label, cls } = CONFIDENCE_CONFIG[confidence]
  return (
    <span className={cn(
      'text-[10px] font-bold tracking-[0.06em] uppercase px-2 py-[3px] rounded-full border whitespace-nowrap',
      cls,
    )}>
      {label}
    </span>
  )
}

function EdgeBanner({ edge, edgeNote }: { edge: MatchInsights['edge']; edgeNote?: string }) {
  const label =
    edge.team === 'draw'
      ? 'Very Balanced Matchup'
      : edge.strength === 'clear'
        ? `Edge: ${edge.teamName}`
        : `Slight Edge: ${edge.teamName}`

  return (
    <div className="flex flex-col gap-2">
      <div className={cn(
        'flex items-center justify-center gap-2 py-3 rounded-xl',
        'bg-primary/[0.09] border border-primary/20',
      )}>
        <Zap className="size-3.5 text-primary flex-shrink-0" strokeWidth={2.5} />
        <span className="text-[13px] font-black text-primary tracking-[0.02em]">{label}</span>
      </div>
      {edgeNote && (
        <p className="text-[12px] text-muted-foreground leading-snug text-center italic px-2">
          {edgeNote}
        </p>
      )}
    </div>
  )
}

// ─── Pending placeholder ──────────────────────────────────────

function InsightsPendingCard({
  homeTeam, awayTeam,
}: { homeTeam: { name: string }; awayTeam: { name: string } }) {
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="h-[2px] bg-gradient-to-r from-muted-foreground/30 via-muted-foreground/10 to-transparent" />
      <div className="divide-y divide-border/50">
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2">
            <Sparkles className="size-[14px] text-muted-foreground/50 flex-shrink-0" strokeWidth={1.75} />
            <span className="text-[13px] font-bold text-muted-foreground tracking-[-0.01em]">
              AI Match Insights
            </span>
          </div>
          <span className="text-[10px] font-bold tracking-[0.06em] uppercase px-2 py-[3px] rounded-full border bg-muted/20 text-muted-foreground/60 border-border">
            Pending
          </span>
        </div>
        <div className="px-4 py-8 flex flex-col items-center gap-3">
          <div className="size-9 rounded-full bg-surface-elevated flex items-center justify-center">
            <Clock className="size-4 text-muted-foreground/50" strokeWidth={1.75} />
          </div>
          <div className="text-center">
            <p className="text-[13px] font-semibold text-foreground/70 mb-1">Analysis Pending</p>
            <p className="text-[12px] text-muted-foreground leading-relaxed max-w-[220px] mx-auto">
              Full match intelligence will be available once{' '}
              {homeTeam.name === 'TBD' && awayTeam.name === 'TBD'
                ? 'both teams have confirmed their places'
                : homeTeam.name === 'TBD'
                  ? `${awayTeam.name}'s opponent has been confirmed`
                  : awayTeam.name === 'TBD'
                    ? `${homeTeam.name}'s opponent has been confirmed`
                    : 'the teams have been confirmed'}.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────

function InsightsSkeleton() {
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="h-[2px] bg-gradient-to-r from-primary/30 via-primary/10 to-transparent" />
      <div className="divide-y divide-border/50 animate-pulse">
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2">
            <div className="size-[14px] rounded-full bg-surface-elevated" />
            <div className="h-3.5 w-28 rounded-full bg-surface-elevated" />
            <div className="h-4 w-16 rounded bg-surface-elevated" />
          </div>
          <div className="h-5 w-14 rounded-full bg-surface-elevated" />
        </div>
        <div className="px-4 py-3 space-y-3">
          <div className="h-2.5 w-32 rounded-full bg-surface-elevated" />
          <div className="flex items-start gap-2.5">
            <div className="size-[18px] rounded-md bg-surface-elevated flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-2 w-16 rounded-full bg-surface-elevated" />
              <div className="h-8 rounded-lg bg-surface-elevated" />
              <div className="h-3 w-full rounded-full bg-surface-elevated" />
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <div className="size-[18px] rounded-md bg-surface-elevated flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-2 w-20 rounded-full bg-surface-elevated" />
              <div className="h-8 rounded-lg bg-surface-elevated" />
              <div className="h-3 w-5/6 rounded-full bg-surface-elevated" />
            </div>
          </div>
        </div>
        <div className="px-4 py-3 space-y-2">
          <div className="h-2.5 w-20 rounded-full bg-surface-elevated" />
          <div className="h-5 w-44 rounded-lg bg-surface-elevated" />
          <div className="h-5 w-44 rounded-lg bg-surface-elevated" />
        </div>
        <div className="px-4 py-3 space-y-2">
          <div className="h-2.5 w-24 rounded-full bg-surface-elevated" />
          <div className="h-3.5 w-full rounded-full bg-surface-elevated" />
          <div className="h-3.5 w-3/4 rounded-full bg-surface-elevated" />
        </div>
        <div className="px-4 py-3.5">
          <div className="h-10 rounded-xl bg-surface-elevated" />
        </div>
      </div>
    </div>
  )
}
