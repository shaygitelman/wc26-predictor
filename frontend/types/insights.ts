import type { DataProvenance } from './provenance'

export type FormResult      = 'W' | 'D' | 'L'
export type ConfidenceLevel = 'low' | 'medium' | 'high'

export interface KeyEdge {
  teamCode:    string          // FIFA 3-letter code for flag lookup
  teamName:    string
  side:        'home' | 'away'
  label:       string          // 3–5 words: "Elite Attacking Depth"
  explanation: string          // 2–3 sentences citing confirmed data
}

export interface AIPrediction {
  homeScore:    number
  awayScore:    number
  homeTeamName: string
  awayTeamName: string
  reasoning:    string[]       // 2–3 data-backed bullets
  confidence:   ConfidenceLevel
}

export interface MatchInsights {
  matchId:           string
  generatedAt:       string
  insufficientData?: boolean   // true when one or both teams are TBD

  story:           string          // 2–3 sentence analyst narrative
  keyEdge:         KeyEdge
  decidingFactors: string[]        // 2–3 specific match-deciding elements
  prediction:      AIPrediction

  form: {
    home: FormResult[]             // up to 5 results, oldest → newest
    away: FormResult[]
  }

  dataProvenance?: DataProvenance
}
