'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, EyeOff, Globe, TrendingUp, Clock, Star, UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────

interface PrivacySettings {
  hidePicksUntilKickoff: boolean
  profilePublic:         boolean
  showStats:             boolean
  showActivity:          boolean
  showFavoriteTeam:      boolean
  allowLeagueInvites:    boolean
}

const DEFAULTS: PrivacySettings = {
  hidePicksUntilKickoff: true,
  profilePublic:         true,
  showStats:             true,
  showActivity:          true,
  showFavoriteTeam:      true,
  allowLeagueInvites:    true,
}

// ─── Page ─────────────────────────────────────────────────────

export default function PrivacyPage() {
  const router = useRouter()

  const [settings, setSettings] = useState<PrivacySettings>(DEFAULTS)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  useEffect(() => {
    fetch('/api/users/me/privacy')
      .then(r => r.ok ? r.json() : null)
      .then((data: PrivacySettings | null) => { if (data) setSettings(data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const toggle = useCallback(async (key: keyof PrivacySettings) => {
    const newVal = !settings[key]
    setSettings(prev => ({ ...prev, [key]: newVal }))
    setError('')

    try {
      const res = await fetch('/api/users/me/privacy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: newVal }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setSettings(prev => ({ ...prev, [key]: !newVal }))
      setError('Could not save. Please try again.')
      setTimeout(() => setError(''), 3000)
    }
  }, [settings])

  return (
    <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 flex items-center h-14 px-4 gap-3 bg-surface/90 backdrop-blur-md border-b border-border/80">
        <button
          onClick={() => router.push('/profile')}
          className="flex items-center justify-center size-9 -ml-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="flex-1 font-bold text-[17px] text-foreground">Privacy & Visibility</h1>
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="size-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-5 p-4 pt-5">

          {/* ── Predictions ── */}
          <SettingsSection label="Predictions">
            <SettingRow
              icon={EyeOff}
              title="Hide picks until kickoff"
              description="Your predictions stay private until each match begins. League members see them revealed after kickoff."
              checked={settings.hidePicksUntilKickoff}
              onChange={() => toggle('hidePicksUntilKickoff')}
            />
          </SettingsSection>

          {/* ── Profile ── */}
          <SettingsSection label="Profile">
            <SettingRow
              icon={Globe}
              title="Public profile"
              description="Allow others to discover and view your profile outside of your leagues."
              checked={settings.profilePublic}
              onChange={() => toggle('profilePublic')}
            />
          </SettingsSection>

          {/* ── Stats & Activity ── */}
          <SettingsSection label="Stats & Activity">
            <SettingRow
              icon={TrendingUp}
              title="Show prediction stats"
              description="Show your points and ranking to other league members in standings."
              checked={settings.showStats}
              onChange={() => toggle('showStats')}
              divider
            />
            <SettingRow
              icon={Clock}
              title="Show recent activity"
              description="Show your prediction history in activity feeds and on your public profile."
              checked={settings.showActivity}
              onChange={() => toggle('showActivity')}
            />
          </SettingsSection>

          {/* ── Social ── */}
          <SettingsSection label="Social">
            <SettingRow
              icon={Star}
              title="Display favorite team"
              description="Show your tournament pick on your public profile."
              checked={settings.showFavoriteTeam}
              onChange={() => toggle('showFavoriteTeam')}
              divider
            />
            <SettingRow
              icon={UserPlus}
              title="Allow league invitations"
              description="Other users can send you invitations to join their leagues."
              checked={settings.allowLeagueInvites}
              onChange={() => toggle('allowLeagueInvites')}
            />
          </SettingsSection>

          {/* ── Error ── */}
          {error && (
            <p className="text-[12px] text-status-lost text-center animate-fade-in">{error}</p>
          )}

          {/* ── Footer ── */}
          <p className="text-[11px] text-muted-foreground/35 text-center leading-relaxed px-6 pb-2">
            These settings control your visibility within the app.
            Your data is never shared externally.
          </p>

        </div>
      )}
    </div>
  )
}

// ─── Section ──────────────────────────────────────────────────

function SettingsSection({
  label,
  children,
}: {
  label:    string
  children: React.ReactNode
}) {
  return (
    <section>
      <p className="text-2xs font-bold tracking-[0.12em] uppercase text-muted-foreground/60 mb-3 px-0.5">
        {label}
      </p>
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {children}
      </div>
    </section>
  )
}

// ─── Row ──────────────────────────────────────────────────────

interface SettingRowProps {
  icon:        LucideIcon
  title:       string
  description: string
  checked:     boolean
  onChange:    () => void
  divider?:    boolean
}

function SettingRow({ icon: Icon, title, description, checked, onChange, divider }: SettingRowProps) {
  return (
    <div className={cn(
      'flex items-start gap-4 px-4 py-4',
      divider && 'border-b border-border/50',
    )}>
      {/* Icon */}
      <div className="mt-[1px] size-[34px] rounded-xl flex items-center justify-center flex-shrink-0 bg-primary/[0.07]">
        <Icon className="size-[15px] text-primary/65" strokeWidth={1.75} />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0 pt-[1px]">
        <p className="text-[14.5px] font-semibold text-foreground leading-snug">{title}</p>
        <p className="text-[12px] text-muted-foreground/55 mt-[3px] leading-[1.45]">{description}</p>
      </div>

      {/* Toggle */}
      <div className="mt-[2px]">
        <Toggle checked={checked} onChange={onChange} />
      </div>
    </div>
  )
}

// ─── Toggle ───────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        'relative flex-shrink-0 rounded-full transition-colors duration-200 focus:outline-none',
        'w-[46px] h-[27px]',
        checked ? 'bg-primary' : 'bg-muted-foreground/20',
      )}
    >
      <span className={cn(
        'absolute top-[3px] size-[21px] rounded-full bg-white',
        'shadow-[0_1px_3px_rgba(0,0,0,0.22),0_0.5px_1px_rgba(0,0,0,0.12)]',
        'transition-transform duration-200 ease-in-out',
        checked ? 'translate-x-[21px]' : 'translate-x-[3px]',
      )} />
    </button>
  )
}
