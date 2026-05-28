'use client'

import { useEffect, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Platform = 'ios' | 'android-pwa' | 'android-manual'

// Minimal typed interface — standard lib doesn't include BeforeInstallPromptEvent
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface Props {
  deferredPrompt: BeforeInstallPromptEvent | null
  onDone:         () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InstallPrompt({ deferredPrompt, onDone }: Props) {
  const [platform,   setPlatform]   = useState<Platform | null>(null)
  const [installing, setInstalling] = useState(false)
  const [visible,    setVisible]    = useState(false)

  useEffect(() => {
    const ua         = navigator.userAgent
    const standalone = window.matchMedia('(display-mode: standalone)').matches

    // Already installed as PWA — skip silently
    if (standalone) { onDone(); return }

    if (/iPhone|iPad|iPod/.test(ua)) {
      setPlatform('ios')
    } else if (/Android/.test(ua)) {
      setPlatform(deferredPrompt ? 'android-pwa' : 'android-manual')
    } else {
      // Desktop — skip (handled by parent via localStorage check)
      onDone()
      return
    }

    // Two-frame delay so the CSS transition is visible on first paint
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleInstall() {
    if (!deferredPrompt) return
    setInstalling(true)
    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') { handleDone(); return }
    } catch {}
    setInstalling(false)
  }

  function handleDone() {
    try { localStorage.setItem('mp26_install_shown', '1') } catch {}
    onDone()
  }

  if (!platform) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Install MatchPoint26"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/75 backdrop-blur-sm"
        style={{ transition: 'opacity 300ms ease', opacity: visible ? 1 : 0 }}
        onClick={handleDone}
      />

      {/* Bottom sheet card */}
      <div
        className="relative z-10 w-full max-w-sm mx-4 mb-6 rounded-3xl overflow-hidden bg-card"
        style={{
          border:     '1px solid rgba(255,255,255,0.08)',
          boxShadow:  '0 -8px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(240,168,12,0.06)',
          transition: 'transform 420ms cubic-bezier(0.32,0.72,0,1), opacity 300ms ease',
          transform:  visible ? 'translateY(0)' : 'translateY(48px)',
          opacity:    visible ? 1 : 0,
        }}
      >
        {/* Gold top accent line */}
        <div
          className="h-px w-full"
          style={{ background: 'linear-gradient(to right, transparent, rgba(240,168,12,0.6), transparent)' }}
        />

        <div className="px-6 pt-6 pb-7 flex flex-col items-center gap-5 text-center">

          {/* App icon with glow */}
          <div className="relative flex items-center justify-center mt-0.5">
            <div
              className="absolute pointer-events-none"
              style={{
                width:      130,
                height:     130,
                background: 'radial-gradient(ellipse at center, rgba(240,168,12,0.16) 0%, transparent 65%)',
              }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/apple-icon.png"
              alt="MatchPoint26"
              width={72}
              height={72}
              className="relative rounded-[22%]"
              style={{ filter: 'drop-shadow(0 3px 16px rgba(240,168,12,0.32))' }}
            />
          </div>

          {/* Copy */}
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[19px] font-black text-foreground leading-tight">
              Get the full MatchPoint26<br />experience
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-[260px] mx-auto">
              Add the app to your Home Screen for faster access during the World Cup.
            </p>
          </div>

          {/* Platform-specific instructions */}
          {platform === 'ios'            && <IOSSteps />}
          {platform === 'android-manual' && <AndroidSteps />}

          {/* CTA buttons */}
          <div className="w-full flex flex-col gap-2.5 mt-0.5">
            {platform === 'android-pwa' && (
              <button
                onClick={handleInstall}
                disabled={installing}
                className="w-full h-[52px] rounded-2xl bg-primary text-primary-foreground font-bold text-[15px]
                  flex items-center justify-center gap-2
                  shadow-lg shadow-primary/30 hover:opacity-90 active:scale-[0.98] transition-all
                  disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {installing ? 'Installing…' : 'Install App'}
              </button>
            )}
            <button
              onClick={handleDone}
              className="w-full h-12 rounded-2xl text-sm font-semibold text-muted-foreground/80
                border border-white/[0.08]
                hover:bg-white/[0.04] active:scale-[0.98] transition-all"
            >
              {platform === 'android-pwa' ? 'Continue to App' : "I'll add it later"}
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}

// ─── Instruction steps ────────────────────────────────────────────────────────

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-left w-full">
      <span
        className="size-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black bg-primary/[0.12] text-primary"
      >
        {n}
      </span>
      <span className="text-sm text-foreground/80 leading-snug flex-1">{children}</span>
    </div>
  )
}

function IOSSteps() {
  return (
    <div className="w-full flex flex-col gap-3 px-1">
      <Step n={1}>
        Tap the{' '}
        <ShareIcon className="mx-0.5 align-[-3px]" />{' '}
        <strong>Share</strong> button at the bottom of Safari
      </Step>
      <Step n={2}>
        Scroll and tap <strong>"Add to Home Screen"</strong>
      </Step>
    </div>
  )
}

function AndroidSteps() {
  return (
    <div className="w-full flex flex-col gap-3 px-1">
      <Step n={1}>
        Tap the{' '}
        <MenuDots className="mx-0.5 align-[-3px]" />{' '}
        <strong>menu</strong> in Chrome's address bar
      </Step>
      <Step n={2}>
        Tap <strong>"Add to Home screen"</strong> or{' '}
        <strong>"Install App"</strong>
      </Step>
    </div>
  )
}

// ─── Inline icons ─────────────────────────────────────────────────────────────

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg
      width="13" height="15"
      viewBox="0 0 13 15"
      fill="none"
      className={`inline-block${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    >
      <rect x="1.75" y="6" width="9.5" height="8.25" rx="1.75" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M6.5 0.75v8.5M4 3.25 6.5 .75l2.5 2.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MenuDots({ className }: { className?: string }) {
  return (
    <svg
      width="4" height="14"
      viewBox="0 0 4 14"
      fill="currentColor"
      className={`inline-block${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    >
      <circle cx="2" cy="2"  r="1.5" />
      <circle cx="2" cy="7"  r="1.5" />
      <circle cx="2" cy="12" r="1.5" />
    </svg>
  )
}
