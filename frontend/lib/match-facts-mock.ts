// ╔══════════════════════════════════════════════════════════════════╗
// ║  DEPRECATED — do not use in production                          ║
// ║                                                                  ║
// ║  This module generated synthetic squad availability and match   ║
// ║  statistics via PRNG for UI prototyping purposes.               ║
// ║                                                                  ║
// ║  It has been superseded by the real-data pipeline:              ║
// ║    lib/insights-data.ts        — fetch /squad and /stats        ║
// ║    lib/insights-normalizer.ts  — normalize into InsightsFacts   ║
// ║    lib/insights-engine.ts      — interpret for display          ║
// ║                                                                  ║
// ║  Retained for reference only.                                   ║
// ╚══════════════════════════════════════════════════════════════════╝

import type { Team, Round } from '@/types/match'
import type {
  AvailabilityStatus,
  PlayerStatus,
  TeamSquadStatus,
  StatRow,
  MatchContext,
  MatchFacts,
} from '@/types/match-facts'

// ─── Seeded PRNG (same algorithm as insights-mock) ───────────

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

// ─── Team definitions (strength + goals reused from insights) ─

interface TeamDef {
  strength: number
  goalsFor: number
  goalsAgt: number
  squad:    string[]   // players who may be absent
}

const TEAM_DB: Record<string, TeamDef> = {
  BRA: {
    strength: 9.1, goalsFor: 2.6, goalsAgt: 0.8,
    squad: ['Gabriel Jesus', 'Alex Sandro', 'Casemiro', 'Militão', 'Arthur'],
  },
  FRA: {
    strength: 9.0, goalsFor: 2.4, goalsAgt: 0.7,
    squad: ['Camavinga', 'Upamecano', 'Theo Hernández', 'Coman', 'Benzema'],
  },
  ARG: {
    strength: 9.1, goalsFor: 2.3, goalsAgt: 0.9,
    squad: ['Ángel Di María', 'Nahuel Molina', 'L. Martínez', 'Nicolás González', 'Lo Celso'],
  },
  ESP: {
    strength: 8.8, goalsFor: 2.2, goalsAgt: 0.6,
    squad: ['Gavi', 'Alejandro Balde', 'Dani Olmo', 'Ferran Torres', 'Marcos Llorente'],
  },
  GER: {
    strength: 8.5, goalsFor: 2.1, goalsAgt: 1.1,
    squad: ['Leroy Sané', 'Jonas Hofmann', 'Niklas Süle', 'Marco Reus', 'I. Gündogan'],
  },
  ENG: {
    strength: 8.3, goalsFor: 1.9, goalsAgt: 1.0,
    squad: ['Raheem Sterling', 'Ben Chilwell', 'K. Phillips', 'Marcus Rashford', 'Luke Shaw'],
  },
  POR: {
    strength: 8.4, goalsFor: 2.0, goalsAgt: 1.0,
    squad: ['Diogo Dalot', 'Otávio', 'Nuno Mendes', 'Ricardo Horta', 'João Félix'],
  },
  NED: {
    strength: 8.0, goalsFor: 1.8, goalsAgt: 1.2,
    squad: ['Daley Blind', 'S. Bergwijn', 'T. Koopmeiners', 'Frimpong', 'Nathan Aké'],
  },
  URU: {
    strength: 7.6, goalsFor: 1.7, goalsAgt: 1.2,
    squad: ['Diego Godín', 'G. de Arrascaeta', 'J.M. Giménez', 'R. Bentancur', 'S. Coates'],
  },
  COL: {
    strength: 7.8, goalsFor: 1.8, goalsAgt: 1.1,
    squad: ['Juan Cuadrado', 'Wilmar Barrios', 'R. Santos Borré', 'Yerry Mina', 'D. Zapata'],
  },
  MAR: {
    strength: 7.7, goalsFor: 1.6, goalsAgt: 1.0,
    squad: ['Romain Saïss', 'Nayef Aguerd', 'S. Boufal', 'Selim Amallah', 'B. El Khannouss'],
  },
  MEX: {
    strength: 7.2, goalsFor: 1.5, goalsAgt: 1.3,
    squad: ['A. Guardado', 'Raúl Jiménez', 'Carlos Salcedo', 'G. Ochoa', 'Erik Lira'],
  },
  USA: {
    strength: 7.0, goalsFor: 1.5, goalsAgt: 1.4,
    squad: ['Sergiño Dest', 'W. McKennie', 'Giovanni Reyna', 'Matt Turner', 'Jordan Morris'],
  },
  JPN: {
    strength: 7.5, goalsFor: 1.6, goalsAgt: 1.1,
    squad: ['D. Kamada', 'T. Tomiyasu', 'Yuto Nagatomo', 'Wataru Endō', 'Ko Itakura'],
  },
  SEN: {
    strength: 7.9, goalsFor: 1.9, goalsAgt: 1.0,
    squad: ['K. Koulibaly', 'Edouard Mendy', 'I.G. Gueye', 'Krepin Diatta', 'N. Mendy'],
  },
  ECU: {
    strength: 6.8, goalsFor: 1.4, goalsAgt: 1.5,
    squad: ['P. Estupiñán', 'Gonzalo Plata', 'Ángel Mena', 'J. Méndez', 'R. Arboleda'],
  },
  BEL: {
    strength: 8.2, goalsFor: 2.0, goalsAgt: 1.1,
    squad: ['K. De Bruyne', 'R. Lukaku', 'Axel Witsel', 'J. Vertonghen', 'E. Hazard'],
  },
  CRO: {
    strength: 7.8, goalsFor: 1.7, goalsAgt: 1.0,
    squad: ['Luka Modrić', 'M. Kovačić', 'Joško Gvardiol', 'Ivan Perišić', 'A. Kramarić'],
  },
  CAN: {
    strength: 7.3, goalsFor: 1.7, goalsAgt: 1.2,
    squad: ['Alphonso Davies', 'Jonathan David', 'Atiba Hutchinson', 'S. Larin', 'T. Henry'],
  },
  SUI: {
    strength: 7.8, goalsFor: 1.8, goalsAgt: 0.9,
    squad: ['Granit Xhaka', 'Breel Embolo', 'D. Ndoye', 'M. Akanji', 'Silvan Widmer'],
  },
  DEN: {
    strength: 7.7, goalsFor: 1.7, goalsAgt: 1.0,
    squad: ['Christian Eriksen', 'Rasmus Højlund', 'Andreas Christensen', 'P. Schmeichel', 'Joakim Mæhle'],
  },
  TUR: {
    strength: 7.5, goalsFor: 1.7, goalsAgt: 1.2,
    squad: ['Arda Güler', 'H. Çalhanoğlu', 'Zeki Çelik', 'Abdülkadir Ütük', 'Kenan Yıldız'],
  },
  AUT: {
    strength: 7.6, goalsFor: 1.9, goalsAgt: 1.1,
    squad: ['Marcel Sabitzer', 'David Alaba', 'C. Baumgartner', 'Marko Arnautović', 'K. Laimer'],
  },
  SCO: {
    strength: 7.2, goalsFor: 1.6, goalsAgt: 1.2,
    squad: ['Andy Robertson', 'Scott McTominay', 'John McGinn', 'K. Tierney', 'Ryan Christie'],
  },
  POL: {
    strength: 7.4, goalsFor: 1.6, goalsAgt: 1.2,
    squad: ['R. Lewandowski', 'P. Zieliński', 'Grzegorz Krychowiak', 'Wojciech Szczęsny', 'K. Piątek'],
  },
  SRB: {
    strength: 7.3, goalsFor: 1.6, goalsAgt: 1.2,
    squad: ['D. Vlahović', 'S. Milinković', 'Aleksandar Mitrović', 'Filip Kostić', 'N. Maksimović'],
  },
  SVN: {
    strength: 7.1, goalsFor: 1.5, goalsAgt: 1.1,
    squad: ['Benjamin Šeško', 'Jan Oblak', 'J. Kurtič', 'Petar Stojanović', 'A. Cesar'],
  },
  NGA: {
    strength: 7.5, goalsFor: 1.8, goalsAgt: 1.1,
    squad: ['Victor Osimhen', 'Alex Iwobi', 'William Troost-Ekong', 'Wilfred Ndidi', 'Odion Ighalo'],
  },
  GHA: {
    strength: 6.8, goalsFor: 1.4, goalsAgt: 1.3,
    squad: ['Mohammed Kudus', 'Thomas Partey', 'Jordan Ayew', 'André Ayew', 'A. Schär'],
  },
  CMR: {
    strength: 6.9, goalsFor: 1.4, goalsAgt: 1.3,
    squad: ['V. Aboubakar', 'André Onana', 'Nicolas Nkoulou', 'Frank Zambo Anguissa', 'Karl Toko Ekambi'],
  },
  EGY: {
    strength: 7.0, goalsFor: 1.5, goalsAgt: 1.2,
    squad: ['Mohamed Salah', 'Omar Marmoush', 'A. El-Solia', 'Mostafa Mohamed', 'Trezeguet'],
  },
  ALG: {
    strength: 7.1, goalsFor: 1.6, goalsAgt: 1.1,
    squad: ['Riyad Mahrez', 'Youcef Atal', 'Islam Slimani', 'Andy Delort', 'Aïssa Mandi'],
  },
  TUN: {
    strength: 6.7, goalsFor: 1.3, goalsAgt: 1.2,
    squad: ['Wahbi Khazri', 'Youssef Msakni', 'Montassar Talbi', 'Ellyes Skhiri', 'D. Bronn'],
  },
  KOR: {
    strength: 7.2, goalsFor: 1.5, goalsAgt: 1.2,
    squad: ['Son Heung-min', 'Lee Kang-in', 'Hwang Hee-chan', 'Kim Min-jae', 'Na Sang-ho'],
  },
  KSA: {
    strength: 6.9, goalsFor: 1.5, goalsAgt: 1.3,
    squad: ['Salem Al-Dawsari', 'Mohammed Al-Owais', 'Firas Al-Buraikan', 'Ali Al-Bulayhi', 'Sultan Al-Ghannam'],
  },
  IRN: {
    strength: 6.7, goalsFor: 1.3, goalsAgt: 1.3,
    squad: ['Mehdi Taremi', 'Sardar Azmoun', 'Alireza Jahanbakhsh', 'Ali Gholizadeh', 'S. Hosseini'],
  },
  AUS: {
    strength: 6.8, goalsFor: 1.4, goalsAgt: 1.4,
    squad: ['Mathew Leckie', 'Mitchell Duke', 'Aaron Mooy', 'Mat Ryan', 'Bailey Wright'],
  },
  CRC: {
    strength: 6.5, goalsFor: 1.2, goalsAgt: 1.4,
    squad: ['Keysher Fuller', 'Manfred Ugalde', 'Bryan Ruiz', 'Francisco Calvo', 'Kenneth Vargas'],
  },
  PAN: {
    strength: 6.5, goalsFor: 1.2, goalsAgt: 1.4,
    squad: ['A. Carrasquilla', 'Cecilio Waterman', 'Rolando Blackburn', 'Fidel Escobar', 'R. Miller'],
  },
  HON: {
    strength: 6.2, goalsFor: 1.1, goalsAgt: 1.5,
    squad: ['Alberth Elis', 'Romell Quioto', 'Luis Palma', 'Edwin Rodríguez', 'Marcelo Pereira'],
  },
  VEN: {
    strength: 7.0, goalsFor: 1.5, goalsAgt: 1.3,
    squad: ['Salomón Rondón', 'Yangel Herrera', 'Tomás Rincón', 'Jan Paul Martínez', 'Jhon Murillo'],
  },
  PAR: {
    strength: 6.8, goalsFor: 1.4, goalsAgt: 1.3,
    squad: ['Miguel Almirón', 'Gustavo Gómez', 'Óscar Romero', 'Antonio Sanabria', 'Ángel Romero'],
  },
  CHI: {
    strength: 6.7, goalsFor: 1.4, goalsAgt: 1.3,
    squad: ['Alexis Sánchez', 'Arturo Vidal', 'Charles Aránguiz', 'Mauricio Isla', 'Ben Brereton'],
  },
  PER: {
    strength: 6.9, goalsFor: 1.4, goalsAgt: 1.3,
    squad: ['André Carrillo', 'Christian Cueva', 'Gianluca Lapadula', 'Pedro Gallese', 'Luis Advíncula'],
  },
}

const FALLBACK: TeamDef = {
  strength: 7.0, goalsFor: 1.5, goalsAgt: 1.3,
  squad: ['Team captain', 'Centre-back', 'Lead forward', 'Midfield anchor', 'Wide attacker'],
}

function teamDef(code: string): TeamDef {
  return TEAM_DB[code.toUpperCase()] ?? FALLBACK
}

// ─── Squad availability ───────────────────────────────────────

const ABSENCE_DETAILS: Record<AvailabilityStatus, string[]> = {
  injured:   ['Hamstring', 'Knee injury', 'Calf strain', 'Ankle issue', 'Muscle strain'],
  suspended: ['Yellow card accumulation', 'Red card suspension', 'Disciplinary'],
  doubtful:  ['Minor knock', 'Late fitness test', 'Fatigue', 'Illness'],
}

function genSquad(def: TeamDef, rand: () => number): TeamSquadStatus {
  const result: TeamSquadStatus = { injured: [], suspended: [], doubtful: [] }

  // 3 attempts, each using exactly 4 rand() calls — total: 12 calls per team
  for (let i = 0; i < 3; i++) {
    const absentRoll = rand()   // < 0.45 → player is absent
    const playerRoll = rand()   // which player
    const statusRoll = rand()   // injured/suspended/doubtful
    const detailRoll = rand()   // specific detail

    if (absentRoll < 0.45) {
      const name = def.squad[Math.floor(playerRoll * def.squad.length)]
      const alreadyListed =
        result.injured.some(p => p.name === name) ||
        result.suspended.some(p => p.name === name) ||
        result.doubtful.some(p => p.name === name)

      if (!alreadyListed) {
        const status: AvailabilityStatus =
          statusRoll < 0.50 ? 'injured'
          : statusRoll < 0.75 ? 'suspended'
          : 'doubtful'
        const pool   = ABSENCE_DETAILS[status]
        const detail = pool[Math.floor(detailRoll * pool.length)]
        result[status].push({ name, status, detail })
      }
    }
  }

  return result
}

// ─── Stats comparison ─────────────────────────────────────────

function genStats(hd: TeamDef, ad: TeamDef, rand: () => number): StatRow[] {
  const jitter = (rand() - 0.5) * 0.2   // ±0.1 jitter, 1 rand call

  const homeGoals = +(Math.max(0.8, hd.goalsFor + jitter)).toFixed(1)
  const awayGoals = +(Math.max(0.8, ad.goalsFor + jitter * 0.8)).toFixed(1)
  const homeConc  = +(Math.max(0.2, hd.goalsAgt + jitter * 0.5)).toFixed(1)
  const awayConc  = +(Math.max(0.2, ad.goalsAgt + jitter * 0.6)).toFixed(1)

  const totalStr  = hd.strength + ad.strength
  const homePoss  = Math.round(48 + (hd.strength / totalStr - 0.5) * 26)
  const awayPoss  = 100 - homePoss

  // Shots per game from goals + implied ~11.5% conversion
  const homeShots = Math.max(6, Math.round(+homeGoals / 0.115))
  const awayShots = Math.max(6, Math.round(+awayGoals / 0.115))

  // Clean sheet % from conceded rate
  const homeCSPct = Math.max(10, Math.min(80, Math.round(70 - +homeConc * 30)))
  const awayCSPct = Math.max(10, Math.min(80, Math.round(70 - +awayConc * 30)))

  // Conversion rate
  const homeConv = Math.max(5, Math.round((+homeGoals / homeShots) * 100))
  const awayConv = Math.max(5, Math.round((+awayGoals / awayShots) * 100))

  return [
    { label: 'Goals Scored',   home: +homeGoals,  away: +awayGoals,  unit: '/g', higherIsBetter: true,  format: 'decimal'  },
    { label: 'Goals Conceded', home: +homeConc,   away: +awayConc,   unit: '/g', higherIsBetter: false, format: 'decimal'  },
    { label: 'Shots per Game', home: homeShots,   away: awayShots,   unit: '',   higherIsBetter: true,  format: 'integer'  },
    { label: 'Possession',     home: homePoss,    away: awayPoss,    unit: '%',  higherIsBetter: true,  format: 'integer'  },
    { label: 'Clean Sheet %',  home: homeCSPct,   away: awayCSPct,   unit: '%',  higherIsBetter: true,  format: 'integer'  },
    { label: 'Conversion',     home: homeConv,    away: awayConv,    unit: '%',  higherIsBetter: true,  format: 'integer'  },
  ]
}

// ─── Match context ────────────────────────────────────────────

const RIVALRIES: Record<string, { label: string; detail: string }> = {
  'BRA-ARG': { label: 'Clásico de América', detail: 'One of football\'s defining rivalries — never a dull moment between these sides' },
  'ARG-BRA': { label: 'Clásico de América', detail: 'One of football\'s defining rivalries — never a dull moment between these sides' },
  'ENG-GER': { label: 'Historic Rivalry',   detail: 'Decades of World Cup history make this fixture unique in world football' },
  'GER-ENG': { label: 'Historic Rivalry',   detail: 'Decades of World Cup history make this fixture unique in world football' },
  'ESP-POR': { label: 'Iberian Derby',       detail: 'Neighboring nations with fierce competitive pride on the biggest stage' },
  'POR-ESP': { label: 'Iberian Derby',       detail: 'Neighboring nations with fierce competitive pride on the biggest stage' },
  'USA-MEX': { label: 'CONCACAF Rivalry',   detail: 'A long-running rivalry with intense passion on both sides of the border' },
  'MEX-USA': { label: 'CONCACAF Rivalry',   detail: 'A long-running rivalry with intense passion on both sides of the border' },
  'FRA-GER': { label: 'European Giants',    detail: 'Two of Europe\'s most decorated nations — their meetings shape tournaments' },
  'GER-FRA': { label: 'European Giants',    detail: 'Two of Europe\'s most decorated nations — their meetings shape tournaments' },
  'ARG-ENG': { label: 'Charged Encounter', detail: 'A fixture steeped in history and always carrying an extra edge' },
  'ENG-ARG': { label: 'Charged Encounter', detail: 'A fixture steeped in history and always carrying an extra edge' },
  'BRA-FRA': { label: 'World Cup Classics', detail: 'These sides have produced some of the tournament\'s most memorable moments' },
  'FRA-BRA': { label: 'World Cup Classics', detail: 'These sides have produced some of the tournament\'s most memorable moments' },
}

function genContext(
  homeTeam: Team,
  awayTeam: Team,
  hd: TeamDef,
  ad: TeamDef,
  round: Round,
  rand: () => number,
): MatchContext[] {
  const context: MatchContext[] = []

  const pairKey = `${homeTeam.shortCode}-${awayTeam.shortCode}`
  if (RIVALRIES[pairKey]) {
    const { label, detail } = RIVALRIES[pairKey]
    context.push({ type: 'rivalry', label, detail })
  }

  // Round-based context — 1 rand() call for group stage pressure
  const pressureRoll = rand()

  if (round === 'group') {
    if (pressureRoll < 0.35) {
      context.push({
        type:   'must-win',
        label:  'High Stakes Group Clash',
        detail: 'Points here could be decisive for qualification and group seeding',
      })
    } else if (pressureRoll < 0.65) {
      context.push({
        type:   'group-decider',
        label:  'Qualification on the Line',
        detail: 'Both sides will have an eye on the standings — every goal difference point matters',
      })
    }
    // else no group pressure banner — the match is lower stakes
  } else if (round === 'r32' || round === 'r16') {
    context.push({
      type:   'elimination-risk',
      label:  'Knockout Round — No Second Chances',
      detail: 'One result ends the tournament for the loser — margins are everything',
    })
  } else if (round === 'qf' || round === 'sf') {
    context.push({
      type:   'knockout-pressure',
      label:  'One Step from the Final',
      detail: 'The quality of opposition rises sharply — focus and discipline are non-negotiable',
    })
  } else if (round === 'final') {
    context.push({
      type:   'high-stakes',
      label:  'World Cup Final',
      detail: 'The pinnacle of international football — one match to decide the world champion',
    })
  }

  // Upset potential
  if (ad.strength > hd.strength + 1.0) {
    context.push({
      type:   'upset-alert',
      label:  'Upset Potential',
      detail: `${awayTeam.name} are the stronger side on paper but carry the burden of expectation`,
    })
  }

  return context
}

// ─── Main export ─────────────────────────────────────────────

export function generateFacts(
  matchId:  string,
  homeTeam: Team,
  awayTeam: Team,
  round:    Round,
): MatchFacts {
  // Use a different seed prefix from insights so the two cards don't share PRNG state
  const seed = hashStr(`facts:${matchId}:${homeTeam.id}:${awayTeam.id}`)
  const rand = makePRNG(seed)

  const hd = teamDef(homeTeam.shortCode)
  const ad = teamDef(awayTeam.shortCode)

  const homeSquad = genSquad(hd, rand)   // 12 rand calls
  const awaySquad = genSquad(ad, rand)   // 12 rand calls
  const stats     = genStats(hd, ad, rand)   // 1 rand call
  const context   = genContext(homeTeam, awayTeam, hd, ad, round, rand)  // 1 rand call

  return {
    matchId,
    generatedAt: new Date().toISOString(),
    squad:   { home: homeSquad, away: awaySquad },
    stats,
    context,
  }
}
