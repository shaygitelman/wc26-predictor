import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// All match times are stored as UTC and displayed in Israel Standard / Daylight Time.
const IL_TZ = 'Asia/Jerusalem'

export function formatKickoffTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-GB', {
    timeZone: IL_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function formatMatchDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    timeZone: IL_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).toUpperCase()
}

/** Full date + time in Israel timezone, e.g. "Thu 11 Jun · 22:00" */
export function formatMatchDateTime(dateStr: string): string {
  const d = new Date(dateStr)
  const date = d.toLocaleDateString('en-GB', { timeZone: IL_TZ, weekday: 'short', day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString('en-GB', { timeZone: IL_TZ, hour: '2-digit', minute: '2-digit', hour12: false })
  return `${date} · ${time}`
}

export function getInitials(name: string): string {
  return name.slice(0, 2).toUpperCase()
}

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
  'bg-amber-500',  'bg-rose-500', 'bg-cyan-500',
]

export function getAvatarColor(username: string): string {
  return AVATAR_COLORS[username.charCodeAt(0) % AVATAR_COLORS.length]
}
