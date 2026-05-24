import { ContextHeader } from '@/components/layout/context-header'
import { apiGet } from '@/lib/api-server'
import { PrivacyClient, type PrivacySettings } from './privacy-client'

const DEFAULTS: PrivacySettings = {
  hidePicksUntilKickoff: true,
  profilePublic:         true,
  showStats:             true,
  showActivity:          true,
  showFavoriteTeam:      true,
  allowLeagueInvites:    true,
}

export default async function PrivacyPage() {
  let settings: PrivacySettings = DEFAULTS
  try {
    settings = await apiGet<PrivacySettings>('/users/me/privacy')
  } catch {
    // unauthenticated or backend unavailable — render with defaults
  }

  return (
    <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
      <ContextHeader title="Privacy & Visibility" back="/profile" />
      <PrivacyClient initialSettings={settings} />
    </div>
  )
}
