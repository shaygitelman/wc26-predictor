/** Round-aware points per official WC 2026 rules. */
export const ROUND_POINTS: Record<string, { direction: number; exact: number }> = {
  group: { direction: 1,  exact: 3  },
  r32:   { direction: 2,  exact: 5  },
  r16:   { direction: 2,  exact: 5  },
  qf:    { direction: 4,  exact: 8  },
  sf:    { direction: 5,  exact: 10 },
  '3rd': { direction: 5,  exact: 10 },
  final: { direction: 8,  exact: 15 },
}

/** Tournament pick bonuses. */
export const TOURNAMENT_BONUS = {
  WINNER:     12,
  TOP_SCORER: 12,
} as const

export const AUTH_ROUTES = ['/login', '/register', '/onboarding']
