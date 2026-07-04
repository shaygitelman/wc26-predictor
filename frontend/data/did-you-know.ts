export type FactCategory =
  | 'wc-history'   // memorable World Cup moments
  | 'record'       // incredible records
  | 'upset'        // historic upsets
  | 'player'       // legendary individual performances
  | 'h2h'          // head-to-head history between two teams
  | 'penalty'      // penalty shootout lore
  | 'milestone'    // firsts, landmarks, qualifications
  | 'trivia'       // fun facts most fans don't know

// Which World Cup era the fact is actually about, driving the "feel modern"
// priority: 2010-2026 outranks 1990-2010, which outranks 1970-1990, which
// outranks pre-1970 — except pre-1970 (and non-iconic 1970-1990) facts can
// still surface when they're individually scored as truly iconic/legendary
// (interestingScore 9+), e.g. the Maracanazo or England's 1966 final. See
// `eraRank` in the component for how the exception is applied.
export type Era = 'modern' | 'recent' | 'classic' | 'vintage'
// modern:  2010-2026
// recent:  1990-2010
// classic: 1970-1990
// vintage: 1930-1970

export interface MatchFact {
  id:               string
  text:             string
  category:         FactCategory
  // How compelling the fact is on its own merits, 1-10. Selection prefers the
  // highest score first (after H2H priority), so the strongest facts surface
  // before the more middling ones. Also doubles as the "is this old fact
  // actually iconic/legendary" signal — see Era above.
  interestingScore: number
  era:              Era
  // The team short code(s) this fact is actually about. Selection logic only
  // ever shows a fact whose `teams` overlaps the two teams in the current
  // fixture, which is what guarantees a fact can never be unrelated to the
  // match being displayed, no matter which two teams end up paired.
  teams:            [string] | [string, string]
}

// Authoring shape: `score` is an optional hand-tuned override; when omitted,
// `finalizeBank` fills it in from CATEGORY_BASE_SCORE. `id` is never authored
// by hand — it's derived from the fact's position in its bank, which keeps
// every one of the ~400 entries below unique without manually typing IDs.
interface RawFact {
  text:     string
  category: FactCategory
  score?:   number
  era:      Era
  teams:    [string] | [string, string]
}

const CATEGORY_BASE_SCORE: Record<FactCategory, number> = {
  'upset':      8,
  'penalty':    8,
  'h2h':        8,
  'player':     7,
  'wc-history': 7,
  'record':     6,
  'trivia':     6,
  'milestone':  5,
}

function finalizeBank(bank: Record<string, RawFact[]>, prefix: string): Record<string, MatchFact[]> {
  const out: Record<string, MatchFact[]> = {}
  for (const key of Object.keys(bank)) {
    out[key] = bank[key].map((f, i) => ({
      id:               `${prefix}:${key}:${i}`,
      text:             f.text,
      category:         f.category,
      interestingScore: f.score ?? CATEGORY_BASE_SCORE[f.category],
      era:              f.era,
      teams:            f.teams,
    }))
  }
  return out
}

function h2hKey(a: string, b: string): string {
  return [a, b].sort().join('_')
}

// Deterministic pseudo-random shuffle, seeded from a string. Same seed always
// produces the same order (so SSR output is stable and every visitor sees the
// same thing on the same day), but the order is not the authored array order,
// and it differs per opponent, so rotation never just walks the list from the
// top on every single call.
function stableShuffle<T>(arr: readonly T[], seed: string): T[] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  let state = h >>> 0
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ── Head-to-head facts ───────────────────────────────────────────────────────
// Real historical meetings between two teams in the 2026 field. Keyed by the
// two short codes sorted alphabetically, so lookup doesn't care which team is
// home or away. These are always preferred over single-team facts whenever
// the two teams on screen have met before.
const RAW_H2H_FACTS: Record<string, RawFact[]> = {
  [h2hKey('ALG', 'GER')]: [
    { text: "Algeria pushed eventual champions Germany all the way to extra time in the 2014 round of 16. German players called it their toughest match of the whole tournament.", category: 'wc-history', era: 'modern', teams: ['ALG', 'GER'] },
  ],
  [h2hKey('ALG', 'USA')]: [
    { text: "Landon Donovan's stoppage-time goal against Algeria in 2010 sent the USA through to the knockout rounds, one of the most replayed moments in American sports history.", category: 'player', score: 9, era: 'modern', teams: ['ALG', 'USA'] },
  ],
  [h2hKey('ARG', 'CRO')]: [
    { text: "Croatia beat Argentina 3-0 in the 2018 group stage, one of the most one-sided results ever between two World Cup contenders. Argentina got their revenge in the 2022 semi-final, winning 3-0 right back.", category: 'h2h', era: 'modern', teams: ['ARG', 'CRO'] },
  ],
  [h2hKey('ARG', 'KSA')]: [
    { text: "Saudi Arabia beat Messi's Argentina 2-1 in the 2022 group stage, one of the biggest shocks the World Cup has ever seen. Argentina went on to win the whole tournament anyway.", category: 'upset', era: 'modern', teams: ['ARG', 'KSA'] },
  ],
  [h2hKey('ARG', 'NED')]: [
    { text: "Argentina won their first World Cup on home soil in 1978, beating the Netherlands 3-1 in the final.", category: 'h2h', era: 'classic', teams: ['ARG', 'NED'] },
  ],
  [h2hKey('ARG', 'URU')]: [
    { text: "Argentina reached the final of the very first World Cup in 1930, losing 4-2 to hosts Uruguay in front of a crowd that had to be held back by a moat around the pitch.", category: 'h2h', score: 9, era: 'vintage', teams: ['ARG', 'URU'] },
  ],
  [h2hKey('AUS', 'URU')]: [
    { text: "Mark Schwarzer saved two penalties against Uruguay in the 2006 playoff, sending Australia to their first World Cup in 32 years.", category: 'penalty', era: 'recent', teams: ['AUS', 'URU'] },
  ],
  [h2hKey('AUT', 'JOR')]: [
    { text: "Austria beat Jordan in the 2026 group stage on their way to the knockouts, part of a group that also saw them lose to Argentina and draw Algeria 3-3.", category: 'trivia', era: 'modern', teams: ['AUT', 'JOR'] },
  ],
  [h2hKey('AUT', 'SUI')]: [
    { text: "Austria 7-5 Switzerland. The 1954 quarter-final is still the highest scoring game in World Cup history, ten goals in ninety minutes.", category: 'record', score: 9, era: 'vintage', teams: ['AUT', 'SUI'] },
  ],
  [h2hKey('BEL', 'BRA')]: [
    { text: "Belgium knocked out a star-studded Brazil 2-1 in the 2018 quarter-final. It's still one of the biggest results in Belgian football history.", category: 'upset', era: 'modern', teams: ['BEL', 'BRA'] },
  ],
  [h2hKey('BEL', 'KSA')]: [
    { text: "Saudi Arabia beat Belgium 1-0 at the 1994 World Cup, capped by a mazy solo run and goal from Saeed Al-Owairan that's still shown in World Cup highlight reels today.", category: 'upset', score: 9, era: 'recent', teams: ['BEL', 'KSA'] },
  ],
  [h2hKey('BEL', 'NZL')]: [
    { text: "Belgium closed out their 2026 group stage unbeaten with a 5-1 demolition of New Zealand.", category: 'record', era: 'modern', teams: ['BEL', 'NZL'] },
  ],
  [h2hKey('BEL', 'TUN')]: [
    { text: "Tunisia's 2018 World Cup ended with a 5-2 loss to Belgium, their heaviest defeat at the tournament in over two decades.", category: 'wc-history', era: 'modern', teams: ['BEL', 'TUN'] },
  ],
  [h2hKey('BIH', 'IRN')]: [
    { text: "Bosnia & Herzegovina beat Iran 3-1 at the 2014 World Cup for their first ever win at the tournament.", category: 'milestone', era: 'modern', teams: ['BIH', 'IRN'] },
  ],
  [h2hKey('BIH', 'QAT')]: [
    { text: "Bosnia & Herzegovina bounced back from a heavy group-stage loss to beat Qatar 3-1 and sneak into the 2026 knockouts.", category: 'upset', era: 'modern', teams: ['BIH', 'QAT'] },
  ],
  [h2hKey('BIH', 'SUI')]: [
    { text: "Switzerland thrashed Bosnia & Herzegovina 4-1 in the 2026 group stage, part of an unbeaten run through the group.", category: 'record', era: 'modern', teams: ['BIH', 'SUI'] },
  ],
  [h2hKey('BRA', 'COD')]: [
    { text: "DR Congo, then playing as Zaire, faced Brazil at the 1974 World Cup. Defender Mwepu Ilunga famously broke from the wall and booted the ball away before Brazil's free kick was even taken, later saying he thought the whistle had blown.", category: 'trivia', score: 9, era: 'classic', teams: ['BRA', 'COD'] },
  ],
  [h2hKey('BRA', 'CRO')]: [
    { text: "Croatia knocked out host-favorites Brazil on penalties in the 2022 quarter-final, a game that finished 1-1 after Neymar's extra-time goal was cancelled out deep into stoppage time.", category: 'penalty', score: 9, era: 'modern', teams: ['BRA', 'CRO'] },
  ],
  [h2hKey('BRA', 'GER')]: [
    { text: "7-1. Germany dismantled Brazil on home soil in the 2014 semi-final so badly the crowd went silent after the fifth goal. Brazil still calls it the Mineirazo.", category: 'wc-history', score: 10, era: 'modern', teams: ['BRA', 'GER'] },
  ],
  [h2hKey('BRA', 'NOR')]: [
    { text: "Norway beat a Brazil side stacked with Ronaldo, Rivaldo, and Roberto Carlos 2-1 in 1998, ending a 35-match Brazilian unbeaten run at World Cups. Tore André Flo scored both goals himself.", category: 'upset', era: 'recent', teams: ['BRA', 'NOR'] },
  ],
  [h2hKey('BRA', 'SWE')]: [
    { text: "Brazil beat hosts Sweden 5-2 in the 1958 final. A 17-year-old Pelé scored twice, becoming the youngest player ever to win a World Cup.", category: 'h2h', score: 9, era: 'vintage', teams: ['BRA', 'SWE'] },
  ],
  [h2hKey('BRA', 'URU')]: [
    { text: "Uruguay beat hosts Brazil 2-1 in the deciding match of the 1950 World Cup, in front of the largest crowd ever recorded at a football match. Brazil still calls it the Maracanazo.", category: 'upset', score: 10, era: 'vintage', teams: ['BRA', 'URU'] },
  ],
  [h2hKey('COD', 'UZB')]: [
    { text: "DR Congo beat Uzbekistan 3-1 in their final 2026 group game to sneak into the knockouts as one of the best third-placed teams, 52 years after their last World Cup appearance.", category: 'milestone', era: 'modern', teams: ['COD', 'UZB'] },
  ],
  [h2hKey('COL', 'URU')]: [
    { text: "James Rodríguez scored a chest-and-volley against Uruguay in the 2014 round of 16 that was voted Goal of the Tournament. He was 22 and finished with the Golden Boot.", category: 'player', era: 'modern', teams: ['COL', 'URU'] },
  ],
  [h2hKey('CRO', 'ENG')]: [
    { text: "Croatia lost their 2026 group opener 4-2 to England, then won back-to-back games against Panama and Ghana to advance anyway.", category: 'wc-history', era: 'modern', teams: ['CRO', 'ENG'] },
  ],
  [h2hKey('ECU', 'QAT')]: [
    { text: "Qatar became the first ever World Cup host to lose their own opening match, falling 2-0 to Ecuador in 2022. Enner Valencia scored both goals.", category: 'upset', era: 'modern', teams: ['ECU', 'QAT'] },
  ],
  [h2hKey('EGY', 'NZL')]: [
    { text: "Egypt's only win in the 2026 group stage was 3-1 over New Zealand. Two draws either side of it were enough to send them through.", category: 'trivia', era: 'modern', teams: ['EGY', 'NZL'] },
  ],
  [h2hKey('EGY', 'SEN')]: [
    { text: "Senegal beat Egypt on penalties to win the 2022 Africa Cup of Nations, then beat them on penalties again weeks later in a World Cup qualifying playoff.", category: 'penalty', era: 'modern', teams: ['EGY', 'SEN'] },
  ],
  [h2hKey('ENG', 'PAN')]: [
    { text: "Panama's first ever World Cup goal came against England in 2018, with the score already 6-1. Panama conceded eleven goals across their three group games in their tournament debut, but the celebrations back home didn't care.", category: 'wc-history', era: 'modern', teams: ['ENG', 'PAN'] },
  ],
  [h2hKey('ENG', 'USA')]: [
    { text: "The USA beat England 1-0 at the 1950 World Cup, a result so shocking that some British papers refused to print it, assuming it was a typo.", category: 'upset', score: 9, era: 'vintage', teams: ['ENG', 'USA'] },
  ],
  [h2hKey('ESP', 'JPN')]: [
    { text: "Japan beat Spain 2-1 in the 2022 group stage, coming from behind against a team that had 80% possession. It sent Germany home instead.", category: 'upset', era: 'modern', teams: ['ESP', 'JPN'] },
  ],
  [h2hKey('ESP', 'KOR')]: [
    { text: "South Korea beat Spain on penalties in the 2002 quarter-final, one of two former world champions they eliminated on their run to the semi-finals.", category: 'penalty', era: 'recent', teams: ['ESP', 'KOR'] },
  ],
  [h2hKey('ESP', 'MAR')]: [
    { text: "Morocco's keeper Bono saved three penalties against Spain in the 2022 round of 16. Spain had 77% possession and 12 shots and still went home.", category: 'penalty', score: 9, era: 'modern', teams: ['ESP', 'MAR'] },
    { text: "Morocco held Spain to a 2-2 draw in the 2018 group stage, coming back twice against a Spain side that had just fired its manager two days before the tournament started.", category: 'wc-history', score: 7, era: 'modern', teams: ['ESP', 'MAR'] },
  ],
  [h2hKey('ESP', 'NED')]: [
    { text: "The Netherlands beat defending champions Spain 5-1 at the 2014 World Cup, four years after losing to them in the final. Robin van Persie's diving header is still one of the tournament's most replayed goals.", category: 'upset', score: 9, era: 'modern', teams: ['ESP', 'NED'] },
  ],
  [h2hKey('ESP', 'SUI')]: [
    { text: "Switzerland beat Spain 1-0 in the 2010 group stage. It was Spain's only loss on their way to winning the entire tournament.", category: 'upset', era: 'modern', teams: ['ESP', 'SUI'] },
  ],
  [h2hKey('FRA', 'MEX')]: [
    { text: "Mexico played France in one of the two very first World Cup matches ever, back in 1930. France won 4-1, and Lucien Laurent's goal in that game is still recognized as the first ever scored at a World Cup.", category: 'h2h', score: 9, era: 'vintage', teams: ['FRA', 'MEX'] },
  ],
  [h2hKey('FRA', 'SEN')]: [
    { text: "Senegal's very first World Cup match was against defending champions France in 2002. Senegal won 1-0, then reached the quarter-finals in their debut tournament.", category: 'h2h', era: 'recent', teams: ['FRA', 'SEN'] },
  ],
  [h2hKey('FRA', 'TUN')]: [
    { text: "Tunisia beat defending champions France 1-0 in the final 2022 group game. France had already qualified and rested starters, but Tunisia didn't care, and neither did the celebrations back home.", category: 'upset', era: 'modern', teams: ['FRA', 'TUN'] },
  ],
  [h2hKey('GER', 'JPN')]: [
    { text: "Japan beat Germany 2-1 in the 2022 group stage, coming back from a goal down against the four-time champions. Spain suffered the exact same fate a few days later.", category: 'upset', era: 'modern', teams: ['GER', 'JPN'] },
  ],
  [h2hKey('GHA', 'URU')]: [
    { text: "Ghana were seconds from becoming the first African World Cup semi-finalist in 2010, before Luis Suárez's goal-line handball against Uruguay led to a missed penalty and a shootout Ghana lost.", category: 'penalty', score: 10, era: 'modern', teams: ['GHA', 'URU'] },
  ],
  [h2hKey('GHA', 'USA')]: [
    { text: "Ghana beat the USA in the 2010 round of 16 to become the first African team since Cameroon in 1990 to reach a World Cup quarter-final.", category: 'wc-history', era: 'modern', teams: ['GHA', 'USA'] },
    { text: "Clint Dempsey scored after just 34 seconds against Ghana in the 2014 group stage, the fastest goal ever by an American at a World Cup. Ghana equalized, but a late header won it for the USA anyway.", category: 'record', era: 'modern', teams: ['GHA', 'USA'] },
  ],
  [h2hKey('IRQ', 'SEN')]: [
    { text: "Senegal lost their first two 2026 group games, then hammered Iraq 5-0 in their finale to sneak through as one of the best third-placed teams.", category: 'upset', era: 'modern', teams: ['IRQ', 'SEN'] },
  ],
  [h2hKey('JOR', 'KOR')]: [
    { text: "Jordan beat South Korea 2-0 in the 2023 Asian Cup semi-final, one of the biggest results in Jordanian football history, before reaching their first ever Asian Cup final.", category: 'upset', era: 'modern', teams: ['JOR', 'KOR'] },
  ],
  [h2hKey('KOR', 'POR')]: [
    { text: "South Korea beat Portugal 1-0 in the 2002 group stage as co-hosts, sending home a Portugal side built around Figo and Rui Costa.", category: 'upset', era: 'recent', teams: ['KOR', 'POR'] },
  ],
  [h2hKey('KOR', 'TUR')]: [
    { text: "Turkey beat South Korea in the 2002 third-place match, the same game where Hakan Şükür scored the fastest goal in World Cup history, 11 seconds in.", category: 'record', score: 9, era: 'recent', teams: ['KOR', 'TUR'] },
  ],
  [h2hKey('PAN', 'TUN')]: [
    { text: "Wahbi Khazri scored as Tunisia beat Panama in the 2018 group stage, Tunisia's first World Cup win in 40 years.", category: 'wc-history', era: 'modern', teams: ['PAN', 'TUN'] },
  ],
  [h2hKey('TUR', 'USA')]: [
    { text: "The USA won their first two 2026 group games, then lost a wild finale 3-2 to Turkey, still enough to reach the knockouts.", category: 'wc-history', era: 'modern', teams: ['TUR', 'USA'] },
  ],
  [h2hKey('ARG', 'ENG')]: [
    { text: "Argentina beat England 2-1 in the 1986 quarter-final, the same match where Maradona scored the 'Hand of God' and the 'Goal of the Century' four minutes apart.", category: 'wc-history', score: 10, era: 'classic', teams: ['ARG', 'ENG'] },
  ],
  [h2hKey('ARG', 'BEL')]: [
    { text: "Argentina beat Belgium 2-0 in the 1986 semi-final on their way to winning the whole tournament, with Maradona setting up both goals.", category: 'wc-history', score: 8, era: 'classic', teams: ['ARG', 'BEL'] },
  ],
  [h2hKey('ARG', 'FRA')]: [
    { text: "Argentina beat France on penalties in the 2022 final after a 3-3 draw that included hat-tricks from both Messi and Mbappé, widely called the greatest World Cup final ever played.", category: 'penalty', score: 10, era: 'modern', teams: ['ARG', 'FRA'] },
  ],
  [h2hKey('ARG', 'MEX')]: [
    { text: "Argentina badly needed a win against Mexico in the 2022 group stage. Messi broke the deadlock, then Enzo Fernández scored a stunning long-range strike on his World Cup debut.", category: 'player', score: 8, era: 'modern', teams: ['ARG', 'MEX'] },
  ],
  [h2hKey('ARG', 'SUI')]: [
    { text: "Argentina needed a goal from Ángel Di María in the 118th minute to finally break down Switzerland in the 2014 round of 16, one of the tightest knockout matches of that tournament.", category: 'wc-history', score: 7, era: 'modern', teams: ['ARG', 'SUI'] },
  ],
  [h2hKey('BEL', 'EGY')]: [
    { text: "Belgium beat Egypt 3-1 in the 2018 group stage on the same night Mohamed Salah scored on his return from a shoulder injury picked up in the Champions League final.", category: 'player', score: 7, era: 'modern', teams: ['BEL', 'EGY'] },
  ],
  [h2hKey('BEL', 'ENG')]: [
    { text: "Belgium and England played each other twice at the 2018 World Cup, in the group stage and again in the third-place match. Belgium won both.", category: 'trivia', score: 8, era: 'modern', teams: ['BEL', 'ENG'] },
  ],
  [h2hKey('BEL', 'FRA')]: [
    { text: "France beat Belgium 1-0 in the 2018 semi-final on a Samuel Umtiti header, the only goal of the entire match, and went on to win the tournament.", category: 'wc-history', score: 9, era: 'modern', teams: ['BEL', 'FRA'] },
  ],
  [h2hKey('BEL', 'MAR')]: [
    { text: "Morocco beat Belgium, then ranked second in the world, 2-0 in the 2022 group stage, sparking street celebrations across Morocco and among Moroccan communities in Brussels.", category: 'upset', score: 9, era: 'modern', teams: ['BEL', 'MAR'] },
  ],
  [h2hKey('BEL', 'USA')]: [
    { text: "Tim Howard made a World Cup record 16 saves for the USA against Belgium in the 2014 round of 16, and the USA still lost in extra time.", category: 'record', score: 9, era: 'modern', teams: ['BEL', 'USA'] },
  ],
  [h2hKey('BRA', 'ENG')]: [
    { text: "Pelé's header against England in 1970 was destined for the top corner until Gordon Banks somehow clawed it over the bar, a save still called the greatest in World Cup history.", category: 'player', score: 10, era: 'classic', teams: ['BRA', 'ENG'] },
  ],
  [h2hKey('BRA', 'FRA')]: [
    { text: "France beat Brazil 3-0 in the 1998 final on home soil, with Zinedine Zidane scoring twice with headers from corner kicks.", category: 'wc-history', score: 10, era: 'recent', teams: ['BRA', 'FRA'] },
    { text: "Brazil and France's 1986 quarter-final, decided on penalties after a 1-1 draw, is still cited by players from both sides as one of the greatest World Cup matches ever played.", category: 'penalty', score: 8, era: 'classic', teams: ['BRA', 'FRA'] },
  ],
  [h2hKey('BRA', 'MEX')]: [
    { text: "Mexico's Guillermo Ochoa denied Brazil over and over in a scoreless 2014 group stage draw, one of the great individual goalkeeping displays in World Cup history.", category: 'player', score: 8, era: 'modern', teams: ['BRA', 'MEX'] },
  ],
  [h2hKey('COL', 'ENG')]: [
    { text: "England beat Colombia on penalties in the 2018 round of 16, their first ever World Cup shootout win after five previous defeats.", category: 'penalty', score: 8, era: 'modern', teams: ['COL', 'ENG'] },
  ],
  [h2hKey('ENG', 'MEX')]: [
    { text: "Bobby Charlton's thunderous strike from 30 yards against Mexico in the 1966 group stage is still shown as one of the great World Cup goals from England's only title-winning campaign.", category: 'player', score: 8, era: 'vintage', teams: ['ENG', 'MEX'] },
  ],
  [h2hKey('ENG', 'POR')]: [
    { text: "Portugal beat England on penalties in the 2006 quarter-final after Wayne Rooney was sent off for a stamp on Ricardo Carvalho, and Cristiano Ronaldo was seen winking at his own bench.", category: 'penalty', score: 9, era: 'recent', teams: ['ENG', 'POR'] },
  ],
  [h2hKey('ESP', 'PAR')]: [
    { text: "Paraguay pushed Spain all the way in the 2010 quarter-final, missing a penalty of their own before David Villa's late strike sent Spain through on their way to the title.", category: 'wc-history', score: 7, era: 'modern', teams: ['ESP', 'PAR'] },
  ],
  [h2hKey('ESP', 'POR')]: [
    { text: "Spain and Portugal drew 3-3 in the 2018 group stage in one of the great matches of the tournament, capped by a Cristiano Ronaldo free kick in stoppage time to level it.", category: 'player', score: 10, era: 'modern', teams: ['ESP', 'POR'] },
  ],
  [h2hKey('FRA', 'MAR')]: [
    { text: "France beat Morocco 2-0 in the 2022 semi-final, ending the best World Cup run by an African nation in the tournament's history.", category: 'wc-history', score: 9, era: 'modern', teams: ['FRA', 'MAR'] },
  ],
  [h2hKey('FRA', 'PAR')]: [
    { text: "France beat Paraguay 1-0 in the 1998 round of 16 on the first golden goal ever scored at a World Cup, a header by Laurent Blanc.", category: 'record', score: 9, era: 'recent', teams: ['FRA', 'PAR'] },
  ],
  [h2hKey('MAR', 'POR')]: [
    { text: "Portugal beat Morocco 1-0 in the 2018 group stage on an early Cristiano Ronaldo header, a rare bright spot in an otherwise difficult tournament for Portugal.", category: 'wc-history', score: 7, era: 'modern', teams: ['MAR', 'POR'] },
  ],
  [h2hKey('MEX', 'USA')]: [
    { text: "The USA beat Mexico 2-0 in the 2002 round of 16, a result CONCACAF rivals still refer to by its nickname, 'Dos a Cero'.", category: 'h2h', score: 9, era: 'recent', teams: ['MEX', 'USA'] },
  ],
  [h2hKey('POR', 'USA')]: [
    { text: "The USA shocked Portugal 3-2 in the 2002 group stage, scoring three times in the first 36 minutes against a Portugal side featuring Figo and Rui Costa.", category: 'upset', score: 9, era: 'recent', teams: ['POR', 'USA'] },
  ],
}

// ── Single-team facts ─────────────────────────────────────────────────────────
// Every team in the 2026 field has a deep bank of self-contained facts, used
// whenever the two teams on screen have no head-to-head history together (or
// as extra rotation options otherwise). Traditional football powers get more
// facts since they tend to play more matches across a tournament. A fact here
// may mention another country only when that country is directly part of the
// story (an opponent beaten, a group they were drawn in), never as a
// standalone unrelated aside.
const RAW_TEAM_FACTS: Record<string, RawFact[]> = {

  // ── Major footballing nations (10+ facts) ─────────────────────────────────

  BRA: [
    { text: "Brazil are the only team to show up at every single World Cup since 1930. All 22 editions, no exceptions.", category: 'record', era: 'vintage', teams: ['BRA'] },
    { text: "Doctors thought his career was finished. Ronaldo came back from two serious knee injuries and scored 8 goals to win the 2002 Golden Boot.", category: 'player', era: 'recent', teams: ['BRA'] },
    { text: "Pelé is the only player to win three World Cups, in 1958, 1962, and 1970. He was 17 years old when he scored twice in his first final.", category: 'player', score: 10, era: 'classic', teams: ['BRA'] },
    { text: "Brazil have won the World Cup five times, more than any other country. Their last title came in 2002.", category: 'record', era: 'recent', teams: ['BRA'] },
    { text: "Garrincha played almost his entire career with one leg shorter than the other and a bent spine, and Brazil never lost a World Cup match he played in.", category: 'trivia', score: 8, era: 'vintage', teams: ['BRA'] },
    { text: "Brazil's 1970 side is still widely considered the greatest team ever assembled, built around Pelé, Jairzinho, and Carlos Alberto's famous final goal.", category: 'wc-history', era: 'classic', teams: ['BRA'] },
    { text: "Jairzinho scored in every single match of the 1970 World Cup, six games in a row, a record that still stands today.", category: 'record', score: 9, era: 'classic', teams: ['BRA'] },
    { text: "Zico never won a World Cup despite being one of the best players of his generation, retiring from the national team after Brazil lost to France in the 1986 quarter-finals on penalties.", category: 'trivia', era: 'classic', teams: ['BRA'] },
    { text: "Brazil have won the World Cup on three different continents, more spread out than any other champion in the tournament's history.", category: 'record', era: 'recent', teams: ['BRA'] },
    { text: "Ronaldinho and Ronaldo played together for Brazil at the 2002 World Cup, then were teammates again in 2006, though that second run only reached the quarter-finals.", category: 'player', era: 'recent', teams: ['BRA'] },
    { text: "Carlos Alberto's thunderous finish to cap the 1970 final, a move that started deep in Brazil's own half and touched nearly every outfield player, is still called the greatest team goal in World Cup history.", category: 'player', score: 9, era: 'classic', teams: ['BRA'] },
    { text: "Brazil have been eliminated by the team that went on to win the tournament in three of their last five World Cup exits, including France in 1998 and Germany in 2014.", category: 'trivia', era: 'modern', teams: ['BRA'] },
    { text: "Neymar broke Pelé's all-time Brazil goalscoring record in 2023, a mark that had stood for more than 50 years.", category: 'record', era: 'modern', teams: ['BRA'] },
    { text: "Brazil's 'Three Rs' front line at the 2002 World Cup, Ronaldo, Rivaldo, and Ronaldinho, combined for the majority of the team's goals on their way to a fifth title.", category: 'player', era: 'recent', teams: ['BRA'] },
  ],

  ARG: [
    { text: "Messi's fifth World Cup ended with the one thing missing from his career: the trophy, plus the Golden Ball and Golden Boot in the same tournament. Nobody else has ever swept all three.", category: 'player', score: 10, era: 'modern', teams: ['ARG'] },
    { text: "Argentina won all three of their 2026 group games and conceded only once, the tightest defence of any team with a perfect record.", category: 'record', era: 'modern', teams: ['ARG'] },
    { text: "Diego Maradona scored the 'Hand of God' and the 'Goal of the Century' four minutes apart in the same 1986 quarter-final against England.", category: 'player', score: 10, era: 'classic', teams: ['ARG'] },
    { text: "Argentina have won the World Cup three times, in 1978, 1986, and 2022, with 44 years between their first and their most recent.", category: 'record', era: 'modern', teams: ['ARG'] },
    { text: "Lionel Scaloni had never managed a senior team before taking charge of Argentina in 2018. Four years later he won them the World Cup.", category: 'trivia', era: 'modern', teams: ['ARG'] },
    { text: "Emiliano Martínez saved a penalty in the last minute of extra time against France in the 2022 final shootout, then won the tournament's best goalkeeper award.", category: 'penalty', score: 9, era: 'modern', teams: ['ARG'] },
    { text: "Argentina lost their opening group game at the 2022 World Cup to Saudi Arabia, then didn't lose again for the rest of the tournament.", category: 'upset', era: 'modern', teams: ['ARG'] },
    { text: "Gabriel Batistuta is the only player to score a hat-trick at two separate World Cups, doing it in 1994 and 1998.", category: 'player', era: 'recent', teams: ['ARG'] },
    { text: "Alfredo Di Stéfano was born in Argentina and never played a single World Cup match for any of the three countries he represented internationally: Argentina, Colombia, and Spain.", category: 'trivia', era: 'vintage', teams: ['ARG'] },
    { text: "Argentina's 'Muchachos' anthem, sung by fans at every match in Qatar, was actually written and released months before the 2022 World Cup even began.", category: 'trivia', era: 'modern', teams: ['ARG'] },
    { text: "Mario Kempes was the top scorer at the 1978 World Cup, netting twice in the final as Argentina won their first title on home soil.", category: 'player', score: 8, era: 'classic', teams: ['ARG'] },
    { text: "Argentina went 36 matches unbeaten between 2019 and the 2022 World Cup final, one of the longest runs by any national team in football history.", category: 'record', score: 8, era: 'modern', teams: ['ARG'] },
    { text: "Messi missed a penalty during normal time of the 2022 final before scoring twice more, finishing with a hat-trick across the full match including extra time.", category: 'player', score: 9, era: 'modern', teams: ['ARG'] },
    { text: "Gonzalo Montiel scored the winning penalty in the 2022 final shootout, the same player who had given away the penalty that let France level the match in the first place.", category: 'trivia', era: 'modern', teams: ['ARG'] },
  ],

  GER: [
    { text: "Germany have reached more World Cup semi-finals than any other country, 13 in total. Every time they get there, they finish in the top three.", category: 'record', era: 'recent', teams: ['GER'] },
    { text: "Germany have won the World Cup four times and been runners-up four more, more final appearances than any other country.", category: 'record', era: 'recent', teams: ['GER'] },
    { text: "Miroslav Klose scored 16 goals across four World Cups, the most of any player in the tournament's history.", category: 'record', score: 8, era: 'modern', teams: ['GER'] },
    { text: "West Germany came back from 2-0 down at half-time to beat Hungary's 'Golden Team' in the 1954 final, a result still called the Miracle of Bern.", category: 'wc-history', score: 9, era: 'vintage', teams: ['GER'] },
    { text: "Germany went out in the group stage as defending champions in 2018, their earliest World Cup exit in 80 years, after losing to both Mexico and South Korea.", category: 'upset', era: 'modern', teams: ['GER'] },
    { text: "Franz Beckenbauer won the World Cup as both a player, in 1974, and a manager, in 1990, one of only three people in history to manage that double.", category: 'player', era: 'recent', teams: ['GER'] },
    { text: "Germany's 2014 World Cup winning squad included seven players from a single club, Bayern Munich.", category: 'trivia', era: 'modern', teams: ['GER'] },
    { text: "Sepp Herberger managed West Germany to their first World Cup title in 1954 despite being told beforehand that his team had no realistic chance against Hungary.", category: 'wc-history', era: 'vintage', teams: ['GER'] },
    { text: "Lothar Matthäus played in five different World Cups for Germany, more tournament appearances than anyone else in the country's history.", category: 'record', era: 'recent', teams: ['GER'] },
    { text: "Germany's 7-1 win over Brazil in 2014 remains the biggest ever defeat suffered by a host nation at a World Cup.", category: 'record', score: 9, era: 'modern', teams: ['GER'] },
  ],

  FRA: [
    { text: "France reached four World Cup finals since 1998 and won two of them. No other nation has matched that in the same 28-year span.", category: 'record', era: 'recent', teams: ['FRA'] },
    { text: "Mbappé became only the second teenager ever to score in a World Cup final, in 2018, after Pelé in 1958. Both scored twice, both teams won.", category: 'player', era: 'modern', teams: ['FRA'] },
    { text: "France won their first World Cup in 1998 as hosts, then went out in the group stage at the very next tournament without scoring a single goal.", category: 'upset', era: 'recent', teams: ['FRA'] },
    { text: "Zinedine Zidane scored twice in the 1998 final and was sent off in the 2006 final for headbutting an opponent, in what turned out to be his last ever match.", category: 'player', score: 10, era: 'recent', teams: ['FRA'] },
    { text: "France's 2018 World Cup winning squad had an average age of just 26, one of the youngest champion squads in decades.", category: 'trivia', era: 'modern', teams: ['FRA'] },
    { text: "Just Fontaine scored 13 goals at the 1958 World Cup, still the record for the most goals by a single player in one tournament.", category: 'record', score: 8, era: 'vintage', teams: ['FRA'] },
    { text: "France reached back-to-back World Cup finals in 2018 and 2022, winning one and losing the other on penalties.", category: 'record', era: 'modern', teams: ['FRA'] },
    { text: "Didier Deschamps has won the World Cup as both a captain, in 1998, and a manager, in 2018, one of only three people to do both.", category: 'player', era: 'modern', teams: ['FRA'] },
    { text: "Kylian Mbappé scored a hat-trick in the 2022 final and still ended up on the losing side, only the second hat-trick ever scored in a World Cup final.", category: 'player', score: 10, era: 'modern', teams: ['FRA'] },
    { text: "Michel Platini scored 9 goals at Euro 1984 but never got past a World Cup semi-final in three tournaments playing for France.", category: 'trivia', era: 'classic', teams: ['FRA'] },
    { text: "N'Golo Kanté was playing in France's fourth tier of football just five years before starting in the 2018 World Cup final.", category: 'trivia', score: 8, era: 'modern', teams: ['FRA'] },
    { text: "Hugo Lloris made more appearances as France's captain than anyone in the country's history, lifting the World Cup in 2018 along the way.", category: 'record', era: 'modern', teams: ['FRA'] },
    { text: "France conceded just six goals across their entire 2018 World Cup winning campaign, one of the tightest defensive records of any champion.", category: 'record', era: 'modern', teams: ['FRA'] },
    { text: "Olivier Giroud became France's all-time leading scorer during the 2022 World Cup, surpassing Thierry Henry's long-standing record mid-tournament.", category: 'record', era: 'modern', teams: ['FRA'] },
  ],

  ENG: [
    { text: "Harry Kane's 6 goals won the 2018 Golden Boot, the first England player to do it since Gary Lineker in 1986.", category: 'player', era: 'modern', teams: ['ENG'] },
    { text: "England went unbeaten through their 2026 group: a 4-2 win over Croatia, a routine 2-0 over Panama, and one draw with Ghana.", category: 'record', era: 'modern', teams: ['ENG'] },
    { text: "England's only World Cup title came in 1966, on home soil, beating West Germany 4-2 in extra time after a hotly disputed goal that may not have crossed the line.", category: 'wc-history', score: 9, era: 'vintage', teams: ['ENG'] },
    { text: "Gary Lineker won the Golden Boot at the 1986 World Cup despite England losing to Argentina in the quarter-final, the same match as Maradona's Hand of God.", category: 'player', era: 'classic', teams: ['ENG'] },
    { text: "England had never won a World Cup penalty shootout until 2018, when they beat Colombia in the round of 16 after five previous shootout defeats.", category: 'penalty', era: 'modern', teams: ['ENG'] },
    { text: "David Beckham was sent off against Argentina at the 1998 World Cup and spent years being blamed by fans before becoming one of England's most decorated players.", category: 'player', score: 8, era: 'recent', teams: ['ENG'] },
    { text: "England reached the semi-finals in 2018, their best finish in 28 years, only to lose to Croatia in extra time.", category: 'wc-history', era: 'modern', teams: ['ENG'] },
    { text: "England failed to qualify for the 1994 World Cup, missing the tournament entirely under manager Graham Taylor.", category: 'milestone', era: 'recent', teams: ['ENG'] },
    { text: "Bobby Moore is still the only England captain to lift the World Cup, doing it in 1966 in front of his own home crowd at Wembley.", category: 'player', score: 8, era: 'vintage', teams: ['ENG'] },
    { text: "Wayne Rooney held England's all-time scoring record for over a decade before Harry Kane finally passed him in 2025.", category: 'trivia', era: 'modern', teams: ['ENG'] },
    { text: "Geoff Hurst is the only player to score a hat-trick in a World Cup final, doing it for England in the 1966 final.", category: 'record', score: 9, era: 'vintage', teams: ['ENG'] },
    { text: "England went 12 years and five tournaments without winning a single World Cup knockout match, from 2006 until finally beating Colombia on penalties in 2018.", category: 'record', era: 'modern', teams: ['ENG'] },
    { text: "Paul Gascoigne's tears after picking up a booking in the 1990 semi-final, which would have ruled him out of the final, became one of the most iconic images in England football history.", category: 'player', score: 8, era: 'recent', teams: ['ENG'] },
    { text: "England's 1966 triumph was the first World Cup final ever broadcast live on television to homes across the country.", category: 'milestone', era: 'vintage', teams: ['ENG'] },
  ],

  ESP: [
    { text: "Spain won three straight major tournaments, Euro 2008, the 2010 World Cup, and Euro 2012. No other nation has ever done that.", category: 'record', era: 'modern', teams: ['ESP'] },
    { text: "Spain's only slip in the 2026 group stage was a scoreless draw with debutants Cape Verde. They beat Saudi Arabia 4-0 and Uruguay 1-0 either side of it.", category: 'record', era: 'modern', teams: ['ESP'] },
    { text: "Spain won their only World Cup in 2010 without ever leading during any of their three knockout matches until the winning goals themselves.", category: 'wc-history', era: 'modern', teams: ['ESP'] },
    { text: "Andrés Iniesta scored the only goal of the 2010 final in extra time, deep into the 116th minute.", category: 'player', score: 9, era: 'modern', teams: ['ESP'] },
    { text: "Spain lost their opening match at the 2010 World Cup and still went on to win the whole tournament, the first time that had ever happened.", category: 'upset', score: 8, era: 'modern', teams: ['ESP'] },
    { text: "David Villa is Spain's all-time top scorer at World Cups, with goals across three different tournaments.", category: 'record', era: 'modern', teams: ['ESP'] },
    { text: "Spain failed to get past the group stage at the 2014 World Cup, going out as defending champions just four years after winning it all.", category: 'upset', era: 'modern', teams: ['ESP'] },
    { text: "Sergio Ramos is Spain's most capped player in history, appearing across four World Cups in a 20-year international career.", category: 'record', era: 'modern', teams: ['ESP'] },
    { text: "Spain's golden generation never lost a competitive knockout match at a major tournament between 2008 and 2012, a run that included the 2010 World Cup and two European Championships.", category: 'record', era: 'modern', teams: ['ESP'] },
    { text: "Luis Aragonés ended a 44-year wait for a major trophy at Euro 2008, before Vicente del Bosque led the same core group to the World Cup two years later.", category: 'wc-history', era: 'recent', teams: ['ESP'] },
    { text: "Xavi and Andrés Iniesta played over 100 minutes together in the 2010 final without either one scoring, until Iniesta finally broke through deep into extra time.", category: 'trivia', era: 'modern', teams: ['ESP'] },
    { text: "Spain became the first European team ever to win a World Cup held outside Europe, lifting the trophy in South Africa in 2010.", category: 'milestone', score: 8, era: 'modern', teams: ['ESP'] },
    { text: "Spain scored just eight goals across seven matches on their way to winning the entire 2010 World Cup, the lowest tally by any champion in the tournament's history.", category: 'record', era: 'modern', teams: ['ESP'] },
    { text: "Iker Casillas made a crucial late save to deny Arjen Robben a clear run on goal in the 2010 final, keeping the scoreline level until Iniesta's winner.", category: 'player', score: 8, era: 'modern', teams: ['ESP'] },
  ],

  NED: [
    { text: "The Netherlands have reached three World Cup finals, in 1974, 1978, and 2010, and lost all three. Their 1974 side is still called the greatest team to never lift the trophy.", category: 'record', era: 'modern', teams: ['NED'] },
    { text: "Dennis Bergkamp's injury-time volley against Argentina in the 1998 quarter-final is still considered one of the greatest goals in World Cup history.", category: 'player', score: 10, era: 'recent', teams: ['NED'] },
    { text: "The Netherlands introduced Total Football to the world at the 1974 World Cup under Johan Cruyff, a tactical idea that still shapes how the modern game is coached.", category: 'wc-history', era: 'classic', teams: ['NED'] },
    { text: "Dennis Bergkamp, Marco van Basten, and Ruud Gullit never won a World Cup together despite being some of the most gifted players of their generation.", category: 'trivia', era: 'recent', teams: ['NED'] },
    { text: "Louis van Gaal brought on a substitute goalkeeper in the final minute of extra time of the 2014 quarter-final, specifically for the penalty shootout, and it worked.", category: 'trivia', score: 8, era: 'modern', teams: ['NED'] },
    { text: "The Netherlands failed to qualify for the 2002 World Cup, despite reaching the semi-finals of the tournament four years earlier.", category: 'milestone', era: 'recent', teams: ['NED'] },
    { text: "Johan Cruyff never played at the 1978 World Cup despite starring at the 1974 tournament, one of the most debated absences in World Cup history.", category: 'trivia', era: 'classic', teams: ['NED'] },
    { text: "The Netherlands reached the World Cup final in 2010 and finished third in 2014, one of the most consistent stretches by any team that decade.", category: 'record', era: 'modern', teams: ['NED'] },
    { text: "Wesley Sneijder won the treble with Inter Milan in 2010 and reached the World Cup final that same summer, one of football's most remarkable single-year runs.", category: 'player', era: 'modern', teams: ['NED'] },
    { text: "Frank Rijkaard famously spat at West Germany's Rudi Völler during the 1990 World Cup round of 16, one of the most notorious incidents in tournament history.", category: 'trivia', score: 8, era: 'recent', teams: ['NED'] },
  ],

  POR: [
    { text: "Portugal's Eusébio scored four goals by himself to overturn a 3-0 deficit and win 5-3 in the 1966 quarter-final, still one of the great individual comebacks in World Cup history.", category: 'player', score: 9, era: 'vintage', teams: ['POR'] },
    { text: "Luis Figo, Rui Costa, and a teenage Cristiano Ronaldo all played for Portugal at the 2006 World Cup, arguably their most talented squad ever assembled.", category: 'wc-history', era: 'recent', teams: ['POR'] },
    { text: "Cristiano Ronaldo has scored at five different World Cups, the only male player in history to do that.", category: 'record', score: 8, era: 'modern', teams: ['POR'] },
    { text: "Portugal reached their first ever World Cup semi-final in 1966, powered by Eusébio's nine goals, still a Portuguese record for a single tournament.", category: 'record', era: 'vintage', teams: ['POR'] },
    { text: "Ronaldo was benched for Portugal's round of 16 win over Switzerland in 2022, and his replacement Gonçalo Ramos scored a hat-trick instead.", category: 'player', era: 'modern', teams: ['POR'] },
    { text: "Portugal missed four straight World Cups between 1986 and 1998, before Figo's generation finally broke through.", category: 'milestone', era: 'recent', teams: ['POR'] },
    { text: "Ronaldo and Messi both entered the 2018 World Cup as the two most decorated players alive, and neither one made it past the round of 16.", category: 'trivia', era: 'modern', teams: ['POR'] },
    { text: "Portugal's golden generation of Figo, Rui Costa, and Paulo Sousa reached the semi-finals of Euro 2000 but never got past a World Cup quarter-final together.", category: 'trivia', era: 'recent', teams: ['POR'] },
    { text: "Portugal have never won a World Cup, despite producing Eusébio, Figo, and Cristiano Ronaldo, three separate Ballon d'Or winning generations.", category: 'trivia', era: 'modern', teams: ['POR'] },
    { text: "Pepe and Cristiano Ronaldo have played together for Portugal across four different World Cups, one of the longest-running partnerships in the national team's history.", category: 'trivia', era: 'modern', teams: ['POR'] },
    { text: "Cristiano Ronaldo was in tears on the bench after being substituted in his final World Cup match in 2022, a 1-0 loss to Morocco that ended Portugal's run.", category: 'player', score: 8, era: 'modern', teams: ['POR'] },
    { text: "Diogo Costa saved a penalty against Uruguay in the 2022 group stage, part of a run that also included a clean sheet against Ghana.", category: 'penalty', era: 'modern', teams: ['POR'] },
    { text: "Portugal reached the World Cup in 1986 for the first time in 24 years, then didn't return again until 2002, a stop-start history compared to their success at the Euros.", category: 'milestone', era: 'recent', teams: ['POR'] },
    { text: "João Félix, Bruno Fernandes, and Bernardo Silva formed part of Portugal's supporting cast around Ronaldo for over a decade without ever winning a World Cup together.", category: 'trivia', era: 'modern', teams: ['POR'] },
  ],

  // ── The rest of the field (6+ facts each) ─────────────────────────────────

  RSA: [
    { text: "South Africa are the only World Cup host that never got out of the group stage. Three games on home turf in 2010, and none of them were enough.", category: 'wc-history', era: 'modern', teams: ['RSA'] },
    { text: "Siphiwe Tshabalala scored the opening goal of the first ever World Cup held in Africa, back in 2010. It's still one of the most replayed strikes in the tournament's history.", category: 'wc-history', score: 8, era: 'modern', teams: ['RSA'] },
    { text: "South Africa drew their opening match of the 2010 World Cup 1-1 with Mexico in front of a home crowd of over 84,000.", category: 'wc-history', era: 'modern', teams: ['RSA'] },
    { text: "South Africa beat France 2-1 in their final 2010 group game, but still went out on goal difference after already being eliminated by that point.", category: 'trivia', era: 'modern', teams: ['RSA'] },
    { text: "South Africa's 2010 World Cup was the first ever held on African soil, after FIFA introduced continental rotation specifically to bring the tournament there.", category: 'milestone', era: 'modern', teams: ['RSA'] },
    { text: "The vuvuzela became a global phenomenon during South Africa's 2010 World Cup, with FIFA considering a ban before deciding to let it stay.", category: 'trivia', era: 'modern', teams: ['RSA'] },
  ],

  CAN: [
    { text: "Canada waited 36 years for a World Cup goal. They played three scoreless games in 1986, then finally broke the curse against Croatia in 2022.", category: 'record', score: 8, era: 'modern', teams: ['CAN'] },
    { text: "Nobody saw it coming when Canada finished top of CONCACAF qualifying for 2022, ahead of both the USA and Mexico.", category: 'upset', era: 'modern', teams: ['CAN'] },
    { text: "2026 is the first World Cup ever shared by three hosts. Canada is splitting duties with the USA and Mexico after 96 years of solo tournaments.", category: 'milestone', era: 'modern', teams: ['CAN'] },
    { text: "Canada's Alphonso Davies became one of the most valuable full-backs in world football at Bayern Munich before helping lead his country into World Cup co-hosting duties.", category: 'trivia', era: 'modern', teams: ['CAN'] },
    { text: "Canada's only previous World Cup, in 1986, remained their sole appearance for 36 years until they qualified again for 2022.", category: 'milestone', era: 'modern', teams: ['CAN'] },
    { text: "Canada beat South Africa 1-0 in the 2026 round of 32, the first team through to the round of 16 at their own tournament.", category: 'wc-history', era: 'modern', teams: ['CAN'] },
    { text: "Canada's entire 1986 World Cup squad went scoreless across all three group games, one of only a handful of teams in tournament history to do that.", category: 'record', era: 'classic', teams: ['CAN'] },
    { text: "Canada conceded seven goals in their first two matches of the 2022 World Cup, including a 4-1 loss to Croatia despite taking an early lead through Alphonso Davies.", category: 'wc-history', era: 'modern', teams: ['CAN'] },
    { text: "John Herdman managed both Canada's men's and women's national teams before leading the men back to the World Cup for the first time in 36 years.", category: 'player', era: 'modern', teams: ['CAN'] },
    { text: "Canada's 2026 World Cup is being played across host cities shared with the USA and Mexico, the first tournament ever staged by three countries at once.", category: 'trivia', era: 'modern', teams: ['CAN'] },
    { text: "Canada's qualifying run for 2022 was built around teenage prodigies Alphonso Davies and Jonathan David, two of the youngest core players of any qualified nation.", category: 'player', era: 'modern', teams: ['CAN'] },
    { text: "Canada's first ever World Cup match, in 1986, was a 1-0 loss to defending champions France, about as tough a draw as a debutant nation could get.", category: 'wc-history', era: 'classic', teams: ['CAN'] },
  ],

  JPN: [
    { text: "Japan came from behind to beat both Germany and Spain in the 2022 group stage. Two former world champions, in the same group, both flipped in the second half.", category: 'upset', score: 9, era: 'modern', teams: ['JPN'] },
    { text: "Japan have never missed a World Cup since their first qualification in 1998, reaching the tournament seven straight times.", category: 'record', era: 'recent', teams: ['JPN'] },
    { text: "Japan's fans famously stayed behind after matches at the 2018 and 2022 World Cups to clean up their own section of the stadium, drawing praise from FIFA.", category: 'trivia', era: 'modern', teams: ['JPN'] },
    { text: "Japan reached the round of 16 at the 2002 World Cup they co-hosted with South Korea, their best finish up to that point.", category: 'wc-history', era: 'recent', teams: ['JPN'] },
    { text: "Hidetoshi Nakata became the first Japanese player to shine at a European-hosted World Cup, featuring at France 1998 before a career at Roma and Parma.", category: 'player', era: 'recent', teams: ['JPN'] },
    { text: "Japan finished top of a group containing both Germany and Spain at the 2022 World Cup, one of the most surprising group outcomes in tournament history.", category: 'upset', era: 'modern', teams: ['JPN'] },
  ],

  PAR: [
    { text: "Paraguay's goalkeeper José Luis Chilavert scored more than 60 career goals from free kicks and penalties. He's still the only keeper in history to score a World Cup hat-trick.", category: 'player', score: 9, era: 'recent', teams: ['PAR'] },
    { text: "Paraguay reached the World Cup quarter-finals in 2010, the best finish in the country's history.", category: 'record', era: 'modern', teams: ['PAR'] },
    { text: "Paraguay qualified for four straight World Cups from 1998 to 2010, their most consistent run in the competition's history.", category: 'milestone', era: 'modern', teams: ['PAR'] },
    { text: "Paraguay didn't concede a single goal until their 2010 quarter-final, one of the best defensive runs of that entire tournament.", category: 'record', era: 'modern', teams: ['PAR'] },
    { text: "Paraguay's 2010 World Cup ended with a 1-0 quarter-final loss to eventual champions Spain, their best ever finish.", category: 'wc-history', era: 'modern', teams: ['PAR'] },
    { text: "Paraguay have reached the World Cup knockout rounds three times, in 1998, 2002, and 2010, without ever getting past the quarter-finals.", category: 'record', era: 'modern', teams: ['PAR'] },
    { text: "Paraguay's 1998 and 2002 World Cups both ended in the round of 16 on penalty shootouts, the only nation to go out that way in back-to-back tournaments.", category: 'penalty', score: 7, era: 'recent', teams: ['PAR'] },
    { text: "José Luis Chilavert was sent off at the 1998 World Cup after a clash with France's David Trezeguet, ending his tournament early despite his heroics as a scoring goalkeeper.", category: 'player', era: 'recent', teams: ['PAR'] },
    { text: "Paraguay's 2002 World Cup ended on penalties against Germany in the round of 16, despite Chilavert nearly scoring from a trademark free kick late in normal time.", category: 'penalty', era: 'recent', teams: ['PAR'] },
    { text: "Paraguay have reached the World Cup eight times in total, more than most South American nations outside the traditional big three.", category: 'record', era: 'recent', teams: ['PAR'] },
    { text: "Paraguay's golden generation of the 2000s, including Roque Santa Cruz, qualified for three straight World Cups without ever winning a single knockout match.", category: 'trivia', era: 'recent', teams: ['PAR'] },
  ],

  MAR: [
    { text: "Morocco knocked out Belgium, Spain, and Portugal on their way to the 2022 semi-final, becoming the first African or Arab nation to ever get that far.", category: 'upset', score: 10, era: 'modern', teams: ['MAR'] },
    { text: "Achraf Hakimi grew up a five-minute walk from the Bernabéu and chose to represent Morocco over Spain, the country where he was born and raised.", category: 'trivia', era: 'modern', teams: ['MAR'] },
    { text: "Morocco's 2022 run made them the first team from Africa or the Arab world to ever beat three European teams at a single World Cup.", category: 'record', era: 'modern', teams: ['MAR'] },
    { text: "Walid Regragui had been Morocco's manager for less than two months before leading them to the 2022 semi-final.", category: 'trivia', era: 'modern', teams: ['MAR'] },
    { text: "Morocco conceded just one goal in their entire run to the 2022 semi-final, and it was an own goal.", category: 'record', era: 'modern', teams: ['MAR'] },
    { text: "Sofiane Boufal danced with his mother on the pitch after Morocco's 2022 quarter-final win, one of the most replayed celebrations of the tournament.", category: 'trivia', era: 'modern', teams: ['MAR'] },
    { text: "Morocco's players celebrated several of their 2022 wins by embracing their mothers on the pitch, turning the tournament into a celebration of family as much as football.", category: 'trivia', era: 'modern', teams: ['MAR'] },
    { text: "Hakim Ziyech and Noussair Mazraoui had both walked away from the national team in a dispute with the previous coach before Walid Regragui brought them back for the historic 2022 run.", category: 'trivia', era: 'modern', teams: ['MAR'] },
    { text: "Morocco's run to the 2022 semi-final made them the first African or Arab team to reach the final four in the World Cup's 92-year history.", category: 'milestone', score: 8, era: 'modern', teams: ['MAR'] },
    { text: "Morocco kept back-to-back clean sheets against Belgium, Spain, and Portugal across the 2022 knockout rounds, before finally conceding to France in the semi-final.", category: 'record', score: 8, era: 'modern', teams: ['MAR'] },
    { text: "Morocco's 2022 semi-final run was watched by an estimated one billion people worldwide, according to FIFA broadcast figures.", category: 'trivia', era: 'modern', teams: ['MAR'] },
    { text: "Morocco beat Croatia in the third-place match in 2022, capping the best World Cup finish by an African nation in the tournament's history.", category: 'wc-history', era: 'modern', teams: ['MAR'] },
  ],

  CIV: [
    { text: "Didier Drogba dragged Ivory Coast to their first ever World Cup in 2006, straight into a group with Argentina, Netherlands, and Serbia, still called one of the toughest groups ever drawn.", category: 'wc-history', era: 'recent', teams: ['CIV'] },
    { text: "Goalkeeper Boubacar Barry hadn't played a single minute at the 2015 Africa Cup of Nations. He came off the bench in the final, saved three penalties in the shootout, then scored the winner himself.", category: 'penalty', score: 9, era: 'modern', teams: ['CIV'] },
    { text: "Ivory Coast won the 2015 Africa Cup of Nations on penalties after a shootout that went 9-8, the longest in the competition's history.", category: 'penalty', era: 'modern', teams: ['CIV'] },
    { text: "Ivory Coast have qualified for three World Cups, in 2006, 2010, and 2014, without ever escaping the group stage in any of them.", category: 'record', era: 'modern', teams: ['CIV'] },
    { text: "Yaya Touré won four straight African Footballer of the Year awards while playing for Ivory Coast, from 2011 to 2014.", category: 'player', era: 'modern', teams: ['CIV'] },
    { text: "Ivory Coast's 'Golden Generation', featuring the Touré brothers and Didier Drogba, never got past a World Cup group stage despite dominating African football for a decade.", category: 'trivia', era: 'modern', teams: ['CIV'] },
  ],

  NOR: [
    { text: "Erling Haaland didn't play a single minute at a World Cup until 2026. Norway missed the 2022 tournament despite having the most dangerous striker on the planet.", category: 'trivia', score: 8, era: 'modern', teams: ['NOR'] },
    { text: "Norway beat Brazil at the 1998 World Cup and still went out in the round of 16, losing to Italy on a disputed late penalty.", category: 'wc-history', era: 'recent', teams: ['NOR'] },
    { text: "Norway have only reached the World Cup knockout rounds once, in 1998, in their entire history.", category: 'record', era: 'recent', teams: ['NOR'] },
    { text: "Norway went unbeaten for over a dozen matches during their qualifying campaign for the 1998 World Cup, a country of just 4.5 million people at the time.", category: 'trivia', era: 'recent', teams: ['NOR'] },
    { text: "Erling Haaland scored 9 goals in a single game at the 2019 Under-20 World Cup, against Honduras, before he'd ever played for the senior team.", category: 'record', era: 'modern', teams: ['NOR'] },
    { text: "Norway missed six consecutive World Cups between 2002 and 2022 despite regularly producing top scorers in Europe's biggest leagues.", category: 'milestone', era: 'modern', teams: ['NOR'] },
    { text: "Norway's golden generation of the 1990s, built around Tore André Flo and a young Ole Gunnar Solskjær, reached their highest ever FIFA ranking of second in the world in 1993.", category: 'record', era: 'recent', teams: ['NOR'] },
    { text: "Norway qualified for the 1998 World Cup by finishing above both Italy and England in their qualifying group, an outcome almost nobody predicted.", category: 'upset', score: 8, era: 'recent', teams: ['NOR'] },
    { text: "Martin Ødegaard became Norway's youngest ever senior debutant at 15 years old, years before helping push the country back toward World Cup contention.", category: 'player', era: 'modern', teams: ['NOR'] },
    { text: "Norway have never won a World Cup knockout match in their history, going out in the round of 16 the only time they've ever reached it, in 1998.", category: 'record', era: 'recent', teams: ['NOR'] },
    { text: "Norway's 1994 squad reached the World Cup on a famously direct, long-ball tactical approach under coach Egil Olsen, nicknamed 'Drillo'.", category: 'trivia', era: 'recent', teams: ['NOR'] },
  ],

  SWE: [
    { text: "Zlatan Ibrahimović scored 62 international goals for Sweden, more than anyone else in the country's history, and never once played at a World Cup.", category: 'trivia', score: 8, era: 'modern', teams: ['SWE'] },
    { text: "Sweden reached the 2018 semi-finals with no Zlatan and no recognisable superstar names. They made the final four anyway.", category: 'wc-history', era: 'modern', teams: ['SWE'] },
    { text: "Sweden have reached the World Cup semi-finals three times, in 1938, 1950, and 1994, without ever repeating their 1958 final appearance.", category: 'record', era: 'recent', teams: ['SWE'] },
    { text: "Sweden beat Italy in a playoff to qualify for the 2018 World Cup, a result that ended Italy's run of qualifying for every tournament since 1958.", category: 'upset', era: 'modern', teams: ['SWE'] },
    { text: "Henrik Larsson came out of a two-year international retirement to help Sweden qualify for the 2006 World Cup, at the age of 34.", category: 'player', era: 'recent', teams: ['SWE'] },
    { text: "Sweden's Fredrik Ljungberg played in three World Cups and was once considered the best midfielder never to appear at one for a major club at that stage of his career.", category: 'trivia', era: 'recent', teams: ['SWE'] },
  ],

  COD: [
    { text: "DR Congo are back at the World Cup after a 52-year wait, the longest gap of any team at the 2026 tournament.", category: 'record', era: 'modern', teams: ['COD'] },
    { text: "DR Congo, then called Zaire, were the first sub-Saharan African team to ever qualify for a World Cup, doing it in 1974.", category: 'milestone', era: 'classic', teams: ['COD'] },
    { text: "DR Congo lost all three of their group games in 1974 without scoring a single goal, conceding 14 in the process.", category: 'wc-history', era: 'classic', teams: ['COD'] },
    { text: "DR Congo's 1974 squad played under the name Zaire, and their exit remains one of the most one-sided World Cup campaigns ever recorded.", category: 'trivia', era: 'classic', teams: ['COD'] },
    { text: "DR Congo's return to the World Cup in 2026 makes them one of only a handful of nations ever to appear at the tournament more than 50 years apart.", category: 'record', era: 'modern', teams: ['COD'] },
    { text: "DR Congo, playing as Zaire in 1974, remain the last African team to leave a World Cup without scoring a single goal.", category: 'record', era: 'classic', teams: ['COD'] },
  ],

  BEL: [
    { text: "Belgium held the FIFA world number one ranking for six straight years, from 2015 to 2021, with De Bruyne, Hazard, Lukaku, and Courtois all peaking together.", category: 'record', era: 'modern', teams: ['BEL'] },
    { text: "Belgium reached the World Cup semi-final in 2018, their best ever finish, then beat England in the third-place match for their highest official placing in history.", category: 'wc-history', score: 7, era: 'modern', teams: ['BEL'] },
    { text: "Belgium's golden generation, including De Bruyne, Hazard, and Lukaku, never got past a World Cup semi-final despite years at the top of the world rankings.", category: 'trivia', era: 'modern', teams: ['BEL'] },
    { text: "Belgium's first ever World Cup appearance came in 1930, the tournament's inaugural edition, one of only four European teams to make the trip to Uruguay.", category: 'milestone', era: 'vintage', teams: ['BEL'] },
    { text: "Jean-Marie Pfaff helped Belgium reach their first ever World Cup semi-final in 1986, still remembered as one of the best goalkeeping performances of that era.", category: 'player', era: 'classic', teams: ['BEL'] },
    { text: "Romelu Lukaku is Belgium's all-time leading scorer, but he's never scored in a World Cup knockout match.", category: 'trivia', era: 'modern', teams: ['BEL'] },
    { text: "Kevin De Bruyne created more goalscoring chances than any other player at the 2018 World Cup, even though Belgium fell short in the semi-final.", category: 'player', score: 8, era: 'modern', teams: ['BEL'] },
    { text: "Romelu Lukaku scored four goals in Belgium's opening two matches of the 2018 World Cup, the best individual start of that tournament.", category: 'player', score: 7, era: 'modern', teams: ['BEL'] },
    { text: "Belgium's rise to the top of the FIFA rankings in 2015 was built on a wave of academy graduates who broke through together at Anderlecht, Genk, and Standard Liège in the early 2010s.", category: 'trivia', era: 'modern', teams: ['BEL'] },
    { text: "Belgium have never reached a World Cup final in their history, their best finish remaining the semi-final in both 1986 and 2018.", category: 'record', era: 'modern', teams: ['BEL'] },
    { text: "Thibaut Courtois won the Golden Glove as the best goalkeeper of the 2018 World Cup, the first Belgian to win a major individual award at the tournament.", category: 'player', era: 'modern', teams: ['BEL'] },
    { text: "Eden Hazard was named to the World Cup's official Best XI in 2018 despite Belgium finishing third rather than reaching the final.", category: 'player', era: 'modern', teams: ['BEL'] },
  ],

  SEN: [
    { text: "Most of Senegal's 2002 World Cup squad played in France's lower divisions. They still knocked out the defending champions in their opening game and reached the quarter-finals.", category: 'upset', score: 9, era: 'recent', teams: ['SEN'] },
    { text: "Senegal reached the quarter-finals in their very first ever World Cup appearance, in 2002, a feat no African debutant has matched since.", category: 'milestone', era: 'recent', teams: ['SEN'] },
    { text: "Sadio Mané won the Africa Cup of Nations with Senegal in 2022, then helped them qualify for the World Cup weeks later, one of the best years of his career.", category: 'player', era: 'modern', teams: ['SEN'] },
    { text: "Senegal became the first African team to reach a World Cup quarter-final since Cameroon in 1990, doing it on their tournament debut.", category: 'record', era: 'recent', teams: ['SEN'] },
    { text: "Senegal's home shirt design has stayed almost unchanged since their historic 2002 campaign, a deliberate nod to that generation.", category: 'trivia', era: 'recent', teams: ['SEN'] },
    { text: "Aliou Cissé played in Senegal's losing 2002 quarter-final as captain, then returned 20 years later to coach the team to their first ever Africa Cup of Nations title.", category: 'player', era: 'recent', teams: ['SEN'] },
  ],

  USA: [
    { text: "The USA reached the semi-finals of the very first World Cup in 1930, beating Belgium and Paraguay before losing to Argentina. It's still their best ever finish.", category: 'wc-history', score: 8, era: 'vintage', teams: ['USA'] },
    { text: "The USA hosted the World Cup in 1994 and set an attendance record that still stands today, despite fielding a team with almost no professional league experience at home.", category: 'milestone', era: 'recent', teams: ['USA'] },
    { text: "The USA reached the quarter-finals of the 2002 World Cup, their best finish since that first 1930 semi-final run 72 years earlier.", category: 'record', era: 'recent', teams: ['USA'] },
    { text: "The USA is co-hosting a World Cup for the first time in 2026, sharing duties with Mexico and Canada after hosting alone in 1994.", category: 'milestone', era: 'modern', teams: ['USA'] },
    { text: "The USA men's team failed to qualify for the 2018 World Cup, the first time they'd missed the tournament since 1986.", category: 'milestone', era: 'modern', teams: ['USA'] },
    { text: "The USA's 1950 upset of England remained their only World Cup win against a European nation for over 40 years afterward.", category: 'record', era: 'vintage', teams: ['USA'] },
    { text: "Christian Pulisic scored the goal that sent the USA through to the 2022 World Cup knockout rounds against Iran, then needed medical attention for a collision on the same play.", category: 'player', score: 8, era: 'modern', teams: ['USA'] },
    { text: "The USA hosted the 1994 World Cup before Major League Soccer even existed, the domestic league didn't launch until two years later.", category: 'milestone', era: 'recent', teams: ['USA'] },
    { text: "The USA missed the 2018 World Cup after a shock qualifying loss to Trinidad and Tobago, their first absence from the tournament since 1986.", category: 'milestone', era: 'modern', teams: ['USA'] },
    { text: "Tab Ramos was the first American to play in Spain's top division, doing so before starring for the USA at the 1990 and 1994 World Cups.", category: 'player', era: 'recent', teams: ['USA'] },
    { text: "The USA's 1930 World Cup squad was nicknamed the 'shot putters' by the European press for their physical style of play.", category: 'trivia', era: 'vintage', teams: ['USA'] },
    { text: "DaMarcus Beasley is the only American man to play in four different World Cups, from 2002 through 2014.", category: 'record', era: 'modern', teams: ['USA'] },
  ],

  BIH: [
    { text: "Bosnia & Herzegovina only became a FIFA member in 1996 and still made it to their first ever World Cup by 2014.", category: 'milestone', era: 'modern', teams: ['BIH'] },
    { text: "Bosnia & Herzegovina's Edin Džeko is the country's all-time leading scorer, and he helped them reach their first ever World Cup in 2014.", category: 'player', score: 7, era: 'modern', teams: ['BIH'] },
    { text: "Bosnia & Herzegovina were drawn into a group with Argentina and Nigeria on their World Cup debut in 2014, one of the toughest possible draws for a first-timer.", category: 'wc-history', era: 'modern', teams: ['BIH'] },
    { text: "Bosnia & Herzegovina's golden generation, built around Džeko and Miralem Pjanić, never made it back to a second World Cup after 2014.", category: 'trivia', era: 'modern', teams: ['BIH'] },
    { text: "Bosnia & Herzegovina's 2026 group stage included a heavy loss to Switzerland before a big win over Qatar sent them through to the round of 32.", category: 'wc-history', era: 'modern', teams: ['BIH'] },
    { text: "Vedad Ibišević and Edin Džeko formed one of the most feared strike partnerships in Bosnian football history, both playing key roles in the 2014 World Cup qualification.", category: 'player', era: 'modern', teams: ['BIH'] },
  ],

  AUT: [
    { text: "Austria's 2026 group stage swung wildly: a win over Jordan, a loss to Argentina, then a 3-3 thriller with Algeria to close it out.", category: 'trivia', era: 'modern', teams: ['AUT'] },
    { text: "Austria reached the World Cup semi-finals twice, in 1934 and 1954, but haven't made it past the group stage since 1998.", category: 'record', era: 'classic', teams: ['AUT'] },
    { text: "Austria's 'Wunderteam' of the early 1930s was one of the most admired sides in Europe before losing to Italy in the 1934 World Cup semi-final.", category: 'wc-history', era: 'vintage', teams: ['AUT'] },
    { text: "Austria's 1-0 win over West Germany at the 1982 World Cup was so suspicious in its timing that both teams were accused of arranging the result, a match still nicknamed the 'Disgrace of Gijón'.", category: 'trivia', score: 9, era: 'classic', teams: ['AUT'] },
    { text: "Austria failed to qualify for six consecutive World Cups between 1998 and 2022 before finally returning to the tournament in 2026.", category: 'milestone', era: 'modern', teams: ['AUT'] },
    { text: "Austria's Matthias Sindelar, star of the 1930s Wunderteam, is remembered as one of the greatest attacking centre-forwards never to win a World Cup.", category: 'player', era: 'vintage', teams: ['AUT'] },
  ],

  CRO: [
    { text: "Croatia have reached two World Cup finals, in 1998 and 2018, for a country of just 4 million people. That ratio has no real comparison.", category: 'record', era: 'modern', teams: ['CRO'] },
    { text: "Croatia reached the World Cup final in 2018 despite playing three straight knockout matches that went to extra time.", category: 'record', era: 'modern', teams: ['CRO'] },
    { text: "Luka Modrić won the Ballon d'Or in 2018, the same year he captained Croatia to their first ever World Cup final.", category: 'player', score: 9, era: 'modern', teams: ['CRO'] },
    { text: "Croatia's golden generation, including Modrić, Rakitić, and Perišić, reached one World Cup final and two more semi-finals across three tournaments.", category: 'trivia', era: 'modern', teams: ['CRO'] },
    { text: "Croatia have never lost a World Cup penalty shootout, going 3 for 3 across the 1998, 2018, and 2022 tournaments.", category: 'penalty', era: 'modern', teams: ['CRO'] },
    { text: "Croatia finished third at their very first ever World Cup as an independent nation, in 1998, with Davor Šuker winning the Golden Boot.", category: 'wc-history', era: 'recent', teams: ['CRO'] },
  ],

  SUI: [
    { text: "Switzerland have lost more World Cup penalty shootouts than any other team, four and counting. They keep getting there, they just can't finish it.", category: 'penalty', score: 8, era: 'recent', teams: ['SUI'] },
    { text: "Switzerland reached the World Cup quarter-finals in 1934 and 1954, both as hosts of major tournaments that era, but haven't matched that finish since.", category: 'record', era: 'vintage', teams: ['SUI'] },
    { text: "Switzerland qualified for six of the last seven World Cups heading into 2026, one of the most consistent European qualifiers outside the traditional powers.", category: 'milestone', era: 'modern', teams: ['SUI'] },
    { text: "Switzerland climbed into FIFA's world top ten for the first time in the 2010s, the golden era of players like Xhaka, Shaqiri, and Sommer.", category: 'trivia', era: 'modern', teams: ['SUI'] },
    { text: "Switzerland haven't lost a World Cup group-stage match since 2010, one of the best group-stage records of any European team this century.", category: 'record', era: 'modern', teams: ['SUI'] },
    { text: "Goalkeeper Yann Sommer saved a penalty in stoppage time against Serbia at the 2022 World Cup to help send Switzerland through to the round of 16.", category: 'penalty', era: 'modern', teams: ['SUI'] },
    { text: "Switzerland's 1994 World Cup appearance ended a 28-year absence from the tournament, their first trip back since 1966.", category: 'milestone', era: 'recent', teams: ['SUI'] },
    { text: "Xherdan Shaqiri scored a hat-trick in a single World Cup match against Honduras in 2014, one of the standout individual displays of that tournament.", category: 'player', score: 8, era: 'modern', teams: ['SUI'] },
    { text: "Switzerland reached the World Cup round of 16 in four of their last five tournament appearances, one of the most consistent records of any smaller European nation.", category: 'record', era: 'modern', teams: ['SUI'] },
    { text: "Stephan Lichtsteiner played in three different World Cups for Switzerland and never lost a single group-stage match in any of them.", category: 'trivia', era: 'modern', teams: ['SUI'] },
    { text: "Switzerland's 2018 World Cup squad included players born in more than ten different countries, one of the most diverse rosters at that tournament.", category: 'trivia', era: 'modern', teams: ['SUI'] },
    { text: "Granit Xhaka has played in every Swiss World Cup campaign since 2014, and was named captain by the time of the 2022 tournament.", category: 'trivia', era: 'modern', teams: ['SUI'] },
  ],

  ALG: [
    { text: "Algeria beat West Germany 2-1 at the 1982 World Cup, one of the biggest shocks the tournament had ever seen.", category: 'upset', score: 9, era: 'classic', teams: ['ALG'] },
    { text: "Algeria's 2026 group stage swung wildly: a heavy loss to Argentina, a win over Jordan, then a 3-3 thriller with Austria to close it out.", category: 'trivia', era: 'modern', teams: ['ALG'] },
    { text: "Algeria were controversially eliminated in 1982 after West Germany and Austria played out a suspicious 1-0 result that sent both of them through at Algeria's expense.", category: 'trivia', era: 'classic', teams: ['ALG'] },
    { text: "Algeria reached the World Cup round of 16 for the first time in 2014, 32 years after their historic 1982 upset of West Germany.", category: 'milestone', era: 'modern', teams: ['ALG'] },
    { text: "Algeria's Rabah Madjer scored one of the most famous goals in European club history with a backheel for Porto in the 1987 European Cup final, five years after starring for Algeria at the 1982 World Cup.", category: 'player', era: 'classic', teams: ['ALG'] },
    { text: "Algeria won the Africa Cup of Nations in 2019 without conceding a single goal in the knockout rounds, a rare feat in the modern tournament.", category: 'record', era: 'modern', teams: ['ALG'] },
  ],

  AUS: [
    { text: "Tim Cahill scored Australia's first ever World Cup goal in 2006, then added a header so good that Ronaldo called it one of the best goals he'd ever seen conceded.", category: 'player', score: 8, era: 'recent', teams: ['AUS'] },
    { text: "Australia switched from Oceania to the Asian Football Confederation in 2006, a move that made World Cup qualification dramatically more competitive but also more direct.", category: 'milestone', era: 'recent', teams: ['AUS'] },
    { text: "Australia reached the round of 16 at the 2006 World Cup on their return to the tournament after a 32-year absence, their best finish until 2022.", category: 'wc-history', era: 'modern', teams: ['AUS'] },
    { text: "Australia reached the World Cup knockout rounds in both 2006 and 2022, and both times were knocked out by the team that went on to win the whole tournament.", category: 'record', era: 'modern', teams: ['AUS'] },
    { text: "Mile Jedinak captained Australia at back-to-back World Cups in 2014 and 2018, scoring penalties in both tournaments.", category: 'player', era: 'modern', teams: ['AUS'] },
    { text: "Australia's Socceroos didn't win a single World Cup match until 2010, when they beat Serbia in the group stage on their third tournament appearance.", category: 'milestone', era: 'modern', teams: ['AUS'] },
  ],

  EGY: [
    { text: "Mohamed Salah's penalty in qualifying sent Egypt to their first World Cup in 28 years, and the whole country erupted.", category: 'wc-history', era: 'modern', teams: ['EGY'] },
    { text: "Egypt were the first African country to ever qualify for a World Cup, all the way back in 1934.", category: 'milestone', era: 'vintage', teams: ['EGY'] },
    { text: "Egypt reached the World Cup in 1934, 1990, 2018, and 2026, one of the most sporadic qualification records of any historically strong African footballing nation.", category: 'trivia', era: 'modern', teams: ['EGY'] },
    { text: "Egypt have played at four World Cups and never won a single match, despite winning the Africa Cup of Nations a record seven times.", category: 'trivia', score: 8, era: 'recent', teams: ['EGY'] },
    { text: "Mohamed Salah missed Egypt's opening two group games at the 2018 World Cup through injury, then returned to score against Saudi Arabia in a match that no longer mattered.", category: 'player', era: 'modern', teams: ['EGY'] },
    { text: "Egypt's Ahmed Hassan won four Africa Cup of Nations titles across three different decades of international football.", category: 'player', era: 'recent', teams: ['EGY'] },
    { text: "Egypt's only match at the 1934 World Cup, the only year the tournament used a straight knockout format from the very first round, ended in a 4-2 loss to Hungary.", category: 'wc-history', era: 'vintage', teams: ['EGY'] },
    { text: "Egypt went 56 years between their second and third World Cup appearances, from 1934 to 1990, one of the longest gaps of any nation in tournament history.", category: 'milestone', era: 'classic', teams: ['EGY'] },
    { text: "Egypt's 1990 World Cup produced scoreless draws against the Netherlands and Ireland before a narrow loss to England ended their run in the group stage.", category: 'wc-history', era: 'recent', teams: ['EGY'] },
    { text: "Mohamed Salah has been named African Footballer of the Year three times while also becoming Egypt's all-time leading goalscorer.", category: 'player', era: 'modern', teams: ['EGY'] },
    { text: "Essam El-Hadary became the oldest player ever to appear at a World Cup when he played at 45 years old in 2018, saving a penalty in that same match.", category: 'record', score: 9, era: 'modern', teams: ['EGY'] },
  ],

  CPV: [
    { text: "Cape Verde are ten Atlantic islands with about 550,000 people, making their World Cup debut in 2026 as one of the smallest nations ever to qualify.", category: 'milestone', score: 8, era: 'modern', teams: ['CPV'] },
    { text: "Cape Verde didn't win a single group game in 2026 and still went through unbeaten, drawing Spain, Uruguay, and Saudi Arabia in their tournament debut.", category: 'milestone', era: 'modern', teams: ['CPV'] },
    { text: "Cape Verde's population makes them one of the smallest countries ever to reach a World Cup, alongside Iceland's celebrated 2018 campaign.", category: 'trivia', era: 'modern', teams: ['CPV'] },
    { text: "Cape Verde's national team is nicknamed the Blue Sharks, and much of their World Cup squad grew up in Portugal rather than on the islands.", category: 'trivia', era: 'modern', teams: ['CPV'] },
    { text: "Cape Verde qualified for their first World Cup by topping a group that included much larger, historically stronger African nations.", category: 'milestone', era: 'modern', teams: ['CPV'] },
    { text: "Cape Verde's entire top domestic division has fewer clubs than most European countries have professional academies, making their World Cup qualification one of the more remarkable underdog stories in the sport.", category: 'trivia', era: 'modern', teams: ['CPV'] },
  ],

  COL: [
    { text: "Colombia went unbeaten through their 2026 group, conceding just once across three games, including a scoreless draw with Portugal.", category: 'record', era: 'modern', teams: ['COL'] },
    { text: "Colombia reached the World Cup quarter-finals in 2014, their best ever finish, powered by James Rodríguez's Golden Boot campaign.", category: 'wc-history', score: 7, era: 'modern', teams: ['COL'] },
    { text: "Colombia's Carlos Valderrama played in three World Cups with his trademark blond afro, becoming one of the most recognisable players of the 1990s.", category: 'player', era: 'recent', teams: ['COL'] },
    { text: "Colombia missed six straight World Cups between 1962 and 1986 before qualifying again in 1990 behind a golden generation built around Valderrama.", category: 'milestone', era: 'recent', teams: ['COL'] },
    { text: "Colombia's 2018 World Cup started with a red card and a loss to Japan inside their first game, before they recovered to reach the round of 16.", category: 'wc-history', era: 'modern', teams: ['COL'] },
    { text: "Colombia have qualified for six World Cups in total, reaching the knockout rounds in three of them.", category: 'record', era: 'recent', teams: ['COL'] },
    { text: "René Higuita became world famous for his 'scorpion kick' save, a move he had already used at a World Cup before making it iconic in a 1995 friendly against England.", category: 'player', era: 'recent', teams: ['COL'] },
    { text: "Colombia went out in the group stage of the 1994 World Cup despite entering as one of the pre-tournament favorites, one of the biggest disappointments of that year's competition.", category: 'upset', score: 8, era: 'recent', teams: ['COL'] },
    { text: "James Rodríguez was 22 years old when he won the 2014 Golden Boot, one of the youngest players to ever top the World Cup scoring charts.", category: 'player', era: 'modern', teams: ['COL'] },
    { text: "Radamel Falcao missed the entire 2014 World Cup through injury, then played every minute of Colombia's group stage in 2018 after recovering.", category: 'player', era: 'modern', teams: ['COL'] },
    { text: "Colombia's bright yellow home jersey has remained one of the most recognizable kits in World Cup history since Carlos Valderrama's era in the early 1990s.", category: 'trivia', era: 'recent', teams: ['COL'] },
    { text: "Carlos Valderrama set up more goals than any other player at the 1994 World Cup despite Colombia's early elimination.", category: 'player', era: 'recent', teams: ['COL'] },
  ],

  GHA: [
    { text: "Ghana's 2026 group stage came down to the final round: a loss to Croatia, but wins over Panama and a draw with England had already sealed their spot.", category: 'wc-history', era: 'modern', teams: ['GHA'] },
    { text: "Ghana reached the World Cup quarter-finals in 2010, the furthest any African team had gone until Morocco matched it twelve years later.", category: 'record', score: 8, era: 'modern', teams: ['GHA'] },
    { text: "Ghana's Black Stars have qualified for four World Cups since their debut in 2006, reaching the knockout rounds twice.", category: 'record', era: 'recent', teams: ['GHA'] },
    { text: "Asamoah Gyan is Africa's all-time leading World Cup goalscorer, with goals across three different tournaments for Ghana.", category: 'record', era: 'modern', teams: ['GHA'] },
    { text: "Ghana beat both the Czech Republic and the USA at the 2006 World Cup on their tournament debut, reaching the round of 16 immediately.", category: 'milestone', era: 'recent', teams: ['GHA'] },
    { text: "Ghana's 2006 World Cup debut ended with a round of 16 loss to a Ronaldinho-led Brazil, who went on to reach the quarter-finals themselves.", category: 'wc-history', era: 'recent', teams: ['GHA'] },
  ],

  MEX: [
    { text: "Mexico already hosted the World Cup twice, in 1970 and 1986. Co-hosting in 2026 makes them the first country ever to host it three times.", category: 'record', era: 'modern', teams: ['MEX'] },
    { text: "Mexico have reached the round of 16 in seven straight World Cups and been knocked out every single time. Fans call the next round 'el quinto partido', the fifth game that never comes.", category: 'trivia', score: 8, era: 'modern', teams: ['MEX'] },
    { text: "Mexico's Hugo Sánchez never played in a World Cup knockout match despite being considered the best Mexican player in history for decades.", category: 'trivia', era: 'recent', teams: ['MEX'] },
    { text: "Mexico have reached the World Cup round of 16 more times than any country outside the traditional European and South American powers.", category: 'record', era: 'recent', teams: ['MEX'] },
    { text: "Mexico have never been eliminated in the group stage of a World Cup they've hosted, going 3 for 3 across 1970, 1986, and their co-hosted return in 2026.", category: 'record', era: 'modern', teams: ['MEX'] },
    { text: "Mexico's 1970 World Cup was the first ever broadcast in color worldwide, introduced to a global audience alongside Pelé's Brazil winning their third title.", category: 'trivia', era: 'classic', teams: ['MEX'] },
    { text: "Rafael Márquez played in five different World Cups for Mexico, more than any other Mexican player in history.", category: 'record', era: 'modern', teams: ['MEX'] },
    { text: "Mexico beat defending champions Germany 1-0 in the opening match of the 2018 World Cup, one of the biggest tournament-opener shocks in years.", category: 'upset', score: 8, era: 'modern', teams: ['MEX'] },
    { text: "Cuauhtémoc Blanco scored a penalty using his own signature two-footed jumping technique, nicknamed the 'Cuauhtemiña', at the 1998 World Cup.", category: 'trivia', era: 'recent', teams: ['MEX'] },
    { text: "Mexican fans have set multiple Guinness World Records for stadium noise during goal celebrations at the Azteca, measured during actual World Cup matches.", category: 'trivia', era: 'modern', teams: ['MEX'] },
    { text: "Mexico became 1986 World Cup hosts only after original host Colombia withdrew years earlier, citing the financial cost of staging the tournament.", category: 'milestone', era: 'classic', teams: ['MEX'] },
    { text: "The Azteca Stadium in Mexico City will become the first venue to host matches across three different World Cups when 2026 games are played there, after 1970 and 1986.", category: 'milestone', era: 'modern', teams: ['MEX'] },
  ],

  KOR: [
    { text: "South Korea are the only Asian team to ever reach a World Cup semi-final. They got there in 2002 by knocking out two former champions, Spain and Italy.", category: 'wc-history', era: 'recent', teams: ['KOR'] },
    { text: "South Korea's Ahn Jung-hwan scored the golden goal that eliminated Italy in 2002, then had his contract terminated by his Italian club within days.", category: 'player', score: 9, era: 'recent', teams: ['KOR'] },
    { text: "South Korea have qualified for ten straight World Cups since 1986, the longest active qualification streak in Asia.", category: 'record', era: 'classic', teams: ['KOR'] },
    { text: "Park Ji-sung became the first Asian player to reach a Champions League final, with Manchester United in 2009, three years after starring for South Korea at a World Cup.", category: 'player', era: 'recent', teams: ['KOR'] },
    { text: "South Korea's 2002 World Cup run set off street celebrations of over 7 million people nationwide, one of the largest sporting gatherings in history.", category: 'trivia', era: 'recent', teams: ['KOR'] },
    { text: "South Korea's Son Heung-min became captain of Tottenham Hotspur in the Premier League while also leading his country into the 2026 World Cup.", category: 'trivia', era: 'modern', teams: ['KOR'] },
  ],

  CZE: [
    { text: "Czechoslovakia reached two World Cup finals, in 1934 and 1962. Since splitting into the Czech Republic and Slovakia in 1993, neither has reached a quarter-final.", category: 'wc-history', era: 'classic', teams: ['CZE'] },
    { text: "Czech midfielder Pavel Nedvěd won the Ballon d'Or in 2003, one of the few Czech players to ever reach that individual honor.", category: 'player', era: 'recent', teams: ['CZE'] },
    { text: "The Czech Republic reached the semi-finals of Euro 96 as runners-up, their best major-tournament run since splitting from Slovakia, but have never matched it at a World Cup.", category: 'trivia', era: 'recent', teams: ['CZE'] },
    { text: "Antonín Panenka's chipped penalty won Czechoslovakia the 1976 European Championship, a technique now named after him and still used by players at World Cups today.", category: 'player', score: 8, era: 'classic', teams: ['CZE'] },
    { text: "The Czech Republic have missed five of the last six World Cups since their peak in the 1990s, a steep decline for a country with two World Cup final appearances in its history.", category: 'milestone', era: 'recent', teams: ['CZE'] },
    { text: "Czechoslovakia's 1934 World Cup final defeat to Italy came after they led with 20 minutes to go, one of the earliest great heartbreaks in tournament history.", category: 'wc-history', era: 'vintage', teams: ['CZE'] },
  ],

  QAT: [
    { text: "Qatar 2022 was moved to November and December to avoid the desert heat, breaking a World Cup scheduling tradition that had held since 1930.", category: 'trivia', era: 'modern', teams: ['QAT'] },
    { text: "Qatar are still the only World Cup hosts to be eliminated after just two group games, exiting with zero points in 2022.", category: 'record', era: 'modern', teams: ['QAT'] },
    { text: "Qatar spent an estimated 200 billion dollars preparing to host the 2022 World Cup, more than any host nation in the tournament's history.", category: 'trivia', era: 'modern', teams: ['QAT'] },
    { text: "Qatar's 2022 World Cup was the first ever played in the Middle East and the first held in the northern hemisphere winter.", category: 'milestone', era: 'modern', teams: ['QAT'] },
    { text: "Qatar failed to win a single match at their own World Cup in 2022, becoming just the second host nation in history to do that, after South Africa in 2010.", category: 'record', score: 8, era: 'modern', teams: ['QAT'] },
    { text: "Qatar built eight new stadiums for the 2022 World Cup, several of which were partially dismantled and shipped abroad once the tournament ended.", category: 'trivia', era: 'modern', teams: ['QAT'] },
  ],

  HAI: [
    { text: "Haiti's Emmanuel Sanon scored past legendary keeper Dino Zoff in 1974, ending a world-record 1,143-minute clean sheet streak.", category: 'record', score: 9, era: 'classic', teams: ['HAI'] },
    { text: "Haiti's 1974 World Cup remains their only appearance in the tournament's history.", category: 'milestone', era: 'classic', teams: ['HAI'] },
    { text: "Haiti's Emmanuel Sanon scored twice against Italy at the 1974 World Cup, both times fighting back from behind before eventually losing.", category: 'wc-history', era: 'classic', teams: ['HAI'] },
    { text: "Haiti became the first Caribbean nation to ever qualify for a World Cup, doing it in 1974.", category: 'milestone', era: 'classic', teams: ['HAI'] },
    { text: "Haiti's 2026 World Cup appearance comes exactly 52 years after their only previous trip, back in 1974, the same year DR Congo also made their World Cup debut.", category: 'trivia', era: 'modern', teams: ['HAI'] },
    { text: "Haiti qualified for the 1974 World Cup by beating Trinidad and Tobago in a playoff, sealing their historic debut.", category: 'milestone', era: 'classic', teams: ['HAI'] },
  ],

  SCO: [
    { text: "Archie Gemmill dribbled past five Dutch defenders to score one of the most replayed solo goals in World Cup history, back in 1978.", category: 'player', score: 9, era: 'classic', teams: ['SCO'] },
    { text: "Scotland have appeared at eight World Cups and never once escaped the group stage.", category: 'record', era: 'recent', teams: ['SCO'] },
    { text: "Scotland qualified for five straight World Cups between 1974 and 1990, a golden run despite never once getting out of the group stage.", category: 'record', era: 'classic', teams: ['SCO'] },
    { text: "Scotland's 1978 World Cup campaign became a national talking point after their manager predicted they'd win the whole tournament, before they were eliminated in the group stage.", category: 'upset', era: 'classic', teams: ['SCO'] },
    { text: "Scotland hadn't qualified for a World Cup between 1998 and 2026, one of the longest droughts of any nation with multiple prior appearances in Western Europe.", category: 'milestone', era: 'modern', teams: ['SCO'] },
    { text: "Kenny Dalglish, Scotland's record goalscorer, never scored a single goal at a World Cup despite three tournament appearances.", category: 'trivia', era: 'classic', teams: ['SCO'] },
  ],

  TUR: [
    { text: "Turkey's third-place finish in 2002 remains their best ever World Cup result.", category: 'wc-history', era: 'recent', teams: ['TUR'] },
    { text: "Turkey's Hakan Şükür scored the fastest goal in World Cup history, just 11 seconds into the 2002 third-place match.", category: 'record', score: 9, era: 'recent', teams: ['TUR'] },
    { text: "Turkey reached the World Cup semi-final in 2002 on just their second ever appearance in the tournament, 48 years after their first in 1954.", category: 'milestone', era: 'recent', teams: ['TUR'] },
    { text: "Turkey and South Korea named each other honorary partners after their unforgettable 2002 third-place match, a friendship both football federations still mark today.", category: 'trivia', era: 'recent', teams: ['TUR'] },
    { text: "Turkey's qualification for 2026 ended a 12-year absence from the World Cup after missing the 2014, 2018, and 2022 tournaments.", category: 'milestone', era: 'modern', teams: ['TUR'] },
    { text: "Rüştü Reçber was named the tournament's best goalkeeper at the 2002 World Cup, helping Turkey concede just 5 goals across seven matches on their run to the semi-final.", category: 'player', era: 'recent', teams: ['TUR'] },
  ],

  CUW: [
    { text: "Curaçao has about 160,000 people and they're at the World Cup, one of the smallest nations to ever qualify.", category: 'trivia', score: 7, era: 'modern', teams: ['CUW'] },
    { text: "Several players on Curaçao's 2026 squad were born in the Netherlands and chose to represent the island instead.", category: 'trivia', era: 'modern', teams: ['CUW'] },
    { text: "Curaçao's 2026 World Cup qualification made them one of the smallest nations by population ever to reach the tournament, alongside Iceland's 2018 campaign.", category: 'milestone', era: 'modern', teams: ['CUW'] },
    { text: "Curaçao only became eligible for independent FIFA membership in 2011, after the Netherlands Antilles football federation was dissolved.", category: 'milestone', era: 'modern', teams: ['CUW'] },
    { text: "Curaçao's national team is built almost entirely from the Dutch professional pyramid, despite the island having a population under 200,000.", category: 'trivia', era: 'modern', teams: ['CUW'] },
    { text: "Curaçao qualifying for a men's World Cup was considered nearly impossible a decade ago, when the island's senior team ranked outside FIFA's top 150 nations.", category: 'trivia', era: 'modern', teams: ['CUW'] },
  ],

  ECU: [
    { text: "Enner Valencia scored the opening goal of the entire 2022 World Cup, against host nation Qatar, in the tournament's very first match.", category: 'wc-history', score: 8, era: 'modern', teams: ['ECU'] },
    { text: "Ecuador's only trip to the World Cup knockout rounds came in 2006, when they reached the round of 16.", category: 'wc-history', era: 'recent', teams: ['ECU'] },
    { text: "Ecuador qualified for the World Cup for the first time in 2002, then reached the knockout rounds on just their second appearance in 2006.", category: 'milestone', era: 'recent', teams: ['ECU'] },
    { text: "Ecuador's place at the 2022 World Cup survived a FIFA investigation into a player's nationality documents just months before the tournament began.", category: 'trivia', era: 'modern', teams: ['ECU'] },
    { text: "Enner Valencia scored in the opening match of both the 2014 and 2022 World Cups for Ecuador, one of the only players to ever do that twice.", category: 'player', era: 'modern', teams: ['ECU'] },
    { text: "Ecuador's home qualifying matches are played at high altitude in Quito, over 2,800 meters above sea level, one of the toughest away trips in world football.", category: 'trivia', era: 'recent', teams: ['ECU'] },
  ],

  TUN: [
    { text: "Tunisia beat Mexico 3-1 in 1978 for the first ever World Cup win by an African team. No African side had won a match before that.", category: 'milestone', score: 8, era: 'classic', teams: ['TUN'] },
    { text: "Tunisia have qualified for six World Cups without ever winning more than one match in a single tournament.", category: 'record', era: 'recent', teams: ['TUN'] },
    { text: "Tunisia reached the World Cup for four straight tournaments between 1998 and 2006, their most consistent qualifying run.", category: 'record', era: 'recent', teams: ['TUN'] },
    { text: "Tunisia's only Africa Cup of Nations title came in 2004, on home soil, despite being one of the continent's most frequent World Cup qualifiers.", category: 'record', era: 'recent', teams: ['TUN'] },
    { text: "Tunisia's national team is nicknamed the Eagles of Carthage, a reference to the ancient civilization that once ruled the region.", category: 'trivia', era: 'recent', teams: ['TUN'] },
    { text: "Tunisia went 40 years between World Cup wins, from 1978 to 2018, despite qualifying for the tournament regularly in between.", category: 'record', era: 'modern', teams: ['TUN'] },
  ],

  KSA: [
    { text: "Saudi Arabia's own league is stacked with Ronaldo, Benzema, Neymar, and other Ballon d'Or winners. The national team trains against them every week.", category: 'trivia', era: 'modern', teams: ['KSA'] },
    { text: "Saudi Arabia reached the round of 16 on their World Cup debut in 1994, the best finish by any Middle Eastern nation until Morocco's 2022 run.", category: 'wc-history', era: 'modern', teams: ['KSA'] },
    { text: "Saudi Arabia's 2022 upset of Argentina came after Argentina had gone 36 matches unbeaten, one of the longest streaks in international football history.", category: 'upset', score: 9, era: 'modern', teams: ['KSA'] },
    { text: "Saudi Arabia's professional league began attracting global superstars in the 2020s, years after the national team had already reached five World Cups.", category: 'trivia', era: 'modern', teams: ['KSA'] },
    { text: "Saudi Arabia have qualified for six World Cups since 1994, but have only won three matches total across all of them.", category: 'record', era: 'recent', teams: ['KSA'] },
    { text: "Saudi Arabia's players were given a hero's welcome home after beating Argentina in 2022, one of the biggest public celebrations in the country's sporting history.", category: 'trivia', era: 'modern', teams: ['KSA'] },
  ],

  URU: [
    { text: "Uruguay won the very first World Cup ever played, in 1930, on home soil.", category: 'record', score: 8, era: 'vintage', teams: ['URU'] },
    { text: "Uruguay have won the World Cup twice, in 1930 and 1950, both times without losing a single match along the way.", category: 'record', era: 'vintage', teams: ['URU'] },
    { text: "Uruguay have reached more World Cup semi-finals than any nation outside Germany, Brazil, and Argentina, despite having a population under 3.5 million.", category: 'record', era: 'recent', teams: ['URU'] },
    { text: "Luis Suárez was sent off, bit an opponent, and handled a goal-bound shot on the line, all at different World Cups, and remains one of Uruguay's greatest ever players.", category: 'trivia', era: 'modern', teams: ['URU'] },
    { text: "Uruguay's Diego Forlán won the Golden Ball as the tournament's best player in 2010 despite Uruguay losing in the semi-final.", category: 'player', era: 'modern', teams: ['URU'] },
    { text: "Uruguay's 1950 World Cup victory in Brazil is still taught in Uruguayan schools as one of the country's greatest sporting achievements.", category: 'trivia', era: 'vintage', teams: ['URU'] },
  ],

  IRN: [
    { text: "Iran's Ali Daei scored 109 international goals, the most of any male player in history until Cristiano Ronaldo eventually passed him decades later.", category: 'record', score: 7, era: 'modern', teams: ['IRN'] },
    { text: "Iran's home stadium in Tehran, Azadi, holds over 78,000 fans, one of the loudest atmospheres in world football.", category: 'trivia', era: 'recent', teams: ['IRN'] },
    { text: "Iran beat Wales 2-0 at the 2022 World Cup, stoppage-time goals sealing their first World Cup win in 20 years.", category: 'upset', era: 'modern', teams: ['IRN'] },
    { text: "Ali Daei was the top scorer in Asian football for over a decade before retiring with more international goals than any player in the world at the time.", category: 'player', era: 'recent', teams: ['IRN'] },
    { text: "Iran have qualified for six World Cups, but have never won more than one match in a single tournament.", category: 'record', era: 'recent', teams: ['IRN'] },
    { text: "Iran's Karim Bagheri set an Asian international scoring record with 19 goals in a single World Cup qualifying campaign in the 1990s.", category: 'record', era: 'recent', teams: ['IRN'] },
  ],

  NZL: [
    { text: "New Zealand went the entire 2010 World Cup unbeaten, three draws including one against defending champions Italy, and still got eliminated.", category: 'trivia', score: 7, era: 'modern', teams: ['NZL'] },
    { text: "New Zealand qualified for their first World Cup in 1982 by beating Saudi Arabia in a playoff on a neutral pitch in Singapore.", category: 'milestone', era: 'classic', teams: ['NZL'] },
    { text: "New Zealand's All Whites have never won a World Cup match in three tournament appearances, drawing three and losing the rest.", category: 'record', era: 'recent', teams: ['NZL'] },
    { text: "New Zealand's Winston Reid played more minutes than any other outfield player at the 2010 World Cup for his country, anchoring their unbeaten run in the group stage.", category: 'player', era: 'modern', teams: ['NZL'] },
    { text: "New Zealand's qualification for 2026 came via the intercontinental playoff route, a path they've used to reach three of their four total World Cups.", category: 'milestone', era: 'modern', teams: ['NZL'] },
    { text: "New Zealand and Australia used to compete in the same Oceania qualifying group before Australia switched confederations in 2006, instantly making New Zealand the dominant team in the region.", category: 'trivia', era: 'recent', teams: ['NZL'] },
  ],

  IRQ: [
    { text: "Iraq's only previous World Cup appearance was in 1986, playing all three group games and leaving without a single point.", category: 'wc-history', era: 'classic', teams: ['IRQ'] },
    { text: "Iraq's only previous World Cup, in 1986, ended without a single point from three group games against Belgium, Paraguay, and Mexico.", category: 'wc-history', era: 'classic', teams: ['IRQ'] },
    { text: "Iraq won the 2007 Asian Cup as a major underdog, a title still considered one of the great feel-good stories in the tournament's history.", category: 'milestone', score: 7, era: 'recent', teams: ['IRQ'] },
    { text: "Iraq's qualification for the 2026 World Cup ended a 40-year wait since their only previous appearance in 1986.", category: 'milestone', era: 'modern', teams: ['IRQ'] },
    { text: "Iraq's Younis Mahmoud captained the country to their surprise 2007 Asian Cup title, becoming a national football hero in the process.", category: 'player', era: 'recent', teams: ['IRQ'] },
    { text: "Iraq scored only once across their three group games at the 1986 World Cup, a late consolation goal against Belgium.", category: 'wc-history', era: 'classic', teams: ['IRQ'] },
  ],

  JOR: [
    { text: "Jordan reached the 2023 Asian Cup final, their best ever run in the competition, before qualifying for their first World Cup in 2026.", category: 'milestone', score: 6, era: 'modern', teams: ['JOR'] },
    { text: "Jordan's 2026 World Cup qualification is their first ever appearance at the tournament, decades after their football federation was founded.", category: 'milestone', era: 'modern', teams: ['JOR'] },
    { text: "Jordan's Musa Al-Taamari plays his club football in France, one of a growing number of Jordanian players now based in Europe as the national team has risen up the world rankings.", category: 'trivia', era: 'modern', teams: ['JOR'] },
    { text: "Jordan's rise up the FIFA world rankings over the past decade has been one of the steepest of any Asian football nation, culminating in their first ever World Cup qualification.", category: 'record', era: 'modern', teams: ['JOR'] },
    { text: "Jordan's under-23 team reached the semi-finals of the Asian Games before several of those same players helped the senior team qualify for the 2026 World Cup.", category: 'milestone', era: 'modern', teams: ['JOR'] },
    { text: "Jordan hosted the 1999 FIFA World Youth Championship, one of the first major global football tournaments held in the Middle East.", category: 'trivia', era: 'recent', teams: ['JOR'] },
  ],

  UZB: [
    { text: "Uzbekistan reached their first ever World Cup in 2026, after decades of just missing out in qualifying.", category: 'milestone', era: 'modern', teams: ['UZB'] },
    { text: "Uzbekistan reached the knockout rounds of the AFC Asian Cup multiple times before finally qualifying for their first World Cup in 2026.", category: 'milestone', era: 'modern', teams: ['UZB'] },
    { text: "Uzbekistan's Eldor Shomurodov became the country's first player to feature in a major European title race, playing for Roma in Serie A.", category: 'player', score: 6, era: 'modern', teams: ['UZB'] },
    { text: "Uzbekistan won gold in men's football at the 2023 Asian Games, a rare continental football title for the country heading into their World Cup debut.", category: 'milestone', era: 'modern', teams: ['UZB'] },
    { text: "Uzbekistan's national team is built almost entirely on domestic league talent, unusual among first-time World Cup qualifiers in the modern era.", category: 'trivia', era: 'modern', teams: ['UZB'] },
    { text: "Uzbekistan's capital Tashkent will not host any 2026 World Cup matches, despite the country making its historic tournament debut on the other side of the world.", category: 'trivia', era: 'modern', teams: ['UZB'] },
  ],

  PAN: [
    { text: "Panama's 2018 World Cup qualification came via a goal that never actually crossed the line, in a play still called 'the phantom goal'. It knocked the USA out of qualifying instead.", category: 'trivia', score: 9, era: 'modern', teams: ['PAN'] },
    { text: "Panama's Román Torres scored the goal that sealed their first ever World Cup qualification in 2017, becoming a national hero overnight.", category: 'player', era: 'modern', teams: ['PAN'] },
    { text: "Panama's World Cup debut in 2018 came in their tenth attempt at qualification, the culmination of decades of near-misses.", category: 'milestone', era: 'modern', teams: ['PAN'] },
    { text: "Panama's national team is nicknamed Los Canaleros, after the country's famous canal, one of the most recognizable nicknames in international football.", category: 'trivia', era: 'recent', teams: ['PAN'] },
    { text: "Panama reached the World Cup for the second time in 2026, eight years after their historic debut appearance.", category: 'milestone', era: 'modern', teams: ['PAN'] },
    { text: "Panama's players wept on the touchline during their 2018 opener after finally scoring at a World Cup, regardless of the scoreline at the time.", category: 'trivia', era: 'modern', teams: ['PAN'] },
  ],
}

const H2H_FACTS  = finalizeBank(RAW_H2H_FACTS, 'h2h')
const TEAM_FACTS = finalizeBank(RAW_TEAM_FACTS, 'team')

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns every fact that is genuinely tied to this specific matchup, ordered
 * so that head-to-head facts always come first when they exist. The order is
 * deterministic per opponent (stable for SSR) but not simply the authored
 * array order, so rotation logic doesn't systematically favor any one fact or
 * team. Every returned fact's `teams` field overlaps {homeCode, awayCode};
 * callers can still re-check this before rendering, but it always holds here.
 */
export function getFactsForMatch(homeCode: string, awayCode: string): MatchFact[] {
  const h2h = H2H_FACTS[h2hKey(homeCode, awayCode)] ?? []
  if (h2h.length > 0) return stableShuffle(h2h, `h2h:${homeCode}:${awayCode}`)

  const homePool = stableShuffle(TEAM_FACTS[homeCode] ?? [], `${homeCode}:${awayCode}`)
  const awayPool = stableShuffle(TEAM_FACTS[awayCode] ?? [], `${awayCode}:${homeCode}`)

  // Interleave home/away facts so the merged rotation doesn't just exhaust one
  // team's whole pool before ever showing the other team's facts.
  const merged: MatchFact[] = []
  const max = Math.max(homePool.length, awayPool.length)
  for (let i = 0; i < max; i++) {
    if (homePool[i]) merged.push(homePool[i])
    if (awayPool[i]) merged.push(awayPool[i])
  }
  return merged
}
