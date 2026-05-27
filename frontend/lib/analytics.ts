/**
 * Typed analytics helpers wrapping PostHog.
 *
 * All calls are no-ops when PostHog hasn't been initialised (missing env var,
 * server-side render, or ad-blocker) so callers never need to guard.
 *
 * Add new events here to keep a single source of truth for event names
 * and their required properties.
 */

import posthog from 'posthog-js'

// ── User identity ─────────────────────────────────────────────────────────────

export function identifyUser(userId: string, traits: {
  email:    string
  username: string
  name?:    string
}) {
  if (typeof window === 'undefined' || !posthog.__loaded) return
  posthog.identify(userId, traits)
}

export function resetIdentity() {
  if (typeof window === 'undefined' || !posthog.__loaded) return
  posthog.reset()
}

// ── Auth events ───────────────────────────────────────────────────────────────

export function trackSignIn(method: 'google') {
  capture('user_signed_in', { method })
}

// ── Onboarding events ─────────────────────────────────────────────────────────

export function trackOnboardingStarted() {
  capture('onboarding_started')
}

export function trackOnboardingCompleted(props: {
  pickedWinner: boolean
  pickedScorer: boolean
  hadInvite:    boolean
}) {
  capture('onboarding_completed', props)
}

export function trackOnboardingStep(step: 'welcome' | 'winner' | 'scorer' | 'celebration') {
  capture('onboarding_step_viewed', { step })
}

// ── Predictions ───────────────────────────────────────────────────────────────

export function trackPredictionSubmitted(props: {
  matchId:   string
  round:     string
  isNew:     boolean   // false = edit
  homeScore: number
  awayScore: number
}) {
  capture('prediction_submitted', props)
}

// ── Tournament picks ──────────────────────────────────────────────────────────

export function trackTournamentPicksSaved(props: {
  pickedWinner: boolean
  pickedScorer: boolean
}) {
  capture('tournament_picks_saved', props)
}

// ── Leagues ───────────────────────────────────────────────────────────────────

export function trackLeagueCreated() {
  capture('league_created')
}

export function trackLeagueJoined(props: { source: 'invite_link' | 'code_entry' | 'onboarding_auto' }) {
  capture('league_joined', props)
}

export function trackInviteLinkCopied(props: { leagueId: string }) {
  capture('invite_link_copied', props)
}

// ── Internal ──────────────────────────────────────────────────────────────────

function capture(event: string, properties?: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  try {
    posthog.capture(event, properties)
  } catch {
    // Never throw — analytics must never break the user experience
  }
}
