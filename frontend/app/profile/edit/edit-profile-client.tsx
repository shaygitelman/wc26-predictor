'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { UserAvatar } from '@/components/atoms/user-avatar'
import { AVATARS } from '@/lib/avatars'
import type { User } from '@/types/user'

const MAX_BIO      = 80
const MAX_USERNAME = 30

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

function validateUsername(v: string): string {
  const t = v.trim()
  if (!t)            return 'Username is required'
  if (t.length < 2)  return 'At least 2 characters required'
  if (!/^[a-zA-Z0-9_.]+$/.test(t)) return 'Letters, numbers, dots, and underscores only'
  return ''
}

export function EditProfileClient({ user }: { user: User }) {
  const router = useRouter()

  const initAvatar   = user.avatarId  ?? ''
  const initUsername = user.username  ?? ''
  const initBio      = user.bio       ?? ''

  const [selectedAvatar,  setSelectedAvatar]  = useState(initAvatar)
  const [clearAvatarUrl,  setClearAvatarUrl]  = useState(false)
  const [username,        setUsername]        = useState(initUsername)
  const [bio,             setBio]             = useState(initBio)

  const [saveStatus,   setSaveStatus]   = useState<SaveStatus>('idle')
  const [saveError,    setSaveError]    = useState('')
  const [showDiscard,  setShowDiscard]  = useState(false)

  const isDirty = selectedAvatar !== initAvatar ||
                  clearAvatarUrl ||
                  username.trim() !== initUsername ||
                  bio.trim() !== initBio

  const usernameError     = validateUsername(username)
  const showUsernameError = !!usernameError && username !== initUsername

  const hasActiveAvatarUrl = !!(user.avatarUrl && !clearAvatarUrl)
  const canReset           = selectedAvatar !== '' || hasActiveAvatarUrl

  const handleBack = () => {
    if (isDirty) setShowDiscard(true)
    else router.push('/profile')
  }

  const handleResetAvatar = () => {
    setSelectedAvatar('')
    setClearAvatarUrl(true)
  }

  const handleSave = async () => {
    if (!isDirty || usernameError || saveStatus === 'saving' || saveStatus === 'saved') return
    setSaveStatus('saving'); setSaveError('')
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username:      username.trim(),
          bio:           bio.trim() || null,
          avatarId:      selectedAvatar || null,
          clearAvatarUrl,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (res.status === 422 && Array.isArray(data?.detail)) {
          const msg = data.detail[0]?.msg ?? 'Invalid input'
          throw new Error(msg.replace(/^Value error, /, ''))
        }
        throw new Error(data?.detail ?? data?.error ?? `Save failed (${res.status})`)
      }

      setSaveStatus('saved')
      // Brief delay so the "Saved!" button state is visible, then hard-navigate
      // so the profile page loads fresh from the server. router.refresh() +
      // router.push() together cause a concurrent-startTransition crash.
      setTimeout(() => { window.location.href = '/profile' }, 400)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      console.error('[EditProfile] save failed:', msg)
      setSaveError(msg)
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }

  return (
    <>
      <div className="flex flex-col min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
        <EditHeader onBack={handleBack} isDirty={isDirty} />

        <div className="flex flex-col gap-5 p-4">

          {/* ── Avatar preview ── */}
          <div className="flex flex-col items-center gap-2 pt-3 pb-1">
            <UserAvatar
              username={user.username ?? '?'}
              avatarId={selectedAvatar || undefined}
              avatarUrl={selectedAvatar ? undefined : (clearAvatarUrl ? undefined : user.avatarUrl)}
              size="xl"
            />
            <p className="text-xs text-muted-foreground">
              {selectedAvatar
                ? 'Avatar selected'
                : clearAvatarUrl
                  ? 'Default — showing initials'
                  : user.avatarUrl
                    ? 'Using profile photo'
                    : 'Choose an avatar below'}
            </p>
          </div>

          {/* ── Avatar picker ── */}
          <section>
            <SectionLabel>Avatar</SectionLabel>
            <div className="bg-card rounded-2xl border border-border p-4">
              <div className="grid grid-cols-4 gap-3">
                {AVATARS.map(av => {
                  const isSelected = selectedAvatar === av.id
                  return (
                    <button
                      key={av.id}
                      onClick={() => setSelectedAvatar(isSelected ? '' : av.id)}
                      aria-label={av.label}
                      title={av.label}
                      className={cn(
                        'relative size-[60px] rounded-full flex items-center justify-center mx-auto',
                        'transition-all duration-150 focus:outline-none',
                        isSelected
                          ? 'scale-110 ring-2 ring-primary ring-offset-2 ring-offset-background shadow-primary-glow'
                          : 'opacity-70 hover:opacity-100 hover:scale-105 active:scale-[0.97]',
                      )}
                      style={{ background: av.gradient }}
                    >
                      <span style={{ fontSize: 24, lineHeight: 1 }}>{av.emoji}</span>
                      {isSelected && (
                        <span className="absolute -bottom-0.5 -right-0.5 size-[18px] rounded-full bg-primary flex items-center justify-center shadow-sm">
                          <Check className="size-2.5 text-white" strokeWidth={3.5} />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {canReset && (
                <button
                  onClick={handleResetAvatar}
                  className="mt-4 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-destructive/70 hover:text-destructive hover:bg-destructive/8 transition-colors"
                >
                  <RotateCcw className="size-3.5" />
                  Reset to Default Avatar
                </button>
              )}
            </div>
          </section>

          {/* ── Profile info ── */}
          <section>
            <SectionLabel>Profile Info</SectionLabel>
            <div className="flex flex-col gap-3">

              {/* Username */}
              <div className="bg-card rounded-2xl border border-border px-4 py-4">
                <label className="text-xs font-semibold text-muted-foreground block mb-2">
                  Username
                </label>
                <div className="relative">
                  <input
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Your username"
                    maxLength={MAX_USERNAME}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className={cn(
                      'w-full bg-surface-elevated rounded-xl px-4 py-3 pr-14',
                      'text-[15px] text-foreground placeholder:text-muted-foreground',
                      'border focus:outline-none transition-colors',
                      showUsernameError
                        ? 'border-status-lost focus:border-status-lost'
                        : 'border-border focus:border-primary',
                    )}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-2xs text-muted-foreground tabular pointer-events-none">
                    {username.length}/{MAX_USERNAME}
                  </span>
                </div>
                {showUsernameError && (
                  <p className="text-xs text-status-lost mt-1.5">{usernameError}</p>
                )}
              </div>

              {/* Bio */}
              <div className="bg-card rounded-2xl border border-border px-4 py-4">
                <label className="text-xs font-semibold text-muted-foreground block mb-2">
                  Bio
                  <span className="font-normal opacity-50 ml-1">— optional</span>
                </label>
                <div className="relative">
                  <textarea
                    value={bio}
                    onChange={e => setBio(e.target.value.slice(0, MAX_BIO))}
                    placeholder={`e.g. "Predicting every upset."`}
                    rows={3}
                    className={cn(
                      'w-full bg-surface-elevated rounded-xl px-4 py-3',
                      'text-[15px] text-foreground placeholder:text-muted-foreground',
                      'border border-border focus:border-primary focus:outline-none',
                      'resize-none leading-relaxed transition-colors',
                    )}
                  />
                  <span className={cn(
                    'absolute right-3 bottom-3 text-2xs tabular font-medium pointer-events-none',
                    bio.length >= MAX_BIO
                      ? 'text-status-lost'
                      : bio.length > MAX_BIO * 0.75
                        ? 'text-status-partial'
                        : 'text-muted-foreground',
                  )}>
                    {bio.length}/{MAX_BIO}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* ── Actions ── */}
          <section className="flex flex-col gap-3 pt-1">
            {saveError && (
              <p className="text-xs text-status-lost text-center animate-fade-in">{saveError}</p>
            )}

            <button
              onClick={handleSave}
              disabled={
                !isDirty || showUsernameError ||
                saveStatus === 'saving' || saveStatus === 'saved'
              }
              className={cn(
                'w-full flex items-center justify-center gap-2 py-4 rounded-2xl',
                'text-[15px] font-bold transition-all duration-200',
                saveStatus === 'saved'
                  ? 'bg-status-won text-white'
                  : saveStatus === 'error'
                    ? 'bg-status-lost/90 text-white'
                    : !isDirty || showUsernameError
                      ? 'bg-surface-elevated text-muted-foreground cursor-not-allowed'
                      : 'bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98]',
                saveStatus === 'saving' && 'opacity-70 cursor-wait',
              )}
            >
              {saveStatus === 'saved'  ? <><Check className="size-4" strokeWidth={3} />Saved!</>
             : saveStatus === 'saving' ? 'Saving…'
             : saveStatus === 'error'  ? 'Try Again'
             : 'Save Changes'}
            </button>

            <button
              onClick={handleBack}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors py-2 text-center"
            >
              Cancel
            </button>
          </section>

        </div>
      </div>

      {/* ── Discard sheet ── */}
      {showDiscard && (
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-[55] animate-fade-in"
            onClick={() => setShowDiscard(false)}
          />
          <div className="fixed left-0 right-0 bottom-0 z-[60] bg-card border-t border-border rounded-t-[28px] pb-safe animate-slide-up">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-9 h-1 rounded-full bg-border" />
            </div>
            <div className="px-6 pt-4 pb-6">
              <p className="text-base font-bold text-foreground mb-1">Discard changes?</p>
              <p className="text-sm text-muted-foreground mb-6">
                Your unsaved edits will be lost.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => router.push('/profile')}
                  className="w-full py-3.5 rounded-xl bg-status-lost text-white font-bold text-[15px] active:scale-[0.98] transition-transform"
                >
                  Discard
                </button>
                <button
                  onClick={() => setShowDiscard(false)}
                  className="w-full py-3.5 rounded-xl bg-surface-elevated text-foreground font-bold text-[15px] active:scale-[0.98] transition-transform"
                >
                  Keep Editing
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}

function EditHeader({ onBack, isDirty }: { onBack: () => void; isDirty: boolean }) {
  return (
    <header className="sticky top-0 z-40 flex items-center h-14 px-4 gap-3 bg-surface/90 backdrop-blur-md border-b border-border/80">
      <button
        onClick={onBack}
        className="flex items-center justify-center size-9 -ml-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label="Back"
      >
        <ArrowLeft className="size-5" />
      </button>
      <h1 className="flex-1 font-bold text-[17px] text-foreground">Edit Profile</h1>
      {isDirty && (
        <span className="text-2xs font-semibold text-status-partial animate-fade-in">
          Unsaved
        </span>
      )}
    </header>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-2xs font-bold tracking-[0.12em] uppercase text-muted-foreground mb-3 px-0.5">
      {children}
    </p>
  )
}
