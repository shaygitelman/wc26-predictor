import { Lightbulb } from 'lucide-react'
import { FACTS_MAP, FALLBACK_FACTS } from '@/data/did-you-know'
import type { Match } from '@/types/match'

interface Props {
  nextMatch: Match | null
}

export function DidYouKnow({ nextMatch }: Props) {
  if (!nextMatch) return null

  const matchKey = `${nextMatch.homeTeam.shortCode}_${nextMatch.awayTeam.shortCode}`
  const entry    = FACTS_MAP.get(matchKey)
  const fact     = entry?.fact ?? FALLBACK_FACTS[new Date().getDate() % FALLBACK_FACTS.length]

  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
      <Lightbulb className="size-3.5 text-gold shrink-0 mt-px" />
      <p className="text-[12px] leading-snug text-muted-foreground">
        <span className="font-semibold text-foreground/80">Did you know?</span>{' '}
        {fact}
      </p>
    </div>
  )
}
