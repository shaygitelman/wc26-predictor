type FactCategory = 'h2h' | 'wc-history' | 'tournament' | 'record' | 'trivia'

interface MatchFact {
  fact: string
  category: FactCategory
}

// Keyed by "{homeShortCode}_{awayShortCode}" — must match fixture home/away order.
// Shortcodes verified against production /teams endpoint on 2026-06-13.
const MATCH_FACTS: Record<string, MatchFact> = {
  // ── June 11 ──────────────────────────────────────────────────────────────
  MEX_RSA: { fact: "Mexico have hosted the World Cup twice before — in 1970 and 1986. Their 2026 co-hosting makes them the first country ever to host three times.", category: 'record' },

  // ── June 12 ──────────────────────────────────────────────────────────────
  KOR_CZE: { fact: "South Korea are the only Asian team to reach a World Cup semi-final — knocking out Spain and Italy, two former world champions, along the way in 2002.", category: 'wc-history' },
  CAN_BIH: { fact: "Canada are co-hosts of the 2026 World Cup alongside the USA and Mexico — the first time three nations have shared hosting duties in the tournament's 96-year history.", category: 'tournament' },

  // ── June 13 ──────────────────────────────────────────────────────────────
  USA_PAR: { fact: "The USA beat England 1–0 at the 1950 World Cup. Several British newspapers refused to publish the result, assuming the scoreline was a printing error.", category: 'wc-history' },
  QAT_SUI: { fact: "Switzerland beat eventual champions Spain 1–0 in the 2010 World Cup group stage — Spain's only defeat in a tournament they won from start to finish.", category: 'wc-history' },
  BRA_MAR: { fact: "Morocco became the first African and Arab nation to reach a World Cup semi-final in 2022 — eliminating Belgium, Spain, and Portugal along the way.", category: 'wc-history' },

  // ── June 14 ──────────────────────────────────────────────────────────────
  HAI_SCO: { fact: "Haiti's Emmanuel Sanon ended Dino Zoff's world-record 1,143-minute international clean sheet at the 1974 World Cup — scoring past one of the greatest goalkeepers of all time.", category: 'record' },
  AUS_TUR: { fact: "Hakan Şükür scored the fastest goal in World Cup history — just 11 seconds into Turkey's 2002 third-place match. The ball had barely been touched before he finished.", category: 'record' },
  GER_CUW: { fact: "Curaçao — a Caribbean island of about 160,000 people — are one of the smallest nations ever to appear at a World Cup.", category: 'trivia' },
  NED_JPN: { fact: "Japan beat Germany and Spain at the 2022 World Cup — two former world champions — in the same group stage, coming from behind in both games.", category: 'wc-history' },
  CIV_ECU: { fact: "Ecuador's Enner Valencia scored the first goal of the 2022 World Cup — in the opening minutes of the tournament's very first match, against host nation Qatar.", category: 'wc-history' },

  // ── June 15 ──────────────────────────────────────────────────────────────
  SWE_TUN: { fact: "Tunisia became the first African nation to win a World Cup match when they beat Mexico 3–1 in 1978 — before any other African team had won a single game.", category: 'record' },
  ESP_CPV: { fact: "Cape Verde — ten Atlantic islands with a total population of 550,000 — are making their World Cup debut in 2026. One of the smallest nations ever to qualify.", category: 'trivia' },
  BEL_EGY: { fact: "Belgium held the FIFA world #1 ranking for six consecutive years — from 2015 to 2021 — with De Bruyne, Hazard, Lukaku, and Courtois all in their prime at the same time.", category: 'record' },
  KSA_URU: { fact: "Saudi Arabia beat Messi's Argentina 2–1 in the 2022 World Cup group stage — one of the biggest upsets in tournament history. Argentina went on to win the whole competition.", category: 'wc-history' },

  // ── June 16 ──────────────────────────────────────────────────────────────
  IRN_NZL: { fact: "New Zealand went unbeaten at the 2010 World Cup — three draws, including one against Italy, the reigning world champions — and were still eliminated.", category: 'record' },
  FRA_SEN: { fact: "Senegal's first ever World Cup match was against defending champions France in 2002. Senegal won 1–0 and went on to reach the quarter-finals in their debut tournament.", category: 'h2h' },
  IRQ_NOR: { fact: "Norway beat Brazil 2–1 at the 1998 World Cup — a team that included Ronaldo, Roberto Carlos, Rivaldo, and Bebeto. Tore André Flo scored both Norwegian goals.", category: 'wc-history' },

  // ── June 17 ──────────────────────────────────────────────────────────────
  ARG_ALG: { fact: "Algeria reached the Round of 16 in 2014 and took eventual champions Germany to extra time — German players named it their hardest match of the entire tournament.", category: 'wc-history' },
  AUT_JOR: { fact: "Austria beat Switzerland 7–5 in the 1954 World Cup quarter-final — the highest-scoring game in the competition's history. Ten goals in 90 minutes.", category: 'record' },
  POR_COD: { fact: "Portugal's Eusébio scored 4 goals against North Korea in the 1966 quarter-final — coming from 3–0 down to win 5–3. One of the most extraordinary individual performances in World Cup history.", category: 'wc-history' },
  ENG_CRO: { fact: "Croatia reached the 2018 World Cup final with a population of just 4 million — winning three consecutive knockout matches without finishing 90 minutes ahead in any of them.", category: 'record' },
  GHA_PAN: { fact: "Panama's first ever World Cup goal — scored against England in 2018 when the score was already 6–1 — prompted celebrations in Panama City that lasted through the night.", category: 'wc-history' },

  // ── June 18 ──────────────────────────────────────────────────────────────
  UZB_COL: { fact: "James Rodríguez won the Golden Boot at the 2014 World Cup with 6 goals. His volley against Uruguay was voted Goal of the Tournament. He was 22 years old.", category: 'record' },
  CZE_RSA: { fact: "South Africa's Siphiwe Tshabalala scored the opening goal of the first World Cup held on African soil in 2010 — one of the most celebrated strikes in the competition's history.", category: 'wc-history' },
  SUI_BIH: { fact: "Switzerland have been knocked out of the World Cup on penalties more times than any other nation — four shootout exits in total. They get there and then they can't finish it.", category: 'record' },
  CAN_QAT: { fact: "Qatar 2022 was the first World Cup held in the Middle East — played in air-conditioned stadiums in November and December, changing almost every hosting convention the tournament had established since 1930.", category: 'trivia' },

  // ── June 19 ──────────────────────────────────────────────────────────────
  MEX_KOR: { fact: "Mexico have been knocked out in the Round of 16 at seven consecutive World Cups — a streak Mexican fans call 'el quinto partido,' the fifth game that never comes.", category: 'record' },
  USA_AUS: { fact: "Australia's goalkeeper Mark Schwarzer saved two penalties in the 2006 World Cup playoff against Uruguay — sending Australia to the tournament for the first time in 32 years.", category: 'wc-history' },
  SCO_MAR: { fact: "Scotland's Archie Gemmill wove through five Dutch defenders at the 1978 World Cup to score one of the most celebrated individual goals in the competition's history.", category: 'wc-history' },

  // ── June 20 ──────────────────────────────────────────────────────────────
  BRA_HAI: { fact: "Brazil have played at every World Cup in history — all 23 tournaments. No other nation has a perfect qualification record.", category: 'record' },
  TUR_PAR: { fact: "Paraguay's goalkeeper José Luis Chilavert took penalties and free kicks throughout his career — and finished with over 60 career goals, including 8 for the national team.", category: 'trivia' },
  NED_SWE: { fact: "The Netherlands appeared in three World Cup finals — 1974, 1978, and 2010 — without winning any. Their 1974 squad is still considered one of the greatest teams never to lift the trophy.", category: 'record' },
  GER_CIV: { fact: "Ivory Coast goalkeeper Boubacar Barry hadn't played a single minute at the 2015 Africa Cup of Nations — then saved three penalties in the final shootout and scored the winning one himself.", category: 'wc-history' },

  // ── June 21 ──────────────────────────────────────────────────────────────
  ECU_CUW: { fact: "Curaçao qualified for 2026 with a squad of Dutch-born players who chose to represent the island. Several turned down the opportunity to play for the Netherlands to wear these colours.", category: 'trivia' },
  TUN_JPN: { fact: "Japan's 2022 wins over Germany and Spain used the same blueprint — defend deep for 45 minutes, switch shape at half-time, counter at speed. Both opponents said they had never seen anything like it.", category: 'wc-history' },
  ESP_KSA: { fact: "Spain won three consecutive major tournaments — Euro 2008, World Cup 2010, and Euro 2012. No other nation has ever won three in a row.", category: 'record' },
  BEL_IRN: { fact: "Belgium came from 0–2 down to beat Brazil 3–2 in the 2018 World Cup quarter-final — one of the most dramatic comeback victories in the competition's modern era.", category: 'wc-history' },
  URU_CPV: { fact: "Uruguay have won the Copa América 15 times — more than any other nation — and also won the very first World Cup in 1930.", category: 'record' },

  // ── June 22 ──────────────────────────────────────────────────────────────
  NZL_EGY: { fact: "Egypt were the first African country to qualify for a World Cup — back in 1934, before most African nations were independent states.", category: 'record' },
  ARG_AUT: { fact: "Argentina's 2022 World Cup victory was Lionel Messi's defining moment — at his fifth World Cup, he won the Golden Boot, the Golden Ball, and the trophy itself.", category: 'wc-history' },
  FRA_IRQ: { fact: "Kylian Mbappé became only the second teenager in history to score in a World Cup final in 2018 — after Pelé in 1958. Both scored twice. Both teams won.", category: 'record' },
  NOR_SEN: { fact: "Senegal's 2002 squad did most of their football in France's lower leagues — and beat the defending world champions in their opening World Cup game anyway.", category: 'wc-history' },

  // ── June 23 ──────────────────────────────────────────────────────────────
  JOR_ALG: { fact: "Algeria's 1982 win over West Germany prompted such controversy that FIFA introduced simultaneous final-round group matches at all future World Cups — a rule that has shaped the tournament ever since.", category: 'trivia' },
  POR_UZB: { fact: "Cristiano Ronaldo holds the world record for men's international goals — yet has never won a World Cup. He appeared at five tournaments without the one trophy that would complete the set.", category: 'record' },
  ENG_GHA: { fact: "Ghana became the first African team to reach a World Cup quarter-final in 2010 — beating the USA in the Round of 16 first.", category: 'wc-history' },
  PAN_CRO: { fact: "Croatia's Mario Mandžukić scored for both teams in the 2018 World Cup final — an own goal and then a leaping bicycle kick equaliser — two of the match's most unforgettable moments.", category: 'wc-history' },
  COL_COD: { fact: "DR Congo's Mwepu Ilunga sprinted from the defensive wall at the 1974 World Cup and kicked a Brazilian free kick away before it was taken. He later said he thought the referee had blown. Brazil's players laughed.", category: 'trivia' },

  // ── June 24 ──────────────────────────────────────────────────────────────
  SUI_CAN: { fact: "Canada's first World Cup goal came in 2022 — scored against Croatia — 36 years after their only previous appearance in 1986, where they played three games and didn't score once.", category: 'record' },
  BIH_QAT: { fact: "Qatar 2022 was the first World Cup held in the Middle East and the first played in November and December — rescheduled to avoid 40-degree summer heat.", category: 'trivia' },
  MAR_HAI: { fact: "Morocco beat Spain on penalties in the 2022 Round of 16 — knocking out the 2010 world champions. No African team had ever gone further in the tournament.", category: 'wc-history' },
  SCO_BRA: { fact: "Pelé is the only player to have won three World Cups — 1958, 1962, and 1970. He scored twice in the 1958 final against Sweden at just 17 years old.", category: 'record' },

  // ── June 25 ──────────────────────────────────────────────────────────────
  CZE_MEX: { fact: "Czechoslovakia played in two World Cup finals — 1934 and 1962 — yet since the country split in 1993, neither Czech Republic nor Slovakia has ever reached a World Cup quarter-final.", category: 'wc-history' },
  RSA_KOR: { fact: "South Korea beat Germany 2–0 in the 2018 World Cup group stage, sending the reigning world champions home — one of the biggest shocks in the tournament's modern era.", category: 'wc-history' },
  ECU_GER: { fact: "Germany are the only European nation to win the World Cup on South American soil — their 2014 title was won in Brazil, the country regarded as the spiritual home of the sport.", category: 'record' },
  CUW_CIV: { fact: "Ivory Coast were drawn into a group containing at least one former world champion at every World Cup they attended — 2006, 2010, and 2014. The draw never once gave them an easy group.", category: 'wc-history' },
  JPN_SWE: { fact: "Sweden's Zlatan Ibrahimović scored 62 international goals and is widely considered the greatest player in Swedish history — yet never once played at a World Cup.", category: 'record' },
  TUN_NED: { fact: "Tunisia beat France 1–0 in the final group game of the 2022 World Cup. France rested several starters, but the win was real — and celebrated enormously.", category: 'wc-history' },

  // ── June 26 ──────────────────────────────────────────────────────────────
  TUR_USA: { fact: "Turkey finished third at the 2002 World Cup — their best ever result. The very same tournament where Hakan Şükür scored the fastest goal in the competition's history.", category: 'wc-history' },
  PAR_AUS: { fact: "Australia reached the Round of 16 at the 2006 World Cup — their best ever finish — on their very first appearance at the tournament in 32 years.", category: 'wc-history' },
  SEN_IRQ: { fact: "Senegal qualified for the 2022 World Cup by beating Egypt on penalties — the same week they'd beaten Egypt on penalties in the Africa Cup of Nations final. Same opponents. Same result. Twice in a row.", category: 'trivia' },
  NOR_FRA: { fact: "France have appeared in four World Cup finals since 1998 — winning two. No other nation has sustained that level of consistency across the same 28-year period.", category: 'record' },

  // ── June 27 ──────────────────────────────────────────────────────────────
  URU_ESP: { fact: "Spain won three consecutive major tournaments — Euro 2008, World Cup 2010, and Euro 2012 — the only nation ever to win three in a row. Uruguay won the very first World Cup in 1930.", category: 'record' },
  CPV_KSA: { fact: "Saudi Arabia's Pro League has recently signed Ronaldo, Benzema, Neymar, and Roberto Firmino — meaning the Saudi national team trains weekly against former Ballon d'Or winners.", category: 'trivia' },
  EGY_IRN: { fact: "Egypt qualified for the 2018 World Cup for the first time in 28 years — Mohamed Salah's crucial penalty in the qualifier sent the whole country into celebration.", category: 'wc-history' },
  NZL_BEL: { fact: "Belgium's 1986 World Cup squad was their first to reach a semi-final in 52 years — featuring goalkeeper Jean-Marie Pfaff, widely considered one of the best in the position's history.", category: 'wc-history' },
  CRO_GHA: { fact: "Croatia have appeared in just eight World Cups and reached the final twice — in 1998 and 2018. For a nation of 4 million people, that record is extraordinary.", category: 'record' },
  PAN_ENG: { fact: "Harry Kane won the Golden Boot at the 2018 World Cup with 6 goals — the first England player to win the award since Gary Lineker in 1986.", category: 'record' },
  COL_POR: { fact: "Portugal's Luis Figo, Rui Costa, and a teenage Cristiano Ronaldo all played at the 2006 World Cup together — one of the most talented squads the nation has ever assembled.", category: 'wc-history' },
  COD_UZB: { fact: "DR Congo return to the World Cup after 52 years — the longest gap between appearances for any team at the 2026 tournament.", category: 'record' },

  // ── June 28 ──────────────────────────────────────────────────────────────
  ALG_AUT: { fact: "Algeria beat South Korea 4–2 in the 2014 World Cup group stage — their highest-scoring World Cup performance — then pushed eventual champions Germany to extra time in the next round.", category: 'wc-history' },
  JOR_ARG: { fact: "Argentina's 1986 World Cup quarter-final against England produced arguably the two most famous goals in football history — four minutes apart. Both scored by Maradona.", category: 'wc-history' },
}

export const FACTS_MAP = new Map(Object.entries(MATCH_FACTS))

export const FALLBACK_FACTS: string[] = [
  "The 2026 World Cup is the first ever co-hosted by three nations — the USA, Canada, and Mexico.",
  "Brazil have played at every World Cup in history — 23 out of 23. No other nation even comes close.",
  "Just Fontaine scored 13 goals at the 1958 World Cup — a record that has stood for over 65 years.",
  "Miroslav Klose holds the all-time World Cup scoring record — 16 goals across four tournaments for Germany.",
  "The fastest goal in World Cup history was scored just 11 seconds in — by Turkey's Hakan Şükür in 2002.",
]
