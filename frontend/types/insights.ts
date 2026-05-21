export type FormResult      = 'W' | 'D' | 'L'
export type ConfidenceLevel = 'low' | 'medium' | 'high'
export type EdgeTeam        = 'home' | 'away' | 'draw'

export type MatchPersonality =
  | 'explosive'          // High-scoring, attack vs attack
  | 'tactical-battle'    // Chess match, disciplined sides
  | 'defensive-grind'    // Low-scoring, walls vs walls
  | 'upset-alert'        // Underdog can topple the favourite
  | 'star-power'         // Individual brilliance will decide
  | 'balanced'           // Evenly matched, genuinely open

export type TacticalCategory =
  | 'transition'
  | 'pressing'
  | 'possession'
  | 'wide-threats'
  | 'set-pieces'
  | 'defensive-shape'
  | 'midfield-control'
  | 'counterattack'
  | 'finishing'
  | 'high-line'
  | 'key-duel'

export type SectionKey =
  | 'form'
  | 'tactical'
  | 'narrative'
  | 'key-players'
  | 'head-to-head'
  | 'coaching-hint'

export interface InsightBullet {
  text:       string
  highlight?: 'positive' | 'negative' | 'neutral' | 'warning'
  source?:    string   // explainability: which data field(s) this derives from
}

// A single team's measured value — shown alongside the AI interpretation text
export interface InsightDataPoint {
  teamName: string
  value:    string   // e.g. "2.4 goals/game", "64% possession"
  side?:    'home' | 'away'
}

export interface TacticalInsight {
  category:    TacticalCategory
  text:        string
  highlight?:  'positive' | 'negative' | 'neutral' | 'warning'
  source?:     string               // explainability: which data field(s) this derives from
  dataPoints?: InsightDataPoint[]   // structured comparison shown above the AI text
}

export interface NarrativeInsight {
  headline: string   // Short, bold — e.g. "A Golden Generation Moment"
  body:     string   // 1–2 sentences of football storytelling
}

export interface InsightsDebugInfo {
  rawFactsCount: number
  groqLatencyMs: number | null
  groqFallback:  boolean
  insightCount:  number
  confidence:    ConfidenceLevel
  apiBaseUsed:   string
}

export interface MatchInsights {
  matchId:          string
  generatedAt:      string
  insufficientData?: boolean   // true when teams are TBD or required data is unavailable

  personality:      MatchPersonality
  personalityLabel: string
  volatility:       number   // 0–10: how unpredictable this fixture is

  form: {
    home: FormResult[]   // 5 results, oldest → newest
    away: FormResult[]
  }
  formSampleSize?: { home: number; away: number }

  tactical:     TacticalInsight[]        // 2–4 football-specific observations
  narrative:    NarrativeInsight | null  // Story angle (omitted for low-profile fixtures)
  coachingHint: string | null            // Subtle prediction guidance

  keyPlayers:  InsightBullet[]   // 2 standout player highlights
  headToHead:  InsightBullet[]   // 1–2 h2h bullets

  edge: {
    team:     EdgeTeam
    teamName: string
    strength: 'clear' | 'slight'
  }
  confidence:  ConfidenceLevel
  upsetAlert:  boolean
  edgeNote:    string

  sectionOrder: SectionKey[]   // Dynamic per-match render order

  // Optional debug payload — only present when DEBUG_AI_INSIGHTS=true
  _debug?: InsightsDebugInfo
}
