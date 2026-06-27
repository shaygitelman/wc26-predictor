import { Lightbulb } from 'lucide-react'
import { TeamFlag }  from '@/components/atoms/team-flag'
import { FACTS_MAP, FALLBACK_FACTS } from '@/data/did-you-know'
import type { MatchFact, FactCategory } from '@/data/did-you-know'
import type { Match } from '@/types/match'

interface Props {
  nextMatches: Match[]
}

function kickoffLabel(scheduledAt: string) {
  const d    = new Date(scheduledAt)
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
  return `${date} · ${time}`
}

// ── Fact selection ────────────────────────────────────────────────────────────
// Uses the current UTC day as a seed so every visitor sees the same fact on the
// same day — but a different fact the next day.  When showing multiple matches,
// categories are kept diverse so adjacent facts never feel repetitive.

function utcDayIndex(): number {
  return Math.floor(Date.now() / 86_400_000)
}

function pickFact(
  match:           Match,
  dayIndex:        number,
  usedCategories:  Set<FactCategory>,
): string {
  const key   = `${match.homeTeam.shortCode}_${match.awayTeam.shortCode}`
  const facts = FACTS_MAP.get(key) ?? []

  // Prefer a fact whose category hasn't been used in this rendering pass.
  const fresh   = facts.filter(f => !usedCategories.has(f.category))
  const pool    = fresh.length > 0 ? fresh : facts
  const chosen: MatchFact | undefined = pool.length > 0
    ? pool[dayIndex % pool.length]
    : FALLBACK_FACTS[dayIndex % FALLBACK_FACTS.length]

  usedCategories.add(chosen.category)
  return chosen.text
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DidYouKnow({ nextMatches }: Props) {
  if (nextMatches.length === 0) return null

  const dayIndex       = utcDayIndex()
  const usedCategories = new Set<FactCategory>()
  const kickoff        = kickoffLabel(nextMatches[0].scheduledAt)
  const isSingle       = nextMatches.length === 1
  const shown          = nextMatches.slice(0, 3)
  const overflow       = nextMatches.length - 3

  // ── Single match ─────────────────────────────────────────────────────────
  if (isSingle) {
    const m    = nextMatches[0]
    const fact = pickFact(m, dayIndex, usedCategories)

    return (
      <div className="overflow-hidden rounded-2xl border border-gold/40 shadow-card">
        <div className="h-0.5 bg-gold/60" />
        <div className="bg-card px-4 pt-2.5 pb-4">

          {/* Label + kickoff */}
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-[9px] font-black tracking-[0.14em] uppercase text-gold/80">
              ⚽ Next Match
            </span>
            <span className="text-[13px] font-semibold text-muted-foreground/60 whitespace-nowrap">
              {kickoff}
            </span>
          </div>

          {/* Teams */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 mb-2">
            <div className="flex items-center gap-2">
              <TeamFlag team={m.homeTeam} size="md" />
              <span className="text-[15px] font-bold text-foreground">{m.homeTeam.name}</span>
            </div>
            <span className="text-[18px] font-black text-foreground/30 uppercase leading-none">vs</span>
            <div className="flex items-center gap-2 justify-end">
              <span className="text-[15px] font-bold text-foreground text-right">{m.awayTeam.name}</span>
              <TeamFlag team={m.awayTeam} size="md" />
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-border/40 mb-3" />

          {/* Fact */}
          <div className="flex items-start gap-2.5">
            <Lightbulb className="size-[18px] text-gold shrink-0 mt-[2px]" />
            <div>
              <p className="text-[13px] font-bold text-gold leading-tight mb-1">Did you know?</p>
              <p className="text-[15px] leading-[1.55] text-foreground/80">{fact}</p>
            </div>
          </div>

        </div>
      </div>
    )
  }

  // ── Multiple matches at same kickoff ────────────────────────────────────
  return (
    <div className="overflow-hidden rounded-2xl border border-gold/40 shadow-card">
      <div className="h-0.5 bg-gold/60" />
      <div className="bg-card px-4 pt-2.5 pb-4">

        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] font-black tracking-[0.14em] uppercase text-gold/80">
            ⚽ Next Matches
          </span>
          <span className="text-[9px] font-medium text-muted-foreground/50">{kickoff}</span>
        </div>

        <div className="border-t border-border/40" />

        {shown.map((m, i) => {
          const fact = pickFact(m, dayIndex + i, usedCategories)
          return (
            <div key={m.id}>
              {i > 0 && <div className="border-t border-dashed border-border/30 my-1.5" />}

              <div className={`flex items-center gap-1 mb-1 ${i === 0 ? 'mt-2' : ''}`}>
                <TeamFlag team={m.homeTeam} size="sm" />
                <span className="text-[12px] font-bold text-foreground/80">{m.homeTeam.shortCode}</span>
                <span className="text-[10px] text-muted-foreground/40 px-1">vs</span>
                <span className="text-[12px] font-bold text-foreground/80">{m.awayTeam.shortCode}</span>
                <TeamFlag team={m.awayTeam} size="sm" />
              </div>

              <div className="flex items-start gap-2">
                <Lightbulb className="size-3.5 text-gold shrink-0 mt-[2px]" />
                <p className="text-[13px] leading-[1.5] text-foreground/80">{fact}</p>
              </div>
            </div>
          )
        })}

        {overflow > 0 && (
          <>
            <div className="border-t border-border/40 mt-2 mb-1.5" />
            <p className="text-center text-[10px] font-semibold text-muted-foreground/50">
              + {overflow} more {overflow === 1 ? 'match' : 'matches'}
            </p>
          </>
        )}

      </div>
    </div>
  )
}
