'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function LiveRefresh({ active }: { active: boolean }) {
  const router = useRouter()

  // Fast poll (30s) while a match is live — catches score updates and match end.
  // Slow poll (60s) while no match is live — catches the scheduled → live transition
  // so the Did You Know card disappears automatically at kickoff.
  useEffect(() => {
    const interval = active ? 30_000 : 60_000
    const id = setInterval(() => router.refresh(), interval)
    return () => clearInterval(id)
  }, [active, router])

  return null
}
