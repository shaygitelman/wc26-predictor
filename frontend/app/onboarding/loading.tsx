import { ChevronRight } from 'lucide-react'

export default function OnboardingLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-8 text-center gap-8">

      {/* App icon — mirrors WelcomeStep layout */}
      <div className="relative flex items-center justify-center">
        <div
          className="absolute pointer-events-none"
          style={{
            width: 190, height: 190,
            background: 'radial-gradient(ellipse at center, rgba(240,168,12,0.2) 0%, transparent 65%)',
          }}
          aria-hidden="true"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/apple-icon.png"
          alt="MatchPoint26"
          width={96}
          height={96}
          className="relative rounded-[22%]"
          style={{ filter: 'drop-shadow(0 4px 24px rgba(240,168,12,0.38))' }}
        />
      </div>

      {/* Title block */}
      <div className="flex flex-col gap-3">
        <p className="text-xs font-black tracking-[0.3em] uppercase text-primary/70">
          FIFA World Cup 2026
        </p>
        <h1 className="text-4xl font-black text-foreground leading-tight">
          Your tournament<br />starts here
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
          Before you start predicting matches, tell us who you think will go all the way.
        </p>
      </div>

      {/* CTA skeleton — matches button dimensions, shows loading state */}
      <div className="w-full max-w-xs">
        <button
          disabled
          className="w-full h-14 rounded-2xl bg-primary text-primary-foreground text-[15px] font-black
            flex items-center justify-center gap-2
            shadow-lg shadow-primary/30 opacity-70 cursor-not-allowed"
        >
          <span className="size-4 rounded-full border-2 border-primary-foreground/70 border-t-transparent animate-spin" />
          Just a moment…
        </button>
        <p className="text-2xs text-muted-foreground/50 mt-3">2 quick picks · takes under a minute</p>
      </div>

    </div>
  )
}
