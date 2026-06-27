export type FactCategory =
  | 'wc-history'   // memorable World Cup moments
  | 'record'       // incredible records
  | 'upset'        // historic upsets
  | 'player'       // legendary individual performances
  | 'h2h'          // head-to-head surprises
  | 'penalty'      // penalty shootout lore
  | 'milestone'    // firsts, landmarks, qualifications
  | 'trivia'       // fun facts most fans don't know

export interface MatchFact {
  text:     string
  category: FactCategory
}

// Keyed by "{homeShortCode}_{awayShortCode}" — matches the fixture home/away order.
// Each entry holds 2–3 facts in different categories so the component can rotate
// daily without showing the same type of story twice in a row.
const MATCH_FACTS: Record<string, MatchFact[]> = {

  // ── Round of 32 (June 28 – July 7) ───────────────────────────────────────

  RSA_CAN: [
    { text: "South Africa became the first and only host nation ever knocked out in the group stage. They played three games on home soil at the 2010 World Cup and didn't make it through.", category: 'wc-history' },
    { text: "Canada scored their first World Cup goal in 2022, against Croatia, 36 years after their only previous appearance — where they played three games and failed to find the net once.", category: 'record' },
    { text: "Canada topped CONCACAF qualifying for the 2022 World Cup ahead of the USA and Mexico, their first time finishing first in a cycle. Almost nobody predicted it.", category: 'upset' },
  ],

  BRA_JPN: [
    { text: "Japan beat Germany and Spain in the 2022 group stage, coming from a goal down in both games. Both opponents were former world champions who said Japan's second-half switch was unlike anything they had prepared for.", category: 'upset' },
    { text: "Brazil have played at every World Cup since the competition began in 1930. No other country has qualified for all 22 tournaments.", category: 'record' },
    { text: "Ronaldo — the Brazilian — scored 8 goals at the 2002 World Cup for his second Golden Boot, having returned from injuries so severe that most doctors believed his career was finished.", category: 'player' },
  ],

  GER_PAR: [
    { text: "Germany have reached the World Cup semi-finals more times than any other nation, 13 appearances in the last four. They have never finished outside the top three whenever they've made it that far.", category: 'record' },
    { text: "Paraguay's goalkeeper José Luis Chilavert took free kicks and penalties throughout his career and scored over 60 goals, including 8 for the national team. The only goalkeeper to score a hat-trick.", category: 'player' },
    { text: "Germany scored 7 goals against Brazil in the 2014 semi-final. Brazil's home crowd went silent after the fifth. The result is still called 'Mineirazo' in Brazil today.", category: 'wc-history' },
  ],

  NED_MAR: [
    { text: "Morocco became the first African and Arab nation to reach a World Cup semi-final in 2022, eliminating Belgium, Spain, and Portugal along the way. Not a single one of those teams saw it coming.", category: 'upset' },
    { text: "The Netherlands appeared in three World Cup finals — 1974, 1978, and 2010 — without winning any. Their 1974 squad, built on Johan Cruyff's Total Football, is still considered one of the greatest teams never to lift the trophy.", category: 'record' },
    { text: "Morocco's goalkeeper Bono saved three penalties against Spain in the 2022 round of 16. Spain had 12 shots and 77% possession and still lost.", category: 'penalty' },
  ],

  CIV_NOR: [
    { text: "Norway beat Brazil 2–1 at the 1998 World Cup, a team featuring Ronaldo, Roberto Carlos, Rivaldo, and Bebeto. Tore André Flo scored twice. Brazil's run of 35 unbeaten World Cup matches was over.", category: 'upset' },
    { text: "Didier Drogba led Ivory Coast to three Africa Cup of Nations finals and their first World Cup qualification in 2006. Ivory Coast drew a group with Argentina, Netherlands, and Serbia, widely considered the toughest group in that tournament.", category: 'wc-history' },
    { text: "Sweden's Zlatan Ibrahimović scored 62 international goals and is his country's greatest ever player. He never played at a single World Cup.", category: 'trivia' },
  ],

  FRA_SWE: [
    { text: "France have appeared in four World Cup finals since 1998 and won two of them. No other nation has reached that many finals in the same 28-year stretch.", category: 'record' },
    { text: "Kylian Mbappé became only the second teenager to score in a World Cup final in 2018, after Pelé in 1958. Both scored twice. Both teams won.", category: 'player' },
    { text: "Sweden reached the 2018 World Cup semi-finals without Zlatan Ibrahimović, who had retired from international football two years earlier. They had no recognisable global names and still made the last four.", category: 'wc-history' },
  ],

  USA_BIH: [
    { text: "The USA beat England 1–0 at the 1950 World Cup. The result was so unexpected that several British newspapers assumed it was a misprint and refused to run it.", category: 'upset' },
    { text: "The USA reached the semi-finals of the very first World Cup in 1930, beating Belgium and Paraguay before losing to Argentina. It remains their best ever finish in the tournament.", category: 'wc-history' },
    { text: "Bosnia & Herzegovina made their World Cup debut in Brazil in 2014 after only becoming a FIFA member in 1996. They beat Iran 3–1 in a group that also included Argentina.", category: 'milestone' },
  ],

  AUS_EGY: [
    { text: "Egypt were the first African country ever to qualify for a World Cup, back in 1934, before most of the continent's nations were independent states.", category: 'milestone' },
    { text: "Australia's goalkeeper Mark Schwarzer saved two penalties in the 2006 World Cup playoff against Uruguay, sending the Socceroos to the tournament for the first time in 32 years.", category: 'penalty' },
    { text: "Tim Cahill scored Australia's first World Cup goal in 2006 against Japan. His header against Brazil in the same tournament had Ronaldo calling it one of the best goals he'd ever seen conceded.", category: 'player' },
  ],

  ARG_CPV: [
    { text: "Cape Verde is ten Atlantic islands with a total population of around 550,000 people. Their 2026 qualification is one of the most remarkable in the tournament's history.", category: 'milestone' },
    { text: "Argentina went from losing to Saudi Arabia in their first 2022 group game to winning the whole tournament. Messi's fifth World Cup ended with the one trophy that had eluded him throughout his entire career.", category: 'wc-history' },
    { text: "Lionel Messi won the Golden Boot, the Golden Ball, and the World Cup trophy at the 2022 tournament — the only player in history to take all three in the same competition.", category: 'player' },
  ],

  // ── Group stage (June 11 – July 2) ───────────────────────────────────────

  MEX_RSA: [
    { text: "Mexico hosted the World Cup in 1970 and 1986. Their 2026 co-hosting makes them the first country ever to host three times.", category: 'record' },
  ],

  KOR_CZE: [
    { text: "South Korea are the only Asian team to reach a World Cup semi-final. To get there in 2002, they knocked out Spain and Italy — two former world champions — along the way.", category: 'wc-history' },
  ],

  CAN_BIH: [
    { text: "Canada are co-hosts of the 2026 World Cup alongside the USA and Mexico. It's the first time three nations have shared hosting duties in the tournament's 96-year history.", category: 'milestone' },
  ],

  USA_PAR: [
    { text: "The USA beat England 1–0 at the 1950 World Cup. Several British newspapers refused to publish the result, assuming the scoreline was a printing error.", category: 'upset' },
  ],

  QAT_SUI: [
    { text: "Switzerland beat eventual champions Spain 1–0 at the 2010 World Cup group stage. It was Spain's only defeat in a tournament they won from start to finish.", category: 'upset' },
  ],

  BRA_MAR: [
    { text: "Morocco became the first African and Arab nation to reach a World Cup semi-final in 2022, eliminating Belgium, Spain, and Portugal along the way.", category: 'wc-history' },
  ],

  HAI_SCO: [
    { text: "Haiti's Emmanuel Sanon ended Dino Zoff's world-record 1,143-minute international clean sheet at the 1974 World Cup, scoring past one of the greatest goalkeepers of all time.", category: 'record' },
  ],

  AUS_TUR: [
    { text: "Hakan Şükür scored the fastest goal in World Cup history: just 11 seconds into Turkey's 2002 third-place match. The ball had barely been touched when he finished.", category: 'record' },
  ],

  GER_CUW: [
    { text: "Curaçao is a Caribbean island of about 160,000 people and one of the smallest nations ever to appear at a World Cup.", category: 'trivia' },
  ],

  NED_JPN: [
    { text: "Japan beat Germany and Spain in the same 2022 group stage, coming from behind in both games. Both were former world champions.", category: 'upset' },
  ],

  CIV_ECU: [
    { text: "Ecuador's Enner Valencia scored the first goal of the 2022 World Cup against host nation Qatar in the opening minutes of the tournament's very first match.", category: 'wc-history' },
  ],

  SWE_TUN: [
    { text: "Tunisia became the first African nation to win a World Cup match when they beat Mexico 3–1 in 1978, before any other African team had won a single game at the tournament.", category: 'milestone' },
  ],

  ESP_CPV: [
    { text: "Cape Verde, ten Atlantic islands with a total population of 550,000, are making their World Cup debut in 2026. One of the smallest nations ever to qualify.", category: 'milestone' },
  ],

  BEL_EGY: [
    { text: "Belgium held the FIFA world number-one ranking for six consecutive years, from 2015 to 2021, with De Bruyne, Hazard, Lukaku, and Courtois all in their prime at the same time.", category: 'record' },
  ],

  KSA_URU: [
    { text: "Saudi Arabia beat Messi's Argentina 2–1 in the 2022 World Cup group stage, one of the biggest shocks in tournament history. Argentina went on to win the whole competition.", category: 'upset' },
  ],

  IRN_NZL: [
    { text: "New Zealand went unbeaten at the 2010 World Cup with three draws, including one against Italy, the reigning world champions. They were still eliminated.", category: 'trivia' },
  ],

  FRA_SEN: [
    { text: "Senegal's first ever World Cup match was against defending champions France in 2002. Senegal won 1–0 and went on to reach the quarter-finals in their debut tournament.", category: 'h2h' },
  ],

  IRQ_NOR: [
    { text: "Norway beat Brazil 2–1 at the 1998 World Cup, a team featuring Ronaldo, Roberto Carlos, Rivaldo, and Bebeto. Tore André Flo scored both Norwegian goals.", category: 'upset' },
  ],

  ARG_ALG: [
    { text: "Algeria reached the round of 16 in 2014 and took eventual champions Germany to extra time. German players said afterwards it was their hardest match of the entire tournament.", category: 'wc-history' },
  ],

  AUT_JOR: [
    { text: "Austria beat Switzerland 7–5 in the 1954 World Cup quarter-final, the highest-scoring game in the competition's history. Ten goals in 90 minutes.", category: 'record' },
  ],

  POR_COD: [
    { text: "Portugal's Eusébio scored 4 goals against North Korea in the 1966 quarter-final, coming back from 3–0 down to win 5–3. One of the most extraordinary individual performances in World Cup history.", category: 'player' },
  ],

  ENG_CRO: [
    { text: "Croatia reached the 2018 World Cup final with a population of just 4 million, winning three consecutive knockout matches without once finishing ahead after 90 minutes.", category: 'record' },
  ],

  GHA_PAN: [
    { text: "Panama's first ever World Cup goal, scored against England in 2018 when the score was already 6–1, prompted celebrations in Panama City that lasted through the night.", category: 'wc-history' },
  ],

  UZB_COL: [
    { text: "James Rodríguez won the Golden Boot at the 2014 World Cup with 6 goals. His volley against Uruguay was voted Goal of the Tournament. He was 22 years old.", category: 'player' },
  ],

  CZE_RSA: [
    { text: "South Africa's Siphiwe Tshabalala scored the opening goal of the first World Cup held on African soil in 2010. It remains one of the most celebrated strikes in the competition's history.", category: 'wc-history' },
  ],

  SUI_BIH: [
    { text: "Switzerland have been knocked out of the World Cup on penalties more times than any other nation, four exits in total. They reach the shootout and then they can't finish it.", category: 'penalty' },
  ],

  CAN_QAT: [
    { text: "Qatar 2022 was played in air-conditioned stadiums in November and December, changing almost every hosting convention the tournament had established since 1930.", category: 'trivia' },
  ],

  MEX_KOR: [
    { text: "Mexico have been knocked out in the round of 16 at seven consecutive World Cups. Mexican fans call the elusive next round 'el quinto partido' — the fifth game that never comes.", category: 'record' },
  ],

  USA_AUS: [
    { text: "Australia's goalkeeper Mark Schwarzer saved two penalties in the 2006 World Cup playoff against Uruguay, sending Australia to the tournament for the first time in 32 years.", category: 'penalty' },
  ],

  SCO_MAR: [
    { text: "Scotland's Archie Gemmill wove through five Dutch defenders at the 1978 World Cup to score one of the most celebrated individual goals in the competition's history.", category: 'player' },
  ],

  BRA_HAI: [
    { text: "Brazil have played at every World Cup in history, all 22 of them. No other nation has a perfect qualification record.", category: 'record' },
  ],

  TUR_PAR: [
    { text: "Paraguay's goalkeeper José Luis Chilavert took free kicks and penalties throughout his career and scored over 60 goals. He remains the only goalkeeper ever to score a World Cup hat-trick.", category: 'player' },
  ],

  NED_SWE: [
    { text: "The Netherlands appeared in three World Cup finals — 1974, 1978, and 2010 — without winning any. Their 1974 squad is still considered one of the greatest teams never to lift the trophy.", category: 'record' },
  ],

  GER_CIV: [
    { text: "Ivory Coast's Boubacar Barry hadn't played a single minute at the 2015 Africa Cup of Nations, then saved three penalties in the final shootout and scored the winner himself.", category: 'penalty' },
  ],

  ECU_CUW: [
    { text: "Curaçao qualified for 2026 with a squad of Dutch-born players who chose to represent the island, turning down the opportunity to play for the Netherlands.", category: 'trivia' },
  ],

  TUN_JPN: [
    { text: "Japan used the same blueprint against Germany and Spain in 2022: defend deep for 45 minutes, switch shape at half-time, counter at speed. Both opponents said they had never seen anything like it.", category: 'wc-history' },
  ],

  ESP_KSA: [
    { text: "Spain won three consecutive major tournaments — Euro 2008, World Cup 2010, and Euro 2012. No other nation has ever won three in a row.", category: 'record' },
  ],

  BEL_IRN: [
    { text: "Belgium came from 0–2 down to beat Brazil 3–2 in the 2018 World Cup quarter-final. Brazilian players have said it was one of the most painful nights in the nation's recent football history.", category: 'upset' },
  ],

  URU_CPV: [
    { text: "Uruguay have won the Copa América 15 times, more than any other nation, and won the very first World Cup ever held, back in 1930.", category: 'record' },
  ],

  NZL_EGY: [
    { text: "Egypt were the first African country to qualify for a World Cup, back in 1934, before most African nations were independent states.", category: 'milestone' },
  ],

  ARG_AUT: [
    { text: "Argentina's 2022 World Cup victory was Messi's defining moment. At his fifth World Cup, he won the Golden Boot, the Golden Ball, and the trophy itself — the only player ever to achieve that in one tournament.", category: 'player' },
  ],

  FRA_IRQ: [
    { text: "Kylian Mbappé became only the second teenager to score in a World Cup final in 2018, after Pelé in 1958. Both scored twice. Both teams won.", category: 'player' },
  ],

  NOR_SEN: [
    { text: "Senegal's 2002 squad played most of their football in France's lower leagues and still beat the defending world champions in their opening game, before reaching the quarter-finals.", category: 'upset' },
  ],

  JOR_ALG: [
    { text: "Algeria's 1982 win over West Germany prompted such controversy that FIFA introduced simultaneous final-round group matches at all future World Cups — a rule that has shaped every tournament since.", category: 'trivia' },
  ],

  POR_UZB: [
    { text: "Cristiano Ronaldo holds the world record for men's international goals yet has never won a World Cup. He appeared at five tournaments without the one trophy that would complete the set.", category: 'record' },
  ],

  ENG_GHA: [
    { text: "Ghana became the first African team since Cameroon in 1990 to reach a World Cup quarter-final, beating the USA in the round of 16 in 2010.", category: 'wc-history' },
  ],

  PAN_CRO: [
    { text: "Croatia's Mario Mandžukić scored an own goal and then a spectacular overhead kick equaliser in the 2018 World Cup final, two of the most unforgettable moments of the same match.", category: 'wc-history' },
  ],

  COL_COD: [
    { text: "DR Congo's Mwepu Ilunga sprinted from the wall at the 1974 World Cup and kicked a Brazilian free kick away before it was taken. He later said he thought the referee had blown for the restart.", category: 'trivia' },
  ],

  SUI_CAN: [
    { text: "Canada's first World Cup goal came in 2022, scored against Croatia, 36 years after their only previous appearance in 1986 where they played three games and didn't score once.", category: 'record' },
  ],

  BIH_QAT: [
    { text: "Qatar 2022 was played in November and December, rescheduled from its traditional summer slot to avoid 40-degree heat. Every scheduling convention the tournament had held since 1930 changed.", category: 'trivia' },
  ],

  MAR_HAI: [
    { text: "Morocco beat Spain on penalties in the 2022 round of 16, knocking out the 2010 world champions. No African team had ever gone further in the tournament.", category: 'penalty' },
  ],

  SCO_BRA: [
    { text: "Pelé is the only player to have won three World Cups — 1958, 1962, and 1970. He scored twice in the 1958 final against Sweden aged just 17.", category: 'player' },
  ],

  CZE_MEX: [
    { text: "Czechoslovakia played in two World Cup finals — 1934 and 1962 — yet since the country split in 1993, neither Czech Republic nor Slovakia has ever reached a World Cup quarter-final.", category: 'wc-history' },
  ],

  RSA_KOR: [
    { text: "South Korea beat Germany 2–0 in the 2018 World Cup group stage, sending the reigning world champions home in one of the biggest shocks in the tournament's modern era.", category: 'upset' },
  ],

  ECU_GER: [
    { text: "Germany are the only European nation to win the World Cup on South American soil. Their 2014 title was won in Brazil, widely regarded as the spiritual home of the sport.", category: 'record' },
  ],

  CUW_CIV: [
    { text: "Ivory Coast were drawn into a group with at least one former world champion at every World Cup they attended in 2006, 2010, and 2014. The draw was never kind to them.", category: 'trivia' },
  ],

  JPN_SWE: [
    { text: "Sweden's Zlatan Ibrahimović scored 62 international goals and is widely considered the greatest Swedish player in history. He never once played at a World Cup.", category: 'record' },
  ],

  TUN_NED: [
    { text: "Tunisia beat France 1–0 in the final group game of the 2022 World Cup. France rested several starters, but the win was real, and the celebrations in Tunisia were enormous.", category: 'wc-history' },
  ],

  TUR_USA: [
    { text: "Turkey finished third at the 2002 World Cup, their best ever result — the same tournament where Hakan Şükür scored the fastest goal in World Cup history just 11 seconds in.", category: 'wc-history' },
  ],

  PAR_AUS: [
    { text: "Australia reached the round of 16 at the 2006 World Cup, their best ever finish, on their first appearance in the tournament in 32 years.", category: 'wc-history' },
  ],

  SEN_IRQ: [
    { text: "Senegal qualified for the 2022 World Cup by beating Egypt on penalties — the same week they had beaten Egypt on penalties in the Africa Cup of Nations final. Same opponents, same result, twice in a row.", category: 'trivia' },
  ],

  NOR_FRA: [
    { text: "France have appeared in four World Cup finals since 1998 and won two of them. No other nation has sustained that level of consistency across the same 28-year period.", category: 'record' },
  ],

  URU_ESP: [
    { text: "Spain won three consecutive major tournaments — Euro 2008, World Cup 2010, and Euro 2012 — the only nation ever to win three in a row. Uruguay won the very first World Cup in 1930.", category: 'record' },
  ],

  CPV_KSA: [
    { text: "Saudi Arabia's league has recently signed Ronaldo, Benzema, Neymar, and Roberto Firmino, meaning the Saudi national team trains weekly against former Ballon d'Or winners.", category: 'trivia' },
  ],

  EGY_IRN: [
    { text: "Egypt qualified for the 2018 World Cup for the first time in 28 years. Mohamed Salah's decisive penalty in the qualifying campaign sent the whole country into celebration.", category: 'wc-history' },
  ],

  NZL_BEL: [
    { text: "Belgium's 1986 World Cup squad was their first to reach a semi-final in 52 years, built around goalkeeper Jean-Marie Pfaff, widely considered one of the best to ever play the position.", category: 'wc-history' },
  ],

  CRO_GHA: [
    { text: "Croatia have appeared in just eight World Cups and reached the final twice — in 1998 and 2018. For a nation of 4 million people, that record is extraordinary.", category: 'record' },
  ],

  PAN_ENG: [
    { text: "Harry Kane won the Golden Boot at the 2018 World Cup with 6 goals, the first England player to win the award since Gary Lineker in 1986.", category: 'player' },
  ],

  COL_POR: [
    { text: "Portugal's Luis Figo, Rui Costa, and a teenage Cristiano Ronaldo all played at the 2006 World Cup together — one of the most talented squads the nation has ever assembled.", category: 'wc-history' },
  ],

  COD_UZB: [
    { text: "DR Congo return to the World Cup after 52 years, the longest gap between appearances for any team at the 2026 tournament.", category: 'record' },
  ],

  ALG_AUT: [
    { text: "Algeria beat South Korea 4–2 in the 2014 World Cup group stage, their highest-scoring World Cup performance, then took eventual champions Germany to extra time in the next round.", category: 'wc-history' },
  ],

  JOR_ARG: [
    { text: "Argentina's 1986 quarter-final against England produced arguably the two most famous goals in football history — four minutes apart, both scored by Maradona.", category: 'player' },
  ],
}

// ── Public exports ──────────────────────────────────────────────────────────

export const FACTS_MAP = new Map(Object.entries(MATCH_FACTS))

// Shown when no match-specific fact exists (knockout rounds with unknown pairings,
// or any match not yet added to the map). Kept diverse across categories so the
// fallback rotation still feels fresh.
export const FALLBACK_FACTS: MatchFact[] = [
  { text: "Just Fontaine scored 13 goals at the 1958 World Cup — a record that has stood for over 65 years. No player in the modern game has come within 5 of it.", category: 'record' },
  { text: "The 2026 World Cup is the first ever co-hosted by three nations. The USA, Canada, and Mexico share 16 venues across a continent, a logistical challenge the tournament has never attempted before.", category: 'milestone' },
  { text: "Miroslav Klose holds the all-time World Cup scoring record with 16 goals across four tournaments for Germany. He scored at least one goal in each one.", category: 'player' },
  { text: "Italy won the 1982 World Cup after barely scraping through the group stage with three draws. Their striker Paolo Rossi hadn't scored in over two years before the tournament started.", category: 'wc-history' },
  { text: "The fastest goal in World Cup history was scored just 11 seconds in, by Turkey's Hakan Şükür against South Korea in the 2002 third-place match. The ball had barely been touched.", category: 'record' },
  { text: "North Korea reached the 1966 World Cup quarter-finals, eliminating Italy along the way. It remains the only time Italy have been knocked out of the group stage by an Asian team.", category: 'upset' },
  { text: "Gerd Müller scored 14 goals across the 1970 and 1974 World Cups combined. His 1970 haul of 10 goals in one tournament stood as the single-tournament record for over 50 years.", category: 'player' },
  { text: "The USA hosted the 1994 World Cup with no top-flight professional league of their own. The tournament's 3.6 million total attendance still stands as the all-time record.", category: 'trivia' },
  { text: "Argentina's René Houseman scored at the 1978 World Cup despite reportedly being injured during a dispute with a teammate the night before the game. He came on as a substitute and changed the match.", category: 'trivia' },
  { text: "Roger Milla celebrated every one of his goals at the 1990 World Cup by dancing around the corner flag. He was 38 years old. No player older than him has ever scored at a World Cup.", category: 'player' },
  { text: "West Germany won the 1954 World Cup having lost 8–3 to Hungary in the group stage three weeks earlier. Their final opponents were the same Hungary team. West Germany won 3–2.", category: 'upset' },
  { text: "Every single penalty shootout in World Cup history from 1982 to 2022 has included at least one miss. No team has ever had all five penalties converted in the same shoot-out.", category: 'penalty' },
]
