type FactCategory = 'h2h' | 'wc-history' | 'tournament' | 'record' | 'trivia'

interface MatchFact {
  fact: string
  category: FactCategory
}

// Keyed by "{homeShortCode}_{awayShortCode}" — must match fixture home/away order.
// Shortcodes verified against production /teams endpoint on 2026-06-13.
const MATCH_FACTS: Record<string, MatchFact> = {
  // ── June 11 ──────────────────────────────────────────────────────────────
  MEX_RSA: { fact: "Mexico beat South Africa 1–0 in the opening match of the 2010 World Cup they hosted.", category: 'h2h' },

  // ── June 12 ──────────────────────────────────────────────────────────────
  KOR_CZE: { fact: "South Korea's 2002 semi-final remains the best run by any Asian nation at a World Cup.", category: 'wc-history' },
  CAN_BIH: { fact: "Canada's 1986 World Cup debut ended with 3 losses and 0 goals — they still made it to 2022.", category: 'record' },

  // ── June 13 ──────────────────────────────────────────────────────────────
  USA_PAR: { fact: "The USA beat England 1–0 in 1950 — still one of the biggest shocks in World Cup history.", category: 'wc-history' },
  QAT_SUI: { fact: "Qatar earned 0 points as 2022 hosts. Switzerland reached the R16 at that same tournament.", category: 'wc-history' },
  BRA_MAR: { fact: "Brazil and Morocco were on opposite bracket halves in 2022 — they could only have met in the final.", category: 'wc-history' },

  // ── June 14 ──────────────────────────────────────────────────────────────
  HAI_SCO: { fact: "Both at the 1974 World Cup in different groups — Haiti and Scotland have never met. Until tonight.", category: 'wc-history' },
  AUS_TUR: { fact: "Türkiye finished 3rd at the 2002 World Cup. They haven't been back since — until tonight.", category: 'record' },
  GER_CUW: { fact: "Curaçao are part of the Kingdom of the Netherlands. Their World Cup debut is against Germany.", category: 'trivia' },
  NED_JPN: { fact: "Japan beat Germany and Spain at the 2022 World Cup. The Netherlands are next on that list.", category: 'wc-history' },
  CIV_ECU: { fact: "Ivory Coast and Ecuador shared the 2006 and 2014 World Cups — never in the same group until now.", category: 'wc-history' },

  // ── June 15 ──────────────────────────────────────────────────────────────
  SWE_TUN: { fact: "Sweden and Tunisia have shared four World Cups (1978, 2002, 2006, 2018) without ever meeting.", category: 'wc-history' },
  ESP_CPV: { fact: "Cape Verde's World Cup debut is against the 2010 World Champions.", category: 'trivia' },
  BEL_EGY: { fact: "Belgium and Egypt were at the 1990 and 2018 World Cups — always in different groups. First meeting.", category: 'wc-history' },
  KSA_URU: { fact: "Saudi Arabia beat Argentina 2–1 in 2022. Uruguay — Argentina's fiercest rival — face them tonight.", category: 'h2h' },

  // ── June 16 ──────────────────────────────────────────────────────────────
  IRN_NZL: { fact: "New Zealand went through the 2010 World Cup with 3 draws — unbeaten, and still eliminated.", category: 'record' },
  FRA_SEN: { fact: "Senegal's first ever World Cup match was against defending champions France. Senegal won 1–0.", category: 'h2h' },
  IRQ_NOR: { fact: "Norway beat defending champions Brazil 2–1 at the 1998 World Cup. Iraq last appeared in 1986.", category: 'wc-history' },

  // ── June 17 ──────────────────────────────────────────────────────────────
  ARG_ALG: { fact: "Algeria beat West Germany 2–1 in 1982. Argentina were beaten 2–1 by Saudi Arabia in 2022.", category: 'wc-history' },
  AUT_JOR: { fact: "Jordan make their World Cup debut against Austria, who finished third at the 1954 World Cup.", category: 'tournament' },
  POR_COD: { fact: "Zaire (now Congo DR) conceded 14 goals at the 1974 World Cup — including 9 in one match.", category: 'trivia' },
  ENG_CRO: { fact: "Croatia beat England in the 2018 World Cup semi-final — England's furthest run since 1966.", category: 'h2h' },
  GHA_PAN: { fact: "Ghana were one missed penalty away from a World Cup semi-final in 2010.", category: 'wc-history' },

  // ── June 18 ──────────────────────────────────────────────────────────────
  UZB_COL: { fact: "Uzbekistan make their World Cup debut against Colombia — quarter-finalists at the 2014 tournament.", category: 'tournament' },
  CZE_RSA: { fact: "South Africa were the first hosts to exit the World Cup group stage — Qatar matched them in 2022.", category: 'wc-history' },
  SUI_BIH: { fact: "Bosnia scored in every match at the 2014 World Cup — but still went out in the group stage.", category: 'wc-history' },
  CAN_QAT: { fact: "Canada scored their first-ever World Cup goal in 2022 — 36 years after their goalless 1986 debut.", category: 'record' },

  // ── June 19 ──────────────────────────────────────────────────────────────
  MEX_KOR: { fact: "Mexico went out in the Round of 16 at seven consecutive World Cups — until a group stage exit in 2022.", category: 'record' },
  USA_AUS: { fact: "The USA co-host the 2026 World Cup — automatic qualifiers for the first time since 1994.", category: 'tournament' },
  SCO_MAR: { fact: "Morocco became the first African and Arab nation to reach a World Cup semi-final — in 2022.", category: 'wc-history' },

  // ── June 20 ──────────────────────────────────────────────────────────────
  BRA_HAI: { fact: "Brazil have played at every World Cup in history — no other nation has managed that.", category: 'record' },
  TUR_PAR: { fact: "Türkiye and Paraguay were both at the 2002 World Cup — 24 years before facing each other in 2026.", category: 'wc-history' },
  NED_SWE: { fact: "The Netherlands have reached three World Cup finals without winning — only Germany have lost more.", category: 'record' },
  GER_CIV: { fact: "Ivory Coast's 2006 World Cup qualification helped pause the country's civil war.", category: 'trivia' },

  // ── June 21 ──────────────────────────────────────────────────────────────
  ECU_CUW: { fact: "With around 150,000 people, Curaçao are among the smallest nations to qualify for a World Cup.", category: 'trivia' },
  TUN_JPN: { fact: "Japan and Tunisia have attended four World Cups together without ever being drawn in the same group.", category: 'wc-history' },
  ESP_KSA: { fact: "Saudi Arabia beat Argentina 2–1 in 2022. Spain, another football giant, face them next.", category: 'wc-history' },
  BEL_IRN: { fact: "Belgium spent a record 3 years as FIFA's top-ranked nation — without winning a single major title.", category: 'record' },
  URU_CPV: { fact: "Cape Verde, in their first ever World Cup, face Uruguay — two-time world champions.", category: 'tournament' },

  // ── June 22 ──────────────────────────────────────────────────────────────
  NZL_EGY: { fact: "Egypt are the first African country to have appeared at a World Cup — in 1934.", category: 'record' },
  ARG_AUT: { fact: "Austria finished third at the 1954 World Cup — a level they've never reached since.", category: 'wc-history' },
  FRA_IRQ: { fact: "France have won the World Cup twice — in 1998 and 2018 — exactly 20 years apart.", category: 'wc-history' },
  NOR_SEN: { fact: "Norway upset defending champions Brazil in 1998. Senegal did the same to France in 2002.", category: 'wc-history' },

  // ── June 23 ──────────────────────────────────────────────────────────────
  JOR_ALG: { fact: "Algeria beat West Germany in 1982, forcing FIFA to introduce simultaneous final group games.", category: 'trivia' },
  POR_UZB: { fact: "Portugal won Euro 2016 having drawn all three group games — without topping their group.", category: 'trivia' },
  ENG_GHA: { fact: "England won the World Cup in 1966 as hosts — and haven't reached a final since.", category: 'wc-history' },
  PAN_CRO: { fact: "Croatia have appeared in just 8 World Cups — and reached the final twice, in 1998 and 2018.", category: 'record' },
  COL_COD: { fact: "James Rodríguez scored 6 goals at the 2014 World Cup — winning the Golden Boot aged just 22.", category: 'record' },

  // ── June 24 ──────────────────────────────────────────────────────────────
  SUI_CAN: { fact: "Switzerland and Canada are meeting at a World Cup for the first time.", category: 'trivia' },
  BIH_QAT: { fact: "Qatar are the only team in World Cup history to lose all their matches as tournament hosts.", category: 'record' },
  MAR_HAI: { fact: "Morocco knocked out Belgium, Spain, and Portugal in 2022 on their way to the semi-finals.", category: 'wc-history' },
  SCO_BRA: { fact: "Scotland have been eliminated at the group stage at every World Cup they've ever attended.", category: 'record' },

  // ── June 25 ──────────────────────────────────────────────────────────────
  CZE_MEX: { fact: "Czechoslovakia lost two World Cup finals — in 1934 and 1962 — without winning either.", category: 'wc-history' },
  RSA_KOR: { fact: "South Africa's 2010 tournament was the first World Cup ever held on African soil.", category: 'wc-history' },
  ECU_GER: { fact: "Germany thrashed Brazil 7–1 in the 2014 World Cup semi-final — on Brazilian soil.", category: 'trivia' },
  CUW_CIV: { fact: "Ivory Coast's civil war paused after Drogba's plea following their 2006 World Cup qualifying win.", category: 'trivia' },
  JPN_SWE: { fact: "A 17-year-old Pelé scored twice against Sweden in the 1958 World Cup final — held in Sweden.", category: 'trivia' },
  TUN_NED: { fact: "Tunisia were the first African nation to win a World Cup match — beating Mexico in 1978.", category: 'record' },

  // ── June 26 ──────────────────────────────────────────────────────────────
  TUR_USA: { fact: "Türkiye and the USA both had their best World Cup in 2002 — Türkiye 3rd, USA quarter-final.", category: 'wc-history' },
  PAR_AUS: { fact: "Paraguay reached the 2010 World Cup quarter-finals — their best ever tournament finish.", category: 'record' },
  SEN_IRQ: { fact: "Senegal reached the 2002 World Cup quarter-finals in their very first tournament.", category: 'wc-history' },
  NOR_FRA: { fact: "Norway beat defending champions Brazil 2–1 in 1998. France hosted that same tournament — and won it.", category: 'wc-history' },

  // ── June 27 ──────────────────────────────────────────────────────────────
  URU_ESP: { fact: "Spain are the only European team to win a World Cup held outside Europe — in South Africa, 2010.", category: 'record' },
  CPV_KSA: { fact: "Saudi Arabia's win over Argentina in 2022 is considered one of the greatest World Cup upsets ever.", category: 'wc-history' },
  EGY_IRN: { fact: "Iran vs USA at the 1998 World Cup was described as the most politically charged match in history.", category: 'trivia' },
  NZL_BEL: { fact: "New Zealand have never won a World Cup match — 6 appearances, 3 draws, 3 losses, 0 wins.", category: 'record' },
  CRO_GHA: { fact: "Ghana were only the third African nation to reach a World Cup quarter-final — in 2010.", category: 'wc-history' },
  PAN_ENG: { fact: "England beat Panama 6–1 at the 2018 World Cup — their last meeting.", category: 'h2h' },
  COL_POR: { fact: "Colombia haven't reached a World Cup quarter-final since 2014 — their best ever tournament finish.", category: 'record' },
  COD_UZB: { fact: "Uzbekistan make their debut against Congo DR — who last appeared at a World Cup as Zaire in 1974.", category: 'trivia' },

  // ── June 28 ──────────────────────────────────────────────────────────────
  ALG_AUT: { fact: "Algeria have won the Africa Cup of Nations twice — in 1990 and 2019.", category: 'record' },
  JOR_ARG: { fact: "Jordan make their World Cup debut against the reigning world champions Argentina.", category: 'tournament' },
}

export const FACTS_MAP = new Map(Object.entries(MATCH_FACTS))

export const FALLBACK_FACTS: string[] = [
  "The 2026 World Cup is the first ever hosted by three nations.",
  "Brazil have played at every World Cup in history — no other nation has managed that.",
  "The World Cup trophy has been stolen twice — in England (1966) and in Brazil (1983).",
  "Just Fontaine scored 13 goals at the 1958 World Cup — a record that has stood for 68 years.",
  "Pelé is the only player to win three World Cups — in 1958, 1962, and 1970.",
]
