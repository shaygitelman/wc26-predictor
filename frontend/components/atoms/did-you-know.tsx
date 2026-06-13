import { Lightbulb } from 'lucide-react'
import { TeamFlag } from '@/components/atoms/team-flag'
import { FACTS_MAP, FALLBACK_FACTS } from '@/data/did-you-know'
import type { Match } from '@/types/match'

interface Props {
  nextMatches: Match[]
}

function kickoffLabel(scheduledAt: string) {
  const d = new Date(scheduledAt)
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
      <div className="overflow-hidden rounded-2xl border border-gold/20 shadow-card">
        <div className="h-0.5 bg-gold/50" />
        <div className="bg-card px-4 pt-2 pb-2.5">

          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] font-black tracking-[0.14em] uppercase text-muted-foreground/70">
              ⚽ Next Match
            </span>
            <span className="text-[9px] font-medium text-muted-foreground/50">{kickoff}</span>
          </div>

          <div className="flex items-center mb-2">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <TeamFlag team={m.homeTeam} size="sm" />
              <span className="text-[12px] font-semibold text-foreground leading-tight truncate">
                {m.homeTeam.name}
              </span>
            </div>
            <span className="text-[9px] font-bold text-muted-foreground/40 px-2 shrink-0">vs</span>
            <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
              <span className="text-[12px] font-semibold text-foreground leading-tight truncate text-right">
                {m.awayTeam.name}
              </span>
              <TeamFlag team={m.awayTeam} size="sm" />
            </div>
          </div>

          <div className="border-t border-border/40 mb-2" />

          <div className="flex items-start gap-1.5">
            <Lightbulb className="size-3 text-gold shrink-0 mt-[1px]" />
            <p className="text-[11px] leading-[1.4] text-muted-foreground">
              <span className="font-semibold text-foreground/75">Did you know?</span>{' '}{fact}
            </p>
          </div>

        </div>
      </div>
    )
  }

  // ── Multiple matches at same kickoff ──────────────────────────────────────
  return (
    <div className="overflow-hidden rounded-2xl border border-gold/20 shadow-card">
      <div className="h-0.5 bg-gold/50" />
      <div className="bg-card px-4 pt-2 pb-2.5">

        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] font-black tracking-[0.14em] uppercase text-muted-foreground/70">
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
                <span className="text-[10px] font-bold text-foreground/80">{m.homeTeam.shortCode}</span>
                <span className="text-[9px] text-muted-foreground/40 px-1">vs</span>
                <span className="text-[10px] font-bold text-foreground/80">{m.awayTeam.shortCode}</span>
                <TeamFlag team={m.awayTeam} size="sm" />
              </div>

              <div className="flex items-start gap-1.5">
                <Lightbulb className="size-3 text-gold shrink-0 mt-[1px]" />
                <p className="text-[11px] leading-[1.4] text-muted-foreground">{fact}</p>
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
