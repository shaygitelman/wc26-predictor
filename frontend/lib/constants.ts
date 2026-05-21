export const APP_NAME = 'MatchPoint26'
export const TOURNAMENT_YEAR = 2026

/** Round-aware points per official תקנון המשחק. */
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

/** Convenience alias for group-stage defaults (most common round). */
export const POINTS = {
  GROUP_EXACT:     3,
  GROUP_DIRECTION: 1,
} as const

export const AUTH_ROUTES = ['/login', '/register']

export const NAV_TABS = [
  { href: '/',            label: 'Home',    icon: 'Home'      },
  { href: '/matches',     label: 'Matches', icon: 'Calendar'  },
  { href: '/leagues',     label: 'Leagues', icon: 'Trophy'    },
  { href: '/groups',      label: 'Groups',  icon: 'Table2'    },
  { href: '/profile',     label: 'Profile', icon: 'User'      },
] as const

export const MATCH_FILTER_OPTIONS = [
  { value: 'all',      label: 'All'       },
  { value: 'today',    label: 'Today'     },
  { value: 'upcoming', label: 'Upcoming'  },
  { value: 'live',     label: 'Live'      },
  { value: 'group-a',  label: 'Group A'   },
  { value: 'group-b',  label: 'Group B'   },
  { value: 'group-c',  label: 'Group C'   },
  { value: 'r16',      label: 'R16'       },
  { value: 'qf',       label: 'QF'        },
  { value: 'sf',       label: 'SF'        },
  { value: 'final',    label: 'Final'     },
] as const
