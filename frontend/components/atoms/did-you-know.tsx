'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { Lightbulb } from 'lucide-react'
import { TeamFlag }  from '@/components/atoms/team-flag'
import { getFactsForMatch } from '@/data/did-you-know'
import type { MatchFact } from '@/data/did-you-know'
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
//
// Priority order (per matchup/team pool):
//   1. H2H facts over single-team facts — already enforced by getFactsForMatch,
//      which returns the H2H pool exclusively whenever one exists.
//   2. Facts never shown to this visitor before, over facts already shown.
//      Repeats only happen once every fact in the pool has been shown.
//   3. Among the survivors of (2), the highest interestingScore — which is
//      authored to mean "wow, I didn't know that", not "how famous/modern is
//      this". A bizarre 1986 stat can and should outrank a well-known 2022
//      one; common-knowledge facts (Messi won the World Cup, Brazil have won
//      five titles) are scored low regardless of how recent they are.
//   4. Ties broken by least-recently-shown (never-shown counts as longest ago).
//   5. Any remaining tie is broken by preferring the more modern fact — this
//      only ever applies among facts that are already equally surprising and
//      equally fresh, so modernity never overrides substance.
//   6. Any tie still remaining is broken by a deterministic day-based
//      rotation, so it doesn't always resolve to the same array element.
//
// "Shown" state lives in localStorage, keyed by fact id, so it persists across
// visits on the same device without needing a backend.

const SHOWN_KEY = 'wc26:dyk:shown:v1'

interface ShownEntry {
  count:   number  // how many times this fact has ever been shown
  lastDay: number  // utcDayIndex it was last shown on
}
type ShownMap = Record<string, ShownEntry>

function utcDayIndex(): number {
  return Math.floor(Date.now() / 86_400_000)
}

function readShownMap(): ShownMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(SHOWN_KEY)
    return raw ? JSON.parse(raw) as ShownMap : {}
  } catch {
    return {}
  }
}

function markShown(id: string, dayIndex: number) {
  if (typeof window === 'undefined') return
  try {
    const map   = readShownMap()
    const entry = map[id]
    if (entry?.lastDay === dayIndex) return // already recorded today
    map[id] = { count: (entry?.count ?? 0) + 1, lastDay: dayIndex }
    window.localStorage.setItem(SHOWN_KEY, JSON.stringify(map))
  } catch {
    // localStorage unavailable (private browsing, quota, etc.) — degrade to
    // no memory of past facts rather than throwing.
  }
}

function rotate<T>(arr: T[], seed: number): T {
  return arr[((seed % arr.length) + arr.length) % arr.length]
}

// Used only as the very last tiebreaker, once two facts are already tied on
// surprise value (interestingScore) and on how recently they were shown. It
// never overrides substance — see pickBestFact.
function eraWeight(f: MatchFact): number {
  switch (f.era) {
    case 'modern':  return 3
    case 'recent':  return 2
    case 'classic': return 1
    case 'vintage': return 0
  }
}

// Picks the next fact for a pool. Facts are grouped into "laps": nothing gets
// shown a 2nd time until every fact in the pool has been shown once, nothing
// gets shown a 3rd time until every fact has been shown twice, and so on —
// that's what tracking a per-fact `count` (not just a last-shown flag) buys:
// the exhaustion behavior repeats at every level instead of collapsing into a
// tight loop over just the top-scored handful once the pool empties out once.
// Within whichever lap is currently open, the ordering is exactly the
// requested priority: highest interestingScore (surprise value) first,
// tie-broken by least recently shown, tie-broken by preferring the more
// modern fact, tie-broken by a deterministic day-based rotation.
function pickBestFact(pool: MatchFact[], shownMap: ShownMap, dayIndex: number): MatchFact {
  const countOf = (f: MatchFact) => shownMap[f.id]?.count ?? 0
  const minCount   = Math.min(...pool.map(countOf))
  const candidates = pool.filter(f => countOf(f) === minCount)

  const bestScore = Math.max(...candidates.map(f => f.interestingScore))
  const topScored = candidates.filter(f => f.interestingScore === bestScore)

  const lastDayOf   = (f: MatchFact) => shownMap[f.id]?.lastDay ?? -Infinity
  const oldestShown = Math.min(...topScored.map(lastDayOf))
  const leastRecent = topScored.filter(f => lastDayOf(f) === oldestShown)

  const bestEra = Math.max(...leastRecent.map(eraWeight))
  const finalTier = leastRecent.filter(f => eraWeight(f) === bestEra)

  return rotate(finalTier, dayIndex)
}

function relevantPool(homeCode: string, awayCode: string): MatchFact[] {
  // Defensive re-check: only ever consider facts that are actually tagged to
  // one of the two teams on screen. getFactsForMatch already guarantees this,
  // but a match-level fact must never slip through unverified.
  return getFactsForMatch(homeCode, awayCode)
    .filter(f => f.teams.includes(homeCode) || f.teams.includes(awayCode))
}

// No external event ever invalidates the pick mid-session, so there's nothing
// to subscribe to — we only need useSyncExternalStore for the SSR/client
// snapshot split it gives us for free (see below).
function subscribeNoop() {
  return () => {}
}

/**
 * Resolves the fact to show for one matchup.
 *
 * useSyncExternalStore is the reason this doesn't need a useState+useEffect
 * dance: React calls getServerSnapshot for the very first client render (so
 * it matches the server-rendered HTML with no history-aware pick, since
 * localStorage isn't available there), then immediately re-checks against
 * getSnapshot after hydration and re-renders if the history-aware pick
 * differs — which is exactly the "SSR-safe default, then upgrade on the
 * client" behavior this widget needs.
 */
function useMatchFact(match: Match, dayOffset: number): string {
  const home = match.homeTeam.shortCode
  const away = match.awayTeam.shortCode
  const dayIndex = utcDayIndex() + dayOffset
  const pool = relevantPool(home, away)

  const factId = useSyncExternalStore(
    subscribeNoop,
    () => (pool.length > 0 ? pickBestFact(pool, readShownMap(), dayIndex).id : null),
    () => (pool.length > 0 ? pickBestFact(pool, {}, dayIndex).id : null),
  )

  // Persisting "this fact was shown today" is a genuine side effect on an
  // external system (localStorage), so it belongs in an effect — unlike the
  // selection itself, this never calls setState.
  useEffect(() => {
    if (factId) markShown(factId, dayIndex)
  }, [factId, dayIndex])

  const fact = pool.find(f => f.id === factId) ?? null
  if (fact) return fact.text
  // Should never happen — every competing team has a fact bank — but if a
  // team code is ever missing, fall back to a statement that is trivially
  // true and still 100% specific to this fixture, never a random country.
  return `${match.homeTeam.name} face ${match.awayTeam.name} for a place in the next round.`
}

// ── Fact text subcomponents ─────────────────────────────────────────────────
// Each list item gets its own component instance so useMatchFact's hooks obey
// the rules of hooks even though the parent renders a variable-length list.

function SingleMatchFactText({ match }: { match: Match }) {
  const text = useMatchFact(match, 0)
  return <p className="text-[15px] leading-[1.55] text-foreground/80">{text}</p>
}

function MultiMatchFactText({ match, dayOffset }: { match: Match; dayOffset: number }) {
  const text = useMatchFact(match, dayOffset)
  return <p className="text-[13px] leading-[1.5] text-foreground/80">{text}</p>
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DidYouKnow({ nextMatches }: Props) {
  if (nextMatches.length === 0) return null

  const kickoff  = kickoffLabel(nextMatches[0].scheduledAt)
  const isSingle = nextMatches.length === 1
  const shown    = nextMatches.slice(0, 3)
  const overflow = nextMatches.length - 3

  // ── Single match ─────────────────────────────────────────────────────────
  if (isSingle) {
    const m = nextMatches[0]

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
              <SingleMatchFactText match={m} />
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

        {shown.map((m, i) => (
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
              <MultiMatchFactText match={m} dayOffset={i} />
            </div>
          </div>
        ))}

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
