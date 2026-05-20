// ╔══════════════════════════════════════════════════════════════════╗
// ║  DEPRECATED — do not use in production                          ║
// ║                                                                  ║
// ║  This module generated fictional insight data via PRNG for UX   ║
// ║  prototyping. It has been superseded by the real-data pipeline:  ║
// ║                                                                  ║
// ║    lib/insights-data.ts    — fetch real API data                ║
// ║    lib/insights-engine.ts  — interpret confirmed data            ║
// ║    app/api/matches/[id]/insights/route.ts — orchestrates both   ║
// ║                                                                  ║
// ║  Retained for reference only. Do not import generateInsights.   ║
// ╚══════════════════════════════════════════════════════════════════╝

import type { Team, Round } from '@/types/match'
import type {
  FormResult, InsightBullet, TacticalInsight, TacticalCategory,
  NarrativeInsight, MatchInsights, MatchPersonality, SectionKey,
} from '@/types/insights'

// ─── Seeded PRNG (FNV-1a hash + xorshift32) ──────────────────

function hashStr(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  }
  return h >>> 0
}

function makePRNG(seed: number) {
  let s = (seed === 0 ? 1 : seed) >>> 0
  return (): number => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 0x100000000
  }
}

function pick<T>(rand: () => number, arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)]
}

// ─── Team database ───────────────────────────────────────────

type PlayStyle   = 'possession' | 'transition' | 'pressing' | 'counter' | 'defensive' | 'direct' | 'technical'
type ThreatType  = 'wide' | 'set-pieces' | 'through-balls' | 'high-press' | 'pace' | 'physicality' | 'individual-brilliance'

interface TeamDef {
  strength:  number
  goalsFor:  number
  goalsAgt:  number
  players:   { name: string; stat: string }[]
  style:     PlayStyle[]
  threats:   ThreatType[]
  identity:  string
  prestige:  number   // 1–10 narrative/historical weight
}

const TEAM_DB: Record<string, TeamDef> = {
  BRA: {
    strength: 9.1, goalsFor: 2.6, goalsAgt: 0.8,
    players: [
      { name: 'Vinícius Jr.',   stat: 'created 11 chances in his last 3 matches' },
      { name: 'Rodrygo',        stat: 'scored or assisted in 4 of his last 5 starts' },
    ],
    style: ['transition', 'pressing', 'technical'],
    threats: ['wide', 'pace', 'individual-brilliance'],
    identity: 'explosive transition football and individual flair',
    prestige: 9.5,
  },
  FRA: {
    strength: 9.0, goalsFor: 2.4, goalsAgt: 0.7,
    players: [
      { name: 'Kylian Mbappé',   stat: 'scored 5 goals in his last 4 appearances' },
      { name: 'Antoine Griezmann', stat: 'provided 3 key passes per game this campaign' },
    ],
    style: ['transition', 'counter'],
    threats: ['pace', 'wide', 'individual-brilliance'],
    identity: 'devastating pace and transition power',
    prestige: 9.5,
  },
  ARG: {
    strength: 9.1, goalsFor: 2.3, goalsAgt: 0.9,
    players: [
      { name: 'Lionel Messi',   stat: 'provided 4 assists in his last 3 matches' },
      { name: 'Lautaro Martínez', stat: 'scored in 3 consecutive starts' },
    ],
    style: ['possession', 'technical'],
    threats: ['individual-brilliance', 'set-pieces'],
    identity: 'emotional intensity and controlled excellence',
    prestige: 9.5,
  },
  ESP: {
    strength: 8.8, goalsFor: 2.2, goalsAgt: 0.6,
    players: [
      { name: 'Lamine Yamal',   stat: 'completed 6 dribbles per game over his last 3 starts' },
      { name: 'Pedri',          stat: 'won the ball 8 times per game in his last 4 matches' },
    ],
    style: ['possession', 'pressing'],
    threats: ['through-balls', 'high-press'],
    identity: 'positional dominance and systematic pressing',
    prestige: 9.0,
  },
  GER: {
    strength: 8.5, goalsFor: 2.1, goalsAgt: 1.1,
    players: [
      { name: 'Florian Wirtz',  stat: 'registered 3 goals and 2 assists in his last 4 starts' },
      { name: 'Jamal Musiala',  stat: 'dribbled past 5 opponents per game in recent starts' },
    ],
    style: ['pressing', 'transition', 'direct'],
    threats: ['wide', 'set-pieces', 'high-press'],
    identity: 'high-tempo pressing and clinical direct play',
    prestige: 9.0,
  },
  ENG: {
    strength: 8.3, goalsFor: 1.9, goalsAgt: 1.0,
    players: [
      { name: 'Harry Kane',     stat: 'scored in 4 of his last 5 international appearances' },
      { name: 'Bukayo Saka',    stat: 'created 9 chances in his last 4 starts' },
    ],
    style: ['direct', 'pressing'],
    threats: ['set-pieces', 'physicality', 'wide'],
    identity: 'physicality, dead-ball expertise and wide delivery',
    prestige: 8.5,
  },
  POR: {
    strength: 8.4, goalsFor: 2.0, goalsAgt: 1.0,
    players: [
      { name: 'Cristiano Ronaldo', stat: 'scored 3 goals in his last 4 appearances' },
      { name: 'Bruno Fernandes',  stat: 'registered 5 key passes in his last 3 starts' },
    ],
    style: ['transition', 'technical'],
    threats: ['individual-brilliance', 'wide', 'set-pieces'],
    identity: 'individual brilliance and attacking versatility',
    prestige: 8.5,
  },
  NED: {
    strength: 8.0, goalsFor: 1.8, goalsAgt: 1.2,
    players: [
      { name: 'Cody Gakpo',     stat: 'scored or assisted in 4 of his last 5 starts' },
      { name: 'Xavi Simons',    stat: 'created 7 chances in his last 3 matches' },
    ],
    style: ['pressing', 'transition'],
    threats: ['wide', 'set-pieces'],
    identity: 'total football heritage and direct counter-attacks',
    prestige: 8.0,
  },
  URU: {
    strength: 7.6, goalsFor: 1.7, goalsAgt: 1.2,
    players: [
      { name: 'Darwin Núñez',   stat: 'scored in 3 of his last 4 international starts' },
      { name: 'Fede Valverde',  stat: 'covered 12km per game over his last 3 matches' },
    ],
    style: ['defensive', 'counter', 'direct'],
    threats: ['physicality', 'set-pieces', 'individual-brilliance'],
    identity: 'grit and resilient counter-attacking',
    prestige: 7.5,
  },
  COL: {
    strength: 7.8, goalsFor: 1.8, goalsAgt: 1.1,
    players: [
      { name: 'Luis Díaz',         stat: 'scored 3 goals in his last 4 appearances' },
      { name: 'James Rodríguez',   stat: 'provided 2 assists in his last 3 starts' },
    ],
    style: ['transition', 'technical'],
    threats: ['individual-brilliance', 'wide'],
    identity: 'quick transitions and creative individual flair',
    prestige: 7.5,
  },
  MAR: {
    strength: 7.7, goalsFor: 1.6, goalsAgt: 1.0,
    players: [
      { name: 'Achraf Hakimi',  stat: 'registered 4 direct goal contributions in his last 5 starts' },
      { name: 'Hakim Ziyech',   stat: 'created 6 chances in his last 3 appearances' },
    ],
    style: ['defensive', 'counter', 'pressing'],
    threats: ['set-pieces', 'wide', 'high-press'],
    identity: 'collective discipline and tactical disruption',
    prestige: 8.0,
  },
  MEX: {
    strength: 7.2, goalsFor: 1.5, goalsAgt: 1.3,
    players: [
      { name: 'Hirving Lozano', stat: 'scored 2 goals in his last 3 international appearances' },
      { name: 'Edson Álvarez',  stat: 'won 68% of aerial duels in his last 4 starts' },
    ],
    style: ['counter', 'direct'],
    threats: ['set-pieces', 'wide'],
    identity: 'physical counter-attacking and set-piece threat',
    prestige: 7.0,
  },
  USA: {
    strength: 7.0, goalsFor: 1.5, goalsAgt: 1.4,
    players: [
      { name: 'Christian Pulisic', stat: 'scored or assisted in 3 of his last 4 starts' },
      { name: 'Tyler Adams',   stat: 'made 4 interceptions per game in recent matches' },
    ],
    style: ['pressing', 'direct'],
    threats: ['physicality', 'wide'],
    identity: 'athletic pressing and direct play',
    prestige: 7.0,
  },
  JPN: {
    strength: 7.5, goalsFor: 1.6, goalsAgt: 1.1,
    players: [
      { name: 'Takumi Minamino', stat: 'scored in 3 consecutive appearances' },
      { name: 'Ritsu Doan',    stat: 'created 7 chances in his last 4 starts' },
    ],
    style: ['pressing', 'counter', 'technical'],
    threats: ['high-press', 'through-balls'],
    identity: 'disciplined pressing and rapid counter-attacks',
    prestige: 7.5,
  },
  SEN: {
    strength: 7.9, goalsFor: 1.9, goalsAgt: 1.0,
    players: [
      { name: 'Sadio Mané',    stat: 'scored 4 goals in his last 5 international appearances' },
      { name: 'Ismaïla Sarr',  stat: 'completed 5 dribbles per game in his last 3 starts' },
    ],
    style: ['transition', 'direct'],
    threats: ['pace', 'physicality', 'individual-brilliance'],
    identity: 'physical pace and explosive transition power',
    prestige: 7.5,
  },
  ECU: {
    strength: 6.8, goalsFor: 1.4, goalsAgt: 1.5,
    players: [
      { name: 'Enner Valencia', stat: 'scored in 3 of his last 5 international appearances' },
      { name: 'Moisés Caicedo', stat: 'made 6 ball recoveries per game in his last 3 starts' },
    ],
    style: ['counter', 'direct'],
    threats: ['physicality', 'set-pieces'],
    identity: 'physical directness and counter-attacking',
    prestige: 6.5,
  },
  BEL: {
    strength: 8.2, goalsFor: 2.0, goalsAgt: 1.1,
    players: [
      { name: 'Romelu Lukaku',  stat: 'scored 4 goals in his last 5 international appearances' },
      { name: 'Kevin De Bruyne', stat: 'provided 3 assists in his last 4 starts' },
    ],
    style: ['counter', 'direct'],
    threats: ['individual-brilliance', 'physicality'],
    identity: 'individual quality and physical directness',
    prestige: 8.0,
  },
  CRO: {
    strength: 7.8, goalsFor: 1.7, goalsAgt: 1.0,
    players: [
      { name: 'Luka Modrić',   stat: 'completed 92% of passes in his last 3 matches' },
      { name: 'Ivan Perišić',  stat: 'created 5 chances in his last 4 appearances' },
    ],
    style: ['possession', 'counter'],
    threats: ['individual-brilliance', 'set-pieces'],
    identity: 'tactical discipline and midfield intelligence',
    prestige: 8.0,
  },
  CAN: {
    strength: 7.3, goalsFor: 1.7, goalsAgt: 1.2,
    players: [
      { name: 'Alphonso Davies', stat: 'provided 4 assists in his last 5 international appearances' },
      { name: 'Jonathan David',  stat: 'scored in 4 consecutive international starts' },
    ],
    style: ['direct', 'pressing'],
    threats: ['pace', 'physicality', 'wide'],
    identity: 'athletic directness and pace in wide areas',
    prestige: 7.0,
  },
  SUI: {
    strength: 7.8, goalsFor: 1.8, goalsAgt: 0.9,
    players: [
      { name: 'Granit Xhaka',  stat: 'won 74% of ground duels in his last 4 matches' },
      { name: 'Breel Embolo',  stat: 'scored in 3 of his last 5 international appearances' },
    ],
    style: ['defensive', 'counter', 'direct'],
    threats: ['physicality', 'set-pieces'],
    identity: 'resilience and collective defensive discipline',
    prestige: 7.5,
  },
  DEN: {
    strength: 7.7, goalsFor: 1.7, goalsAgt: 1.0,
    players: [
      { name: 'Christian Eriksen', stat: 'created 8 chances in his last 4 international starts' },
      { name: 'Rasmus Højlund',    stat: 'scored in 3 of his last 4 appearances' },
    ],
    style: ['pressing', 'direct'],
    threats: ['set-pieces', 'physicality', 'wide'],
    identity: 'pressing intensity and dangerous dead-ball delivery',
    prestige: 7.5,
  },
  TUR: {
    strength: 7.5, goalsFor: 1.7, goalsAgt: 1.2,
    players: [
      { name: 'Arda Güler',      stat: 'scored 3 goals in his last 4 international appearances' },
      { name: 'Hakan Çalhanoğlu', stat: 'provided 3 key passes per game in recent matches' },
    ],
    style: ['counter', 'transition'],
    threats: ['individual-brilliance', 'pace'],
    identity: 'counter-attacking flair and individual spark',
    prestige: 7.5,
  },
  AUT: {
    strength: 7.6, goalsFor: 1.9, goalsAgt: 1.1,
    players: [
      { name: 'Marcel Sabitzer',       stat: 'scored 3 goals in his last 4 appearances' },
      { name: 'Christoph Baumgartner', stat: 'scored or assisted in 3 of his last 5 starts' },
    ],
    style: ['pressing', 'transition'],
    threats: ['wide', 'set-pieces'],
    identity: 'dynamic pressing and wide attacking threat',
    prestige: 7.5,
  },
  SCO: {
    strength: 7.2, goalsFor: 1.6, goalsAgt: 1.2,
    players: [
      { name: 'Andy Robertson',  stat: 'provided 3 assists in his last 5 appearances' },
      { name: 'Scott McTominay', stat: 'scored 4 goals in his last 5 international starts' },
    ],
    style: ['pressing', 'direct'],
    threats: ['set-pieces', 'physicality'],
    identity: 'high-energy pressing and direct set-piece play',
    prestige: 7.0,
  },
  POL: {
    strength: 7.4, goalsFor: 1.6, goalsAgt: 1.2,
    players: [
      { name: 'Robert Lewandowski', stat: 'scored in 4 of his last 5 international appearances' },
      { name: 'Piotr Zieliński',    stat: 'registered 3 key passes per game in recent starts' },
    ],
    style: ['counter', 'direct'],
    threats: ['individual-brilliance', 'set-pieces'],
    identity: 'individual quality up front and physical counter',
    prestige: 7.0,
  },
  SRB: {
    strength: 7.3, goalsFor: 1.6, goalsAgt: 1.2,
    players: [
      { name: 'Dušan Vlahović',          stat: 'scored in 3 of his last 4 international starts' },
      { name: 'Sergej Milinković-Savić', stat: 'made 5 ball recoveries per game in recent matches' },
    ],
    style: ['counter', 'direct'],
    threats: ['individual-brilliance', 'physicality'],
    identity: 'powerful physicality and individual attacking spark',
    prestige: 7.0,
  },
  SVN: {
    strength: 7.1, goalsFor: 1.5, goalsAgt: 1.1,
    players: [
      { name: 'Benjamin Šeško', stat: 'scored in 4 of his last 5 club appearances' },
      { name: 'Jan Oblak',      stat: 'kept 3 clean sheets in his last 4 international starts' },
    ],
    style: ['defensive', 'counter'],
    threats: ['individual-brilliance', 'set-pieces'],
    identity: 'defensive discipline and individual quality',
    prestige: 7.0,
  },
  NGA: {
    strength: 7.5, goalsFor: 1.8, goalsAgt: 1.1,
    players: [
      { name: 'Victor Osimhen', stat: 'scored in 4 of his last 5 international appearances' },
      { name: 'Alex Iwobi',     stat: 'created 5 chances in his last 3 matches' },
    ],
    style: ['transition', 'direct'],
    threats: ['pace', 'individual-brilliance'],
    identity: 'explosive pace and direct attacking play',
    prestige: 7.5,
  },
  GHA: {
    strength: 6.8, goalsFor: 1.4, goalsAgt: 1.3,
    players: [
      { name: 'Mohammed Kudus', stat: 'scored or assisted in 3 of his last 5 appearances' },
      { name: 'Thomas Partey',  stat: 'won 70% of defensive duels in his last 3 starts' },
    ],
    style: ['counter', 'direct'],
    threats: ['pace', 'physicality'],
    identity: 'athletic pace and direct counter-attacking play',
    prestige: 6.5,
  },
  CMR: {
    strength: 6.9, goalsFor: 1.4, goalsAgt: 1.3,
    players: [
      { name: 'Vincent Aboubakar', stat: 'scored in 3 of his last 5 international appearances' },
      { name: 'André Onana',   stat: 'made 4 saves per game in his last 3 matches' },
    ],
    style: ['counter', 'direct'],
    threats: ['physicality', 'individual-brilliance'],
    identity: 'physical directness and individual attacking threat',
    prestige: 6.5,
  },
  EGY: {
    strength: 7.0, goalsFor: 1.5, goalsAgt: 1.2,
    players: [
      { name: 'Mohamed Salah',  stat: 'scored 4 goals in his last 5 international appearances' },
      { name: 'Omar Marmoush',  stat: 'scored in 3 consecutive appearances' },
    ],
    style: ['defensive', 'counter'],
    threats: ['individual-brilliance', 'set-pieces'],
    identity: 'organized defense with individual attacking quality',
    prestige: 6.5,
  },
  ALG: {
    strength: 7.1, goalsFor: 1.6, goalsAgt: 1.1,
    players: [
      { name: 'Riyad Mahrez',   stat: 'scored 3 goals in his last 5 international appearances' },
      { name: 'Youcef Atal',    stat: 'created 5 chances in his last 3 starts' },
    ],
    style: ['counter', 'technical'],
    threats: ['individual-brilliance', 'pace'],
    identity: 'technical quality and direct counter-attacking',
    prestige: 6.5,
  },
  TUN: {
    strength: 6.7, goalsFor: 1.3, goalsAgt: 1.2,
    players: [
      { name: 'Wahbi Khazri',   stat: 'scored 2 goals in his last 4 international appearances' },
      { name: 'Youssef Msakni', stat: 'created 4 chances in his last 3 starts' },
    ],
    style: ['defensive', 'counter'],
    threats: ['physicality', 'set-pieces'],
    identity: 'collective defensive discipline and set-piece threat',
    prestige: 6.5,
  },
  KOR: {
    strength: 7.2, goalsFor: 1.5, goalsAgt: 1.2,
    players: [
      { name: 'Son Heung-min',  stat: 'scored 4 goals in his last 5 international appearances' },
      { name: 'Lee Kang-in',    stat: 'created 6 chances in his last 3 starts' },
    ],
    style: ['pressing', 'counter'],
    threats: ['high-press', 'pace'],
    identity: 'organized pressing and quick transitional play',
    prestige: 7.0,
  },
  JOR: {
    strength: 6.5, goalsFor: 1.3, goalsAgt: 1.3,
    players: [
      { name: 'Yazan Al-Naimat', stat: 'scored in 2 of his last 4 appearances' },
      { name: 'Ahmad Salam',     stat: 'made 4 clearances per game in recent matches' },
    ],
    style: ['defensive', 'counter'],
    threats: ['physicality'],
    identity: 'defensive resilience and collective discipline',
    prestige: 6.0,
  },
  KSA: {
    strength: 6.9, goalsFor: 1.5, goalsAgt: 1.3,
    players: [
      { name: 'Salem Al-Dawsari',   stat: 'scored or assisted in 3 of his last 5 appearances' },
      { name: 'Mohammed Al-Owais',  stat: 'kept 2 clean sheets in his last 4 starts' },
    ],
    style: ['counter', 'direct'],
    threats: ['pace', 'individual-brilliance'],
    identity: 'pace and individual threat on the counter',
    prestige: 6.5,
  },
  IRN: {
    strength: 6.7, goalsFor: 1.3, goalsAgt: 1.3,
    players: [
      { name: 'Mehdi Taremi',   stat: 'scored in 3 of his last 5 international appearances' },
      { name: 'Sardar Azmoun',  stat: 'provided 2 assists in his last 4 starts' },
    ],
    style: ['defensive', 'counter'],
    threats: ['physicality', 'set-pieces'],
    identity: 'structured defense and physical resilience',
    prestige: 6.5,
  },
  AUS: {
    strength: 6.8, goalsFor: 1.4, goalsAgt: 1.4,
    players: [
      { name: 'Mathew Leckie',  stat: 'scored in 2 of his last 4 appearances' },
      { name: 'Mitchell Duke',  stat: 'won 64% of aerial duels in his last 3 starts' },
    ],
    style: ['direct', 'pressing'],
    threats: ['physicality', 'set-pieces'],
    identity: 'physical directness and aerial threat',
    prestige: 6.5,
  },
  CRC: {
    strength: 6.5, goalsFor: 1.2, goalsAgt: 1.4,
    players: [
      { name: 'Keysher Fuller', stat: 'scored in 2 of his last 5 international appearances' },
      { name: 'Manfred Ugalde', stat: 'scored 2 goals in his last 4 appearances' },
    ],
    style: ['defensive', 'counter'],
    threats: ['set-pieces', 'physicality'],
    identity: 'defensive discipline and physical resilience',
    prestige: 6.0,
  },
  PAN: {
    strength: 6.5, goalsFor: 1.2, goalsAgt: 1.4,
    players: [
      { name: 'Adalberto Carrasquilla', stat: 'created 4 chances in his last 3 appearances' },
      { name: 'Cecilio Waterman', stat: 'scored in 2 of his last 4 starts' },
    ],
    style: ['defensive', 'counter'],
    threats: ['physicality', 'set-pieces'],
    identity: 'organized defense and physical play',
    prestige: 6.0,
  },
  HON: {
    strength: 6.2, goalsFor: 1.1, goalsAgt: 1.5,
    players: [
      { name: 'Alberth Elis',   stat: 'scored in 2 of his last 4 international appearances' },
      { name: 'Romell Quioto',  stat: 'created 3 chances in his last 3 starts' },
    ],
    style: ['defensive', 'counter'],
    threats: ['physicality', 'pace'],
    identity: 'physical resilience and direct counter-play',
    prestige: 6.0,
  },
  VEN: {
    strength: 7.0, goalsFor: 1.5, goalsAgt: 1.3,
    players: [
      { name: 'Salomón Rondón', stat: 'scored in 3 of his last 5 appearances' },
      { name: 'Yangel Herrera', stat: 'made 4 ball recoveries per game in recent matches' },
    ],
    style: ['counter', 'direct'],
    threats: ['pace', 'physicality'],
    identity: 'physical directness and transitional pace',
    prestige: 6.5,
  },
  PAR: {
    strength: 6.8, goalsFor: 1.4, goalsAgt: 1.3,
    players: [
      { name: 'Miguel Almirón',  stat: 'scored or assisted in 3 of his last 5 appearances' },
      { name: 'Gustavo Gómez',   stat: 'made 5 clearances per game in his last 3 starts' },
    ],
    style: ['defensive', 'counter'],
    threats: ['physicality', 'set-pieces'],
    identity: 'defensive shape and physical resilience',
    prestige: 6.0,
  },
  CHI: {
    strength: 6.7, goalsFor: 1.4, goalsAgt: 1.3,
    players: [
      { name: 'Alexis Sánchez',  stat: 'scored in 3 of his last 5 international appearances' },
      { name: 'Arturo Vidal',    stat: 'made 4 interceptions per game in his last 3 starts' },
    ],
    style: ['pressing', 'direct'],
    threats: ['individual-brilliance', 'wide'],
    identity: 'pressing intensity and individual quality',
    prestige: 6.5,
  },
  PER: {
    strength: 6.9, goalsFor: 1.4, goalsAgt: 1.3,
    players: [
      { name: 'André Carrillo',  stat: 'scored or assisted in 3 of his last 5 starts' },
      { name: 'Christian Cueva', stat: 'created 4 chances in his last 3 appearances' },
    ],
    style: ['counter', 'technical'],
    threats: ['individual-brilliance', 'pace'],
    identity: 'technical quality and counter-attacking',
    prestige: 6.5,
  },
}

const FALLBACK: TeamDef = {
  strength: 7.0, goalsFor: 1.5, goalsAgt: 1.3,
  players: [
    { name: 'Team captain', stat: 'scored in 3 of their last 5 appearances' },
    { name: 'Key playmaker', stat: 'created 5 chances in their last 3 starts' },
  ],
  style: ['counter', 'direct'],
  threats: ['physicality'],
  identity: 'organized and physically direct',
  prestige: 6.5,
}

function teamDef(shortCode: string): TeamDef {
  return TEAM_DB[shortCode.toUpperCase()] ?? FALLBACK
}

// ─── Form generation ─────────────────────────────────────────

function genForm(strength: number, rand: () => number): FormResult[] {
  const winP  = 0.15 + (strength / 10) * 0.57
  const drawP = 0.18
  return Array.from({ length: 5 }, (): FormResult => {
    const r = rand()
    if (r < winP)          return 'W'
    if (r < winP + drawP)  return 'D'
    return 'L'
  })
}

// ─── Key players ─────────────────────────────────────────────

function genKeyPlayers(
  homeTeam: Team, awayTeam: Team,
  hd: TeamDef, ad: TeamDef,
  rand: () => number,
): InsightBullet[] {
  // Always consume 2 rand() calls for deterministic PRNG state,
  // regardless of whether either team qualifies for a player reference.
  const hRoll = rand()
  const aRoll = rand()

  const bullets: InsightBullet[] = []

  // Only reference a player when:
  //   1. The team is a known entry in TEAM_DB (not the generic FALLBACK).
  //   2. Team prestige >= 7.0 — avoids uncertain references for the
  //      least-known national sides where player relevance is harder to verify.
  // When a team doesn't qualify, the section is simply omitted rather than
  // filled with a fabricated or low-confidence reference.

  const homeIsKnown = homeTeam.shortCode.toUpperCase() in TEAM_DB
  const awayIsKnown = awayTeam.shortCode.toUpperCase() in TEAM_DB

  if (homeIsKnown && hd.prestige >= 7.0 && hd.players.length > 0) {
    const hp = hd.players[Math.floor(hRoll * hd.players.length)]
    bullets.push({
      text:      `${homeTeam.name}'s ${hp.name} ${hp.stat}`,
      highlight: 'positive',
    })
  }

  if (awayIsKnown && ad.prestige >= 7.0 && ad.players.length > 0) {
    const ap = ad.players[Math.floor(aRoll * ad.players.length)]
    bullets.push({
      text:      `${awayTeam.name}'s ${ap.name} ${ap.stat}`,
      highlight: 'positive',
    })
  }

  return bullets
}

// ─── Head-to-head ─────────────────────────────────────────────

function genH2H(
  homeTeam: Team, awayTeam: Team,
  hd: TeamDef, ad: TeamDef,
  rand: () => number,
): InsightBullet[] {
  const winP = hd.strength / (hd.strength + ad.strength)
  let homeWins = 0
  let draws    = 0

  for (let i = 0; i < 5; i++) {
    const r = rand()
    if (r < winP * 0.82)             homeWins++
    else if (r < winP * 0.82 + 0.16) draws++
  }
  const awayWins = 5 - homeWins - draws

  if (homeWins >= 3) {
    return [{ text: `${homeTeam.name} won ${homeWins} of the last 5 meetings`, highlight: 'positive' }]
  }
  if (awayWins >= 3) {
    return [{ text: `${awayTeam.name} won ${awayWins} of the last 5 head-to-head meetings`, highlight: 'neutral' }]
  }
  if (draws >= 2) {
    return [{ text: `${draws} of the last 5 meetings ended level — a closely matched rivalry`, highlight: 'neutral' }]
  }
  const leader = homeWins >= awayWins ? homeTeam.name : awayTeam.name
  const wins   = Math.max(homeWins, awayWins)
  return [{ text: `${leader} edged ${wins} of the last 5 encounters`, highlight: 'neutral' }]
}

// ─── Tactical insights ────────────────────────────────────────

interface TacticalCandidate {
  category:  TacticalCategory
  relevance: number
  text:      string
  highlight: TacticalInsight['highlight']
}

function genTacticalInsights(
  homeTeam: Team, awayTeam: Team,
  hd: TeamDef, ad: TeamDef,
  rand: () => number,
): TacticalInsight[] {
  const candidates: TacticalCandidate[] = []

  const homePresses    = hd.style.includes('pressing')
  const awayPresses    = ad.style.includes('pressing')
  const homePossession = hd.style.includes('possession')
  const awayPossession = ad.style.includes('possession')
  const homeTransition = hd.style.includes('transition')
  const awayTransition = ad.style.includes('transition')
  const homeDefensive  = hd.style.includes('defensive') || hd.style.includes('counter')
  const awayDefensive  = ad.style.includes('defensive') || ad.style.includes('counter')
  const homeWide       = hd.threats.includes('wide')
  const awayWide       = ad.threats.includes('wide')
  const homeSetPieces  = hd.threats.includes('set-pieces')
  const awaySetPieces  = ad.threats.includes('set-pieces')
  const homePace       = hd.threats.includes('pace')
  const awayPace       = ad.threats.includes('pace')
  const homeHighLine   = homePresses && hd.threats.includes('high-press')
  const awayHighLine   = awayPresses && ad.threats.includes('high-press')
  const homeIndividual = hd.threats.includes('individual-brilliance')
  const awayIndividual = ad.threats.includes('individual-brilliance')
  const homePhysical   = hd.threats.includes('physicality')
  const awayPhysical   = ad.threats.includes('physicality')
  const homeTechnical  = hd.style.includes('technical') || hd.style.includes('possession')
  const awayTechnical  = ad.style.includes('technical') || ad.style.includes('possession')
  const strengthDiff   = Math.abs(hd.strength - ad.strength)

  // 1. Pressing dynamics
  if (homePresses && awayPossession) {
    candidates.push({
      category: 'pressing', relevance: 0.88,
      text: pick(rand, [
        `${homeTeam.name}'s high press will look to disrupt ${awayTeam.name}'s build-up rhythm — their ability to circulate under pressure in the first third will be tested repeatedly.`,
        `${homeTeam.name} actively look to trigger turnovers high up the pitch, forcing ${awayTeam.name} away from their preferred short-passing build-up from the back.`,
      ]),
      highlight: 'neutral',
    })
  } else if (awayPresses && homePossession) {
    candidates.push({
      category: 'pressing', relevance: 0.88,
      text: pick(rand, [
        `${awayTeam.name}'s pressing intensity will test ${homeTeam.name}'s composure in possession — how they handle pressure in deep areas will largely shape the game's early tempo.`,
        `${awayTeam.name} press aggressively and look to win possession in dangerous areas — ${homeTeam.name} must circulate quickly to escape the press and find space.`,
      ]),
      highlight: 'neutral',
    })
  } else if (homePresses && awayPresses) {
    candidates.push({
      category: 'pressing', relevance: 0.75,
      text: pick(rand, [
        `Both sides press with genuine intensity — the team that wins second balls and recovers their defensive shape quickest will control the territorial battle.`,
        `Relentless pressing from both sides makes energy management crucial — whichever team maintains their press longest into the second half will gain a decisive positional advantage.`,
      ]),
      highlight: 'neutral',
    })
  }

  // 2. Transition dynamics
  if (homeTransition && awayPossession) {
    candidates.push({
      category: 'transition', relevance: 0.85,
      text: pick(rand, [
        `${homeTeam.name}'s direct transition game is built to exploit the space behind ${awayTeam.name}'s defensive line — the first five seconds after a turnover are a critical battleground.`,
        `${homeTeam.name} thrive in rapid transitions — ${awayTeam.name}'s possession-heavy approach leaves them vulnerable to the counter whenever they lose the ball high.`,
      ]),
      highlight: 'warning',
    })
  } else if (awayTransition && homePossession) {
    candidates.push({
      category: 'transition', relevance: 0.85,
      text: pick(rand, [
        `${awayTeam.name}'s transition speed is a primary weapon — any moment ${homeTeam.name} overcommit forward, the counter-attack becomes a genuine structural threat.`,
        `${awayTeam.name} thrive in direct transitions — ${homeTeam.name}'s fullback positioning during attacking phases must be carefully managed to avoid exposing the channels.`,
      ]),
      highlight: 'warning',
    })
  } else if (homeTransition && awayTransition) {
    candidates.push({
      category: 'transition', relevance: 0.78,
      text: pick(rand, [
        `Both teams are built to hurt opponents on the counter — the side that protects transitional moments most efficiently will likely control the overall defensive balance.`,
        `Transitional phases will define this contest — both sides carry direct runners and pace capable of punishing any defensive lapse in exposed positions.`,
      ]),
      highlight: 'neutral',
    })
  }

  // 3. Wide threats
  if (homeWide && awayWide) {
    candidates.push({
      category: 'wide-threats', relevance: 0.72,
      text: pick(rand, [
        `Wide channels are a key arena — both sides carry genuine threat down the flanks, and the wing duels will determine who controls the final third and the delivery quality into the box.`,
        `Fullback battles could shape this fixture — both teams rely on wide runners to stretch backlines, and the team that wins those wide duels will create the cleaner central opportunities.`,
      ]),
      highlight: 'neutral',
    })
  } else if (homeWide) {
    candidates.push({
      category: 'wide-threats', relevance: 0.68,
      text: pick(rand, [
        `${homeTeam.name}'s wide game is a primary weapon — their direct runners and overlapping fullback runs will look to stretch ${awayTeam.name}'s defensive shape and create crossing situations.`,
        `${homeTeam.name} generate a significant portion of their chances through wide areas — ${awayTeam.name}'s defensive width will be tested throughout.`,
      ]),
      highlight: 'neutral',
    })
  } else if (awayWide) {
    candidates.push({
      category: 'wide-threats', relevance: 0.68,
      text: pick(rand, [
        `${awayTeam.name} build much of their attack through wide positions — their ability to isolate ${homeTeam.name}'s fullbacks will be a recurring theme throughout.`,
        `${awayTeam.name}'s wide threats will demand consistent defensive discipline from ${homeTeam.name} — any positional drift could lead to dangerous crossing situations.`,
      ]),
      highlight: 'neutral',
    })
  }

  // 4. Set pieces
  if (homeSetPieces) {
    candidates.push({
      category: 'set-pieces', relevance: 0.65,
      text: pick(rand, [
        `${homeTeam.name} rank among the tournament's most dangerous sides at set pieces — corners and free kicks in advanced areas represent a reliable secondary route to goal in tight games.`,
        `Dead-ball situations favor ${homeTeam.name} — their delivery quality and movement from set plays has been a consistent attacking thread throughout this campaign.`,
      ]),
      highlight: 'positive',
    })
  }
  if (awaySetPieces) {
    candidates.push({
      category: 'set-pieces', relevance: 0.65,
      text: pick(rand, [
        `${awayTeam.name}'s set-piece delivery has been a significant threat this campaign — their aerial presence from dead balls requires specific defensive organization from ${homeTeam.name}.`,
        `${awayTeam.name} have scored or created clear danger from set plays consistently — ${homeTeam.name}'s defensive zonal structure will be tested when the ball is stopped.`,
      ]),
      highlight: 'warning',
    })
  }

  // 5. Defensive shape
  if (homeDefensive && !awayDefensive) {
    candidates.push({
      category: 'defensive-shape', relevance: 0.76,
      text: pick(rand, [
        `${homeTeam.name}'s defensive organization is their identity — a disciplined compact block makes it genuinely difficult for even quality attacks to find openings through central areas.`,
        `${homeTeam.name} defend in numbers and with structure — ${awayTeam.name} will need patience and precision to unlock their organized defensive shape and create high-quality chances.`,
      ]),
      highlight: 'neutral',
    })
  } else if (awayDefensive && !homeDefensive) {
    candidates.push({
      category: 'defensive-shape', relevance: 0.76,
      text: pick(rand, [
        `${awayTeam.name}'s defensive shape is exceptionally well-drilled — ${homeTeam.name} should expect a low block designed to frustrate and absorb pressure before hitting on the counter.`,
        `${awayTeam.name} are built to defend compactly and counter — their defensive discipline has frustrated stronger opponents throughout this tournament.`,
      ]),
      highlight: 'neutral',
    })
  } else if (homeDefensive && awayDefensive) {
    candidates.push({
      category: 'defensive-shape', relevance: 0.70,
      text: pick(rand, [
        `Both teams prioritize defensive organization above all — expect a cautious, structured contest where a single moment of set-piece quality or individual error may settle the tie.`,
        `Neither side gives up space willingly — this fixture requires patience, and the team that best exploits a dead-ball situation or moment of transition may claim the decisive goal.`,
      ]),
      highlight: 'neutral',
    })
  }

  // 6. Counter-attack trigger
  if (homeDefensive && awayPossession) {
    candidates.push({
      category: 'counterattack', relevance: 0.82,
      text: pick(rand, [
        `${homeTeam.name}'s counter-attacking system is specifically designed to exploit ${awayTeam.name}'s attacking commitments — rapid transitions behind the defensive line are their primary goal-scoring mechanism.`,
        `${homeTeam.name} will invite ${awayTeam.name}'s pressure and look to exploit the space left by attacking fullbacks — the transition moment is where they create their most dangerous situations.`,
      ]),
      highlight: 'warning',
    })
  } else if (awayDefensive && homePossession) {
    candidates.push({
      category: 'counterattack', relevance: 0.82,
      text: pick(rand, [
        `${awayTeam.name} will absorb ${homeTeam.name}'s possession and look to break with pace and directness — their counter-attacking game is most effective when they can entice opponents into overcommitting forward.`,
        `${awayTeam.name}'s counter-attack is activated by their defensive discipline — ${homeTeam.name} must stay structurally compact even while dominating the ball.`,
      ]),
      highlight: 'warning',
    })
  }

  // 7. High line vulnerability
  if (awayHighLine && homePace) {
    candidates.push({
      category: 'high-line', relevance: 0.73,
      text: pick(rand, [
        `${awayTeam.name}'s aggressive defensive line compresses space effectively but creates a structural vulnerability — ${homeTeam.name}'s pace in forward areas will target the space in behind with direct runs.`,
        `${awayTeam.name}'s high line is a double-edged tactic — their compactness is effective but can be exposed by ${homeTeam.name}'s quick forwards looking to run in behind.`,
      ]),
      highlight: 'warning',
    })
  }
  if (homeHighLine && awayPace) {
    candidates.push({
      category: 'high-line', relevance: 0.73,
      text: pick(rand, [
        `${homeTeam.name}'s aggressive press and advanced defensive line offers a compelling forward platform — but ${awayTeam.name}'s pace-merchants will look to exploit the space left in behind repeatedly.`,
        `${homeTeam.name} defend aggressively high up the pitch — ${awayTeam.name}'s direct runners will test their defensive line and offside structure throughout the game.`,
      ]),
      highlight: 'warning',
    })
  }

  // 8. Midfield battle
  if (strengthDiff < 0.5) {
    candidates.push({
      category: 'midfield-control', relevance: 0.65,
      text: pick(rand, [
        `The battle in the central third will likely define this game — in an evenly matched fixture, control between the lines determines territory, rhythm, and ultimately the quality of chances created.`,
        `Midfield dominance is often the decisive factor in closely contested fixtures — whichever side controls the transition zone will most frequently set up goal-scoring positions.`,
      ]),
      highlight: 'neutral',
    })
  }

  // 9. Individual brilliance
  if (homeIndividual && awayIndividual) {
    candidates.push({
      category: 'key-duel', relevance: 0.70,
      text: pick(rand, [
        `Both teams carry players capable of deciding games through individual quality alone — a moment of brilliance from either side's key player may ultimately settle what could be a tightly contested encounter.`,
        `When tactical systems are closely matched, individual genius often separates the sides — this matchup features elite players on both ends capable of creating something from very little.`,
      ]),
      highlight: 'positive',
    })
  } else if (homeIndividual) {
    candidates.push({
      category: 'key-duel', relevance: 0.62,
      text: pick(rand, [
        `${homeTeam.name}'s capacity for individual moments is the wild card in this fixture — a single inspired performance from their key player could make tactical preparation irrelevant.`,
      ]),
      highlight: 'positive',
    })
  } else if (awayIndividual) {
    candidates.push({
      category: 'key-duel', relevance: 0.62,
      text: pick(rand, [
        `${awayTeam.name} carry the threat of the unexpected — their ability to produce individual moments in tight games has been a consistent feature of their tournament campaign.`,
      ]),
      highlight: 'positive',
    })
  }

  // 10. Physicality vs technical
  if (homePhysical && awayTechnical) {
    candidates.push({
      category: 'key-duel', relevance: 0.60,
      text: pick(rand, [
        `${homeTeam.name}'s physical directness meets ${awayTeam.name}'s technical precision — which style prevails in midfield duels will shape the game's character and ultimately the space created in the final third.`,
        `The physical-technical contrast is pronounced here — ${homeTeam.name}'s aerial presence and direct aggression will look to disrupt ${awayTeam.name}'s preferred combination play in tight spaces.`,
      ]),
      highlight: 'neutral',
    })
  } else if (awayPhysical && homeTechnical) {
    candidates.push({
      category: 'key-duel', relevance: 0.60,
      text: pick(rand, [
        `${awayTeam.name}'s physical approach will look to unsettle ${homeTeam.name}'s technical game — second balls and aerial duels become a tactical battleground in this physical vs. technical contrast.`,
        `The styles here create an interesting tactical narrative — ${homeTeam.name}'s combination play must negotiate ${awayTeam.name}'s physical intensity in the central areas.`,
      ]),
      highlight: 'neutral',
    })
  }

  // 11. Finishing efficiency
  if (hd.goalsFor > 2.3) {
    candidates.push({
      category: 'finishing', relevance: 0.62,
      text: pick(rand, [
        `${homeTeam.name}'s clinical finishing has been a standout feature — they convert limited chances into decisive moments, which makes defensive errors disproportionately costly against them.`,
      ]),
      highlight: 'positive',
    })
  } else if (ad.goalsFor > 2.3) {
    candidates.push({
      category: 'finishing', relevance: 0.62,
      text: pick(rand, [
        `${awayTeam.name}'s conversion rate has been exceptional — their ability to punish half-chances with clinical finishing demands a clean sheet of defensive concentration from ${homeTeam.name}.`,
      ]),
      highlight: 'warning',
    })
  }

  // Sort by relevance, apply density based on prestige
  candidates.sort((a, b) => b.relevance - a.relevance)
  const avgPrestige = (hd.prestige + ad.prestige) / 2
  const count = avgPrestige >= 8.5 ? 4 : avgPrestige >= 7.5 ? 3 : 2

  return candidates.slice(0, count).map(c => ({
    category:  c.category,
    text:      c.text,
    highlight: c.highlight,
  }))
}

// ─── Match personality ────────────────────────────────────────

const PERSONALITY_LABELS: Record<MatchPersonality, string> = {
  'explosive':       'Explosive',
  'tactical-battle': 'Tactical',
  'defensive-grind': 'Defensive',
  'upset-alert':     'Upset Alert',
  'star-power':      'Star Power',
  'balanced':        'Open Game',
}

function genPersonality(
  hd: TeamDef, ad: TeamDef,
  homeForm: FormResult[], awayForm: FormResult[],
  isKnockout: boolean,
): MatchPersonality {
  const bothHighScore    = hd.goalsFor > 2.0 && ad.goalsFor > 2.0
  const bothDefStyle     = (hd.style.includes('defensive') || hd.style.includes('counter'))
                        && (ad.style.includes('defensive') || ad.style.includes('counter'))
  const bothTransition   = hd.style.includes('transition') && ad.style.includes('transition')
  const bothIndividual   = hd.threats.includes('individual-brilliance') && ad.threats.includes('individual-brilliance')
  const bothPossession   = hd.style.includes('possession') || ad.style.includes('possession')
  const hasPressContrast = (hd.style.includes('pressing') && ad.style.includes('possession'))
                        || (hd.style.includes('possession') && ad.style.includes('pressing'))
  const strengthGap      = Math.abs(hd.strength - ad.strength)
  const avgStrength      = (hd.strength + ad.strength) / 2

  // Upset: meaningful strength gap but underdog has form
  const underdogStrength = Math.min(hd.strength, ad.strength)
  const favoriteStrength = Math.max(hd.strength, ad.strength)
  if (favoriteStrength - underdogStrength >= 1.4 && underdogStrength >= 7.0) {
    const underdogForm = hd.strength < ad.strength ? homeForm : awayForm
    if (underdogForm.filter(r => r === 'W').length >= 2) return 'upset-alert'
  }

  // Knockout adds tactical caution to close matchups
  if (isKnockout && strengthGap < 0.8) return 'tactical-battle'

  // Star power: both carry individual quality at elite level
  if (bothIndividual && avgStrength >= 8.5) return 'star-power'

  // Explosive: both attack-minded + mutual transition threat
  if (bothHighScore && bothTransition) return 'explosive'

  // Defensive grind: both defensive-oriented
  if (bothDefStyle || (hd.goalsAgt < 0.9 && ad.goalsAgt < 0.9 && !bothHighScore)) {
    return 'defensive-grind'
  }

  // Tactical battle: possession + pressing contrast, or both possession-oriented
  if (bothPossession || hasPressContrast) return 'tactical-battle'

  // General explosive case
  if (bothHighScore) return 'explosive'

  return 'balanced'
}

// ─── Volatility score ─────────────────────────────────────────

function genVolatility(
  hd: TeamDef, ad: TeamDef,
  homeForm: FormResult[], awayForm: FormResult[],
): number {
  const strengthGap = Math.abs(hd.strength - ad.strength)
  const avgGoals    = (hd.goalsFor + ad.goalsFor) / 2

  const formVariance = (f: FormResult[]) => Math.min(
    f.filter(r => r === 'W').length,
    f.filter(r => r === 'L').length,
  )
  const totalFormVar = formVariance(homeForm) + formVariance(awayForm)

  const closeness   = Math.max(0, (10 - strengthGap * 2)) / 10
  const goalScore   = Math.min(1, avgGoals / 3)
  const varScore    = Math.min(1, totalFormVar / 4)

  const raw = closeness * 4 + goalScore * 3 + varScore * 3
  return Math.min(10, Math.max(0, Math.round(raw * 10) / 10))
}

// ─── Narrative engine ─────────────────────────────────────────

const RIVALRIES: Record<string, { headline: string; body: string }> = {
  'ENG:ARG': {
    headline: 'History Casts a Long Shadow',
    body: `England vs Argentina is football's most psychologically loaded fixture. From Maradona's genius to Beckham's redemption arc — this matchup arrives with layers of narrative that transcend the immediate stakes on the scoreboard.`,
  },
  'ARG:ENG': {
    headline: 'History Casts a Long Shadow',
    body: `Argentina vs England carries the emotional weight of football's most contested rivalry. Generations of defining moments create an atmosphere that no other international fixture quite replicates — players on both sides know exactly what this means.`,
  },
  'BRA:ARG': {
    headline: 'The Superclásico de las Américas',
    body: `Brazil versus Argentina: football's most charged continental rivalry. Continental dominance, national pride, and decades of defining moments all converge on a fixture that never needs additional stakes to feel monumental.`,
  },
  'ARG:BRA': {
    headline: 'The Superclásico de las Américas',
    body: `Argentina versus Brazil: the heartbeat of South American football. Pride, bragging rights, and the claim to continental supremacy are always present beneath the surface — this is a fixture history loads before a ball is kicked.`,
  },
  'GER:ENG': {
    headline: 'A Rivalry Built on Defining Moments',
    body: `Germany versus England is a fixture that has shaped both nations' football identities. Penalty heartbreak, tournament exits, and golden moments — both sets of supporters approach this game carrying the psychological residue of past encounters.`,
  },
  'ENG:GER': {
    headline: 'A Rivalry Built on Defining Moments',
    body: `England versus Germany — a fixture that has written some of the tournament's most dramatic chapters. Both nations arrive with respect, rivalry, and the weight of a shared history that always makes this more than just a football match.`,
  },
  'FRA:BRA': {
    headline: 'When Worlds Collide',
    body: `France and Brazil represent two of football's most distinct philosophies — technical European control meeting South American flair. When these sides meet at a World Cup, the match carries the weight of global football's competing identities.`,
  },
  'BRA:FRA': {
    headline: 'When Worlds Collide',
    body: `Brazil and France at a World Cup is football at its grandest — two nations who have shaped the game's history meeting in a fixture that captures the sport's global breadth. The tactical contrast only adds to the occasion.`,
  },
}

const STAR_NARRATIVES: Record<string, { headline: string; body: string }> = {
  ARG: {
    headline: "Messi's Defining Tournament",
    body: `Lionel Messi is the defending World Cup champion — but his presence still bends the psychological reality of every match he enters. The world watches with a specific kind of attention that no other player commands, and opponents know it.`,
  },
  POR: {
    headline: "Ronaldo's Final Chapter",
    body: `Cristiano Ronaldo at a World Cup remains one of football's great final-chapter narratives. Whether he is chasing records or simply competing, his presence creates a pressure — on himself, on his team, on his opponents — that no statistic can fully capture.`,
  },
  CRO: {
    headline: "Modrić's Timeless Intelligence",
    body: `Luka Modrić defies conventional footballing age — his reading of the game and quality in high-pressure matches remains arguably unmatched at international level. Croatia with Modrić at his best is a fundamentally different proposition.`,
  },
}

function genNarrative(
  homeTeam: Team, awayTeam: Team,
  hd: TeamDef, ad: TeamDef,
  homeForm: FormResult[], awayForm: FormResult[],
  isKnockout: boolean,
): NarrativeInsight | null {
  const avgPrestige = (hd.prestige + ad.prestige) / 2
  if (avgPrestige < 7.0) return null

  interface Candidate { priority: number; narrative: NarrativeInsight }
  const candidates: Candidate[] = []

  // Classic rivalry — highest priority
  const rivalryKey = `${homeTeam.shortCode}:${awayTeam.shortCode}`
  if (RIVALRIES[rivalryKey]) {
    candidates.push({ priority: 11, narrative: RIVALRIES[rivalryKey] })
  }

  // Both elite sides
  if (hd.prestige >= 9.0 && ad.prestige >= 9.0) {
    candidates.push({
      priority: 10,
      narrative: {
        headline: 'A World-Class Encounter',
        body: `When two of football's elite nations meet at a World Cup, the occasion carries its own gravity. Players who have dedicated careers to reaching this moment arrive knowing that opportunities like this are finite — and that the margin between immortality and regret is often a single chance.`,
      },
    })
  }

  // Star player narrative
  if (STAR_NARRATIVES[homeTeam.shortCode] && hd.prestige >= 8.0) {
    candidates.push({ priority: 8.5, narrative: STAR_NARRATIVES[homeTeam.shortCode] })
  }
  if (STAR_NARRATIVES[awayTeam.shortCode] && ad.prestige >= 8.0) {
    candidates.push({ priority: 8.5, narrative: STAR_NARRATIVES[awayTeam.shortCode] })
  }

  // Knockout pressure
  if (isKnockout) {
    candidates.push({
      priority: 8,
      narrative: {
        headline: 'The Knockout Equation',
        body: `Knockout football transforms the psychological landscape. Tactical systems that have worked in the group stage encounter a new variable: the irreversibility of a single mistake. Teams that have looked fluid may tighten; those that have struggled may find clarity of purpose at the worst possible time for their opponents.`,
      },
    })
  }

  // Underdog story
  const strengthGap    = Math.abs(hd.strength - ad.strength)
  const underdogTeam   = hd.strength < ad.strength ? homeTeam : awayTeam
  const favoriteTeam   = hd.strength < ad.strength ? awayTeam : homeTeam
  const underdogForm   = hd.strength < ad.strength ? homeForm : awayForm
  const underdogWins   = underdogForm.filter(r => r === 'W').length
  if (strengthGap >= 1.2 && underdogWins >= 2) {
    candidates.push({
      priority: 9,
      narrative: {
        headline: 'The Underdog Has a Voice',
        body: `${underdogTeam.name} arrive not to make up the numbers — their campaign has demonstrated the capacity to disrupt and defeat. ${favoriteTeam.name} carry the weight of expectation, but tournament football has a long history of rewarding collective spirit over individual quality.`,
      },
    })
  }

  // Perfect form momentum
  const homeWins = homeForm.filter(r => r === 'W').length
  const awayWins = awayForm.filter(r => r === 'W').length
  if (homeWins === 5) {
    candidates.push({
      priority: 7,
      narrative: {
        headline: `${homeTeam.name}'s Unbroken Run`,
        body: `${homeTeam.name} arrive on an unbroken winning run — form and belief combining into the kind of momentum that historically proves difficult to arrest. Confidence in tournament football compounds with each result, and they carry it in genuine abundance.`,
      },
    })
  } else if (awayWins === 5) {
    candidates.push({
      priority: 7,
      narrative: {
        headline: `${awayTeam.name}'s Momentum`,
        body: `${awayTeam.name} arrive in exceptional form — an unbeaten run that amplifies their belief at exactly the right moment. Confidence in tournament football is a currency that compounds, and they carry it in full.`,
      },
    })
  }

  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.priority - a.priority)
  return candidates[0].narrative
}

// ─── Coaching hint ────────────────────────────────────────────

function genCoachingHint(
  personality:  MatchPersonality,
  hd:           TeamDef,
  ad:           TeamDef,
  isKnockout:   boolean,
  upsetAlert:   boolean,
  rand:         () => number,
): string | null {
  const r = rand()  // Always consume one rand() for deterministic PRNG state
  const avgPrestige = (hd.prestige + ad.prestige) / 2
  if (avgPrestige < 6.5) return null

  const hints: Record<MatchPersonality, string[]> = {
    explosive: [
      'High-scoring encounters between attack-minded sides are often decided by the first goal — early momentum tends to be self-reinforcing when both teams are built to attack.',
      'When both teams score freely, individual error or a single moment of brilliance rather than tactical structure tends to be the decisive factor.',
      'Open games between transition-oriented sides reward first-goal advantage disproportionately — the team that gets their nose ahead often dictates the tempo of the second half.',
    ],
    'tactical-battle': [
      'Disciplined, possession-oriented sides often generate their best chances late in the second half, after patient build-up has worn down defensive shape and concentration.',
      'In possession-based contests, the halftime score can be misleading — teams that adapt their pressing structure at the break often reshape the game\'s second chapter entirely.',
      'Tactical battles reward patience — the team that forces the first mistake from set play or transition moment often converts it into the game\'s decisive moment.',
    ],
    'defensive-grind': [
      'When two compact defensive units meet, dead-ball situations often prove decisive — patience and a single moment of set-piece quality can separate the sides.',
      'Low-scoring fixtures between organized defensive sides are frequently decided by which team loses composure first — defensive discipline through frustration becomes a crucial variable.',
      'In tight defensive contests, the team that limits half-chances and doesn\'t chase the game after going behind often earns the better result.',
    ],
    'upset-alert': [
      'Form tables and strength ratings offer context, but tournament football consistently rewards teams that are organized, motivated, and capable of defending and holding a lead.',
      'The underdog label counts for less than it appears — collective defensive shape and a defined tactical game plan have repeatedly toppled higher-ranked sides at this level.',
      'Surprise results in this sport are rarely flukes — they tend to reflect tactical matchup advantages that aggregate statistics don\'t fully capture.',
    ],
    'star-power': [
      'Individual quality can override tactical systems — a single moment of brilliance from a world-class player can make prior analysis irrelevant in an instant.',
      'In fixtures defined by star players, the battle of when and where they receive the ball often determines the outcome more than collective tactical structure.',
      'When individual brilliance is a factor, the psychological battle matters — the team whose star player is most affected by defensive attention often loses the individual duel that defines the match.',
    ],
    balanced: [
      'This matchup is genuinely open — the team that adapts most effectively to the game\'s evolving tactical context rather than rigidly following pre-match plans often wins.',
      'In evenly matched fixtures, substitution timing and the impact of fresh legs can shift momentum decisively in the final 20 minutes.',
      'Both teams carry realistic paths to the result — predicting this requires weighing not just quality but form, tactical matchup dynamics, and moments that no model can anticipate.',
    ],
  }

  if (isKnockout) {
    hints['tactical-battle'].push('Knockout matches between evenly matched sides often become increasingly cautious after halftime — the fear of conceding grows relative to the urgency to score.')
    hints.balanced.push('Knockout football compresses risk tolerance — teams sacrifice attacking ambition to preserve defensive security, making early goals disproportionately influential.')
  }

  if (upsetAlert) {
    hints['upset-alert'].push('This matchup may be more balanced than rankings suggest — contextual form often reveals gaps that aggregate strength differences mask entirely.')
  }

  const arr = hints[personality]
  return arr[Math.floor(r * arr.length)]
}

// ─── Dynamic section ordering ─────────────────────────────────

function genSectionOrder(
  personality:  MatchPersonality,
  hasNarrative: boolean,
  avgPrestige:  number,
): SectionKey[] {
  const includeCoaching = avgPrestige >= 6.8

  const filter = (keys: (SectionKey | false)[]): SectionKey[] =>
    keys.filter((k): k is SectionKey =>
      k !== false &&
      !(k === 'narrative' && !hasNarrative) &&
      !(k === 'coaching-hint' && !includeCoaching),
    )

  switch (personality) {
    case 'explosive':
      return filter(['key-players', 'form', 'tactical', 'narrative', 'head-to-head', 'coaching-hint'])
    case 'tactical-battle':
      return filter(['tactical', 'form', 'narrative', 'key-players', 'head-to-head', 'coaching-hint'])
    case 'defensive-grind':
      return filter(['form', 'tactical', 'head-to-head', 'narrative', 'key-players', 'coaching-hint'])
    case 'upset-alert':
      return filter(['narrative', 'form', 'tactical', 'coaching-hint', 'key-players', 'head-to-head'])
    case 'star-power':
      return filter(['key-players', 'narrative', 'form', 'tactical', 'head-to-head', 'coaching-hint'])
    case 'balanced':
    default:
      return filter(['form', 'tactical', 'narrative', 'key-players', 'head-to-head', 'coaching-hint'])
  }
}

// ─── Edge · confidence · upset · analyst note ────────────────

function genEdgeMeta(
  homeTeam: Team, awayTeam: Team,
  hd: TeamDef, ad: TeamDef,
  homeForm: FormResult[], awayForm: FormResult[],
): Pick<MatchInsights, 'edge' | 'confidence' | 'upsetAlert' | 'edgeNote'> {
  const formPts = (f: FormResult[]) =>
    f.reduce((s, r) => s + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0)

  const homeScore = hd.strength * 0.7 + (formPts(homeForm) / 15) * 10 * 0.3
  const awayScore = ad.strength * 0.7 + (formPts(awayForm) / 15) * 10 * 0.3
  const diff      = homeScore - awayScore

  const homeFormPts = formPts(homeForm)
  const awayFormPts = formPts(awayForm)

  let team:     MatchInsights['edge']['team']
  let teamName: string
  let strength: 'clear' | 'slight'

  if (Math.abs(diff) < 0.5) {
    team = 'draw'; teamName = 'Either Side'; strength = 'slight'
  } else if (diff > 0) {
    team = 'home'; teamName = homeTeam.name; strength = diff >= 1.5 ? 'clear' : 'slight'
  } else {
    team = 'away'; teamName = awayTeam.name; strength = Math.abs(diff) >= 1.5 ? 'clear' : 'slight'
  }

  const highVariance = Math.max(hd.goalsFor, ad.goalsFor) > 2.2
  let confidence: MatchInsights['confidence']
  if (strength === 'clear' && !highVariance)               confidence = 'high'
  else if (strength === 'slight' || Math.abs(diff) < 1.0)  confidence = 'low'
  else                                                     confidence = 'medium'

  const upsetAlert = ad.strength > hd.strength + 1.0

  const favored     = team === 'home' ? homeTeam : awayTeam
  const underdog    = team === 'home' ? awayTeam : homeTeam
  const favoredFP   = team === 'home' ? homeFormPts : awayFormPts
  const underdogFP  = team === 'home' ? awayFormPts : homeFormPts
  const favoredAtt  = team === 'home' ? hd.goalsFor : ad.goalsFor
  const underdogAtt = team === 'home' ? ad.goalsFor : hd.goalsFor
  const favoredDef  = team === 'home' ? hd.goalsAgt : ad.goalsAgt
  const underdogDef = team === 'home' ? ad.goalsAgt : hd.goalsAgt
  const bothHighScore = Math.min(hd.goalsFor, ad.goalsFor) > 1.9

  let edgeNote: string

  if (team === 'draw') {
    if (bothHighScore) {
      edgeNote = `Both teams carry genuine attacking threat — goals are expected on both ends, and the outcome is genuinely difficult to call`
    } else if (homeFormPts > awayFormPts + 3) {
      edgeNote = `${homeTeam.name} carry better recent form, but ${awayTeam.name}'s overall quality keeps this finely balanced`
    } else if (awayFormPts > homeFormPts + 3) {
      edgeNote = `${awayTeam.name} arrive with stronger momentum, though ${homeTeam.name}'s quality makes this very evenly poised`
    } else {
      edgeNote = `Form and quality are closely matched — a moment of individual brilliance or a set piece could prove decisive`
    }
  } else if (upsetAlert) {
    edgeNote = `${favored.name} enter as favourites on paper, but ${underdog.name}'s attacking depth and recent form make the result genuinely uncertain`
  } else if (strength === 'clear') {
    if (favoredFP >= underdogFP && favoredAtt > underdogAtt) {
      edgeNote = `${favored.name} combine stronger form with a superior attacking output — both indicators point the same direction`
    } else if (favoredFP < underdogFP) {
      edgeNote = `${favored.name}'s class and depth tip the balance, despite ${underdog.name} entering with the better recent run of form`
    } else if (favoredDef < underdogDef) {
      edgeNote = `${favored.name}'s defensive solidity complements their attacking threat — ${underdog.name} will struggle to find a foothold`
    } else {
      edgeNote = `${favored.name} hold a clear overall advantage — ${underdog.name} will need a near-perfect performance to take something from this`
    }
  } else {
    if (favoredAtt > underdogAtt && underdogDef < favoredDef) {
      edgeNote = `${favored.name} hold the attacking edge, but face a ${underdog.name} side that has been disciplined defensively`
    } else if (underdogFP > favoredFP + 3) {
      edgeNote = `${favored.name} are marginally favoured — ${underdog.name}'s recent form makes this far from settled`
    } else if (bothHighScore) {
      edgeNote = `${favored.name} have a slight advantage, but with both teams scoring freely this is far from a foregone conclusion`
    } else {
      edgeNote = `${favored.name} hold a narrow edge — both sides are capable of taking this, and the margin for error is slim`
    }
  }

  return { edge: { team, teamName, strength }, confidence, upsetAlert, edgeNote }
}

// ─── Main export ─────────────────────────────────────────────

// ─── Fallback for generator failures ─────────────────────────

function makeFallbackInsights(matchId: string, homeTeam: Team, awayTeam: Team): MatchInsights {
  return {
    matchId,
    generatedAt:      new Date().toISOString(),
    personality:      'balanced',
    personalityLabel: 'Analysis',
    volatility:       5,
    form:             { home: ['W', 'D', 'W', 'L', 'W'], away: ['W', 'L', 'D', 'W', 'D'] },
    tactical:         [],
    narrative:        null,
    coachingHint:     null,
    keyPlayers:       [],
    headToHead:       [{ text: `Head-to-head record unavailable`, highlight: 'neutral' }],
    edge:             { team: 'draw', teamName: 'Either Side', strength: 'slight' },
    confidence:       'low',
    upsetAlert:       false,
    edgeNote:         `${homeTeam.name} vs ${awayTeam.name} is a closely contested fixture`,
    sectionOrder:     ['form', 'head-to-head'],
  }
}

export function generateInsights(
  matchId:  string,
  homeTeam: Team,
  awayTeam: Team,
  round?:   Round,
): MatchInsights {
  try {
    const isKnockout = round !== undefined && round !== 'group'

    const seed = hashStr(`${matchId}:${homeTeam.id}:${awayTeam.id}`)
    const rand = makePRNG(seed)

    const hd = teamDef(homeTeam.shortCode)
    const ad = teamDef(awayTeam.shortCode)

    // Form — 10 rand() calls
    const homeForm = genForm(hd.strength, rand)
    const awayForm = genForm(ad.strength, rand)

    // Personality and edge meta (0 rand() calls — fully deterministic)
    const personality = genPersonality(hd, ad, homeForm, awayForm, isKnockout)
    const meta        = genEdgeMeta(homeTeam, awayTeam, hd, ad, homeForm, awayForm)

    // Key players — 2 rand() calls
    const keyPlayers = genKeyPlayers(homeTeam, awayTeam, hd, ad, rand)

    // H2H — 5 rand() calls
    const headToHead = genH2H(homeTeam, awayTeam, hd, ad, rand)

    // Tactical insights — N rand() calls (deterministic per team profile)
    const tactical = genTacticalInsights(homeTeam, awayTeam, hd, ad, rand)

    // Coaching hint — 1 rand() call
    const coachingHint = genCoachingHint(personality, hd, ad, isKnockout, meta.upsetAlert, rand)

    // Fully deterministic (no rand())
    const narrative        = genNarrative(homeTeam, awayTeam, hd, ad, homeForm, awayForm, isKnockout)
    const personalityLabel = PERSONALITY_LABELS[personality]
    const volatility       = genVolatility(hd, ad, homeForm, awayForm)
    const avgPrestige      = (hd.prestige + ad.prestige) / 2
    const sectionOrder     = genSectionOrder(personality, narrative !== null, avgPrestige)

    const result: MatchInsights = {
      matchId,
      generatedAt: new Date().toISOString(),
      personality,
      personalityLabel,
      volatility,
      form:        { home: homeForm, away: awayForm },
      tactical,
      narrative,
      coachingHint,
      keyPlayers,
      headToHead,
      ...meta,
      sectionOrder,
    }

    // ── Post-generation validation ────────────────────────────
    const warnings: string[] = []
    if (!Array.isArray(result.sectionOrder) || result.sectionOrder.length === 0) {
      warnings.push('sectionOrder is empty or missing')
      result.sectionOrder = ['form', 'tactical', 'key-players', 'head-to-head']
    }
    if (!Array.isArray(result.tactical)) {
      warnings.push('tactical is not an array')
      result.tactical = []
    }
    if (!Array.isArray(result.keyPlayers)) {
      warnings.push('keyPlayers is not an array')
      result.keyPlayers = []
    }
    if (!Array.isArray(result.headToHead)) {
      warnings.push('headToHead is not an array')
      result.headToHead = []
    }
    if (!result.personality) {
      warnings.push('personality is missing')
      result.personality = 'balanced'
      result.personalityLabel = 'Analysis'
    }
    if (!result.edge) {
      warnings.push('edge is missing')
      result.edge = { team: 'draw', teamName: 'Either Side', strength: 'slight' }
    }
    if (typeof result.volatility !== 'number' || !Number.isFinite(result.volatility)) {
      warnings.push('volatility is not a finite number')
      result.volatility = 5
    }

    if (warnings.length > 0) {
      console.warn(
        `[generateInsights] Validation warnings for match "${matchId}" ` +
        `(${homeTeam.shortCode} vs ${awayTeam.shortCode}): ${warnings.join('; ')}`,
      )
    }

    return result
  } catch (err) {
    console.error(
      `[generateInsights] Unexpected error for match "${matchId}" ` +
      `(${homeTeam.shortCode} vs ${awayTeam.shortCode}):`,
      err,
    )
    return makeFallbackInsights(matchId, homeTeam, awayTeam)
  }
}
