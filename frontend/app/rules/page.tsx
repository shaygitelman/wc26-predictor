import Link from 'next/link'
import { BookOpen, Lock, Trophy, Users, Zap, ChevronRight } from 'lucide-react'
import { ContextHeader } from '@/components/layout/context-header'
import { cn } from '@/lib/utils'
import { ROUND_POINTS, TOURNAMENT_BONUS } from '@/lib/constants'

const ROUNDS: Array<{ key: string; label: string }> = [
  { key: 'group', label: 'Group Stage'    },
  { key: 'r32',   label: 'Round of 32'    },
  { key: 'r16',   label: 'Round of 16'    },
  { key: 'qf',    label: 'Quarter Finals' },
  { key: 'sf',    label: 'Semi Finals'    },
  { key: '3rd',   label: '3rd Place'      },
  { key: 'final', label: 'Final'          },
]

type Tier = 'gold' | 'silver' | 'none'
const TIER_STYLES: Record<Tier, { label: string }> = {
  gold:   { label: 'text-amber-500' },
  silver: { label: 'text-primary'   },
  none:   { label: 'text-muted-foreground' },
}

export default function RulesPage() {
  return (
    <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
      <ContextHeader title="Rules" back="/profile" />

      <div className="flex flex-col gap-5 p-4">

        {/* ── Hero ─────────────────────────────────────────── */}
        <div className="bg-primary-muted border border-primary/20 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="size-5 text-primary flex-shrink-0" />
            <h1 className="text-xl font-black text-foreground">Game Rules</h1>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            FIFA World Cup 2026 · 48 Teams · 104 Matches
          </p>
        </div>

        {/* ── Tournament bonuses ───────────────────────────── */}
        <section>
          <SectionLabel>Tournament Bonuses</SectionLabel>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <BonusRow
              pts={TOURNAMENT_BONUS.WINNER}
              label="Tournament Winner"
              desc="Pick the team that lifts the trophy"
              tier="gold"
            />
            <BonusRow
              pts={TOURNAMENT_BONUS.TOP_SCORER}
              label="Top Goal Scorer"
              desc="Pick who finishes as the top scorer"
              tier="gold"
              last
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2 px-1">
            Picks can be changed until the first match kicks off
          </p>
        </section>

        {/* ── Round-by-round scoring table ─────────────────── */}
        <section>
          <SectionLabel>Points by Round</SectionLabel>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_auto_auto] items-center px-4 py-2.5 bg-surface-elevated border-b border-border">
              <p className="text-2xs font-bold tracking-wide uppercase text-muted-foreground">Round</p>
              <p className="text-2xs font-bold tracking-wide uppercase text-muted-foreground w-16 text-center">Outcome</p>
              <p className="text-2xs font-bold tracking-wide uppercase text-muted-foreground w-16 text-center">Exact</p>
            </div>
            {ROUNDS.map((r, i) => {
              const pts   = ROUND_POINTS[r.key]
              const isTop = r.key === 'final'
              return (
                <div
                  key={r.key}
                  className={cn(
                    'grid grid-cols-[1fr_auto_auto] items-center px-4 py-3',
                    i < ROUNDS.length - 1 && 'border-b border-border',
                    isTop && 'bg-amber-500/5',
                  )}
                >
                  <p className={cn('text-sm font-bold', isTop ? 'text-amber-500' : 'text-foreground')}>
                    {r.label}
                  </p>
                  <div className="w-16 text-center">
                    <span className={cn(
                      'text-base tabular',
                      isTop ? 'text-amber-500 font-black' : 'text-primary font-bold',
                    )}>
                      {pts.direction}
                    </span>
                    <span className="text-2xs text-muted-foreground ml-0.5">pts</span>
                  </div>
                  <div className="w-16 text-center">
                    <span className={cn(
                      'text-base tabular',
                      isTop ? 'text-amber-500 font-black' : 'text-primary font-bold',
                    )}>
                      {pts.exact}
                    </span>
                    <span className="text-2xs text-muted-foreground ml-0.5">pts</span>
                  </div>
                </div>
              )
            })}
            {/* Column legend */}
            <div className="grid grid-cols-2 gap-px border-t border-border bg-border">
              <div className="bg-card px-4 py-2.5">
                <p className="text-2xs font-bold text-foreground">Correct Outcome</p>
                <p className="text-2xs text-muted-foreground">Win / Draw / Loss (W/D/L)</p>
              </div>
              <div className="bg-card px-4 py-2.5">
                <p className="text-2xs font-bold text-foreground">Exact Score</p>
                <p className="text-2xs text-muted-foreground">Predict the final scoreline</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Terms of use ─────────────────────────────────── */}
        <section>
          <SectionLabel>Terms of Use</SectionLabel>
          <div className="bg-card rounded-xl border border-border divide-y divide-border">
            <RuleRow
              icon={<Lock className="size-4 text-primary flex-shrink-0" />}
              text="Predictions lock at kickoff — edit any time before"
            />
            <RuleRow
              icon={<Zap className="size-4 text-amber-500 flex-shrink-0" />}
              text="Group stage: result determined after 90 minutes"
            />
            <RuleRow
              icon={<Zap className="size-4 text-amber-500 flex-shrink-0" />}
              text="Knockout rounds: result after 120 min — penalties not counted"
            />
            <RuleRow
              icon={<Lock className="size-4 text-primary flex-shrink-0" />}
              text='Missing predictions are auto-filled by the "monkey"'
            />
            <RuleRow
              icon={<Users className="size-4 text-muted-foreground flex-shrink-0" />}
              text="Late registrations: no points for matches already started"
              last
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2 px-1">
            Registration opens May 11 and closes July 19
          </p>
        </section>

        {/* ── Tiebreaker ───────────────────────────────────── */}
        <section>
          <SectionLabel>Tiebreaker</SectionLabel>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <p className="text-xs text-muted-foreground px-4 pt-4 pb-2">
              If players are tied on points, the following criteria apply in order:
            </p>
            {[
              { rank: 1, text: 'Number of exact scores'             },
              { rank: 2, text: 'Number of correct directions'       },
              { rank: 3, text: 'Goals scored by chosen top scorer'  },
              { rank: 4, text: 'Tournament winner prediction'       },
              { rank: 5, text: 'Registration timestamp'            },
            ].map(({ rank, text }, i, arr) => (
              <div
                key={rank}
                className={cn(
                  'flex items-center gap-3 px-4 py-3',
                  i < arr.length - 1 && 'border-t border-border',
                )}
              >
                <span className="size-6 rounded-full bg-primary-muted text-primary text-xs font-black flex items-center justify-center flex-shrink-0">
                  {rank}
                </span>
                <p className="text-sm font-semibold text-foreground">{text}</p>
              </div>
            ))}
            <div className="border-t border-border px-4 py-3 bg-surface-elevated">
              <p className="text-xs text-muted-foreground">
                * If multiple players tie on top scorer goals, all receive the bonus points.
              </p>
            </div>
          </div>
        </section>

        {/* ── Leagues ─────────────────────────────────────── */}
        <section>
          <SectionLabel>Leagues</SectionLabel>
          <div className="bg-card rounded-xl border border-border divide-y divide-border">
            <RuleRow
              icon={<Trophy className="size-4 text-amber-500 flex-shrink-0" />}
              text="Create a private league and share the invite code with friends"
            />
            <RuleRow
              icon={<Users className="size-4 text-primary flex-shrink-0" />}
              text="Leaderboards update in real time as matches finish"
              last
            />
          </div>
        </section>

        {/* ── Back to profile ──────────────────────────────── */}
        <Link
          href="/profile"
          className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight className="size-4 rotate-180" />
          Back to Profile
        </Link>

      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-2xs font-bold tracking-[0.12em] uppercase text-muted-foreground mb-3 px-0.5">
      {children}
    </p>
  )
}

function BonusRow({
  pts, label, desc, tier, last,
}: {
  pts: number; label: string; desc: string; tier: Tier; last?: boolean
}) {
  const s = TIER_STYLES[tier]
  return (
    <div className={cn('flex items-center gap-4 px-4 py-4', !last && 'border-b border-border')}>
      <div className="rounded-xl px-3 py-2 min-w-[56px] text-center flex-shrink-0 bg-amber-500/10 border border-amber-500/20">
        <span className={cn('text-xl font-black tabular', s.label)}>+{pts}</span>
        <p className="text-2xs font-semibold text-muted-foreground leading-none mt-0.5">pts</p>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
    </div>
  )
}

function RuleRow({
  icon, text, last,
}: {
  icon: React.ReactNode; text: string; last?: boolean
}) {
  return (
    <div className={cn('flex items-start gap-3 px-4 py-3.5', last && '')}>
      <div className="mt-0.5 flex-shrink-0">{icon}</div>
      <p className="text-sm font-semibold text-foreground leading-snug">{text}</p>
    </div>
  )
}
