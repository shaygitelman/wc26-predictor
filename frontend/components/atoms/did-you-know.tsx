import { Lightbulb } from 'lucide-react'
import { TeamFlag } from '@/components/atoms/team-flag'
import { FACTS_MAP, FALLBACK_FACTS } from '@/data/did-you-know'
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

function getFact(match: Match): string {
  const key = `${match.homeTeam.shortCode}_${match.awayTeam.shortCode}`
  return FACTS_MAP.get(key)?.fact ?? FALLBACK_FACTS[new Date().getDate() % FALLBACK_FACTS.length]
}

export function DidYouKnow({ nextMatches }: Props) {
  if (nextMatches.length === 0) return null

  const kickoff  = kickoffLabel(nextMatches[0].scheduledAt)
  const isSingle = nextMatches.length === 1
  const shown    = nextMatches.slice(0, 3)
  const overflow = nextMatches.length - 3

  // ── Single match ──────────────────────────────────────────────────────────
  if (isSingle) {
    const m    = nextMatches[0]
    const fact = getFact(m)
    return (
      <div className="overflow-hidden rounded-2xl border border-gold/40 shadow-card">
        <div className="h-0.5 bg-gold/60" />
        <div className="bg-card px-4 pt-2.5 pb-4">

          {/* ⚽ label + kickoff time */}
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-[9px] font-black tracking-[0.14em] uppercase text-gold/80">
              ⚽ Next Match
            </span>
            <span className="text-[13px] font-semibold text-muted-foreground/60 whitespace-nowrap">
              {kickoff}
            </span>
          </div>

          {/* Teams — VS alone in center so the row height stays anchored to the flag */}
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

  // ── Multiple matches at same kickoff ──────────────────────────────────────
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
          const fact = getFact(m)
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
