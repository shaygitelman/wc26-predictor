'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function LiveRefresh({ active }: { active: boolean }) {
  const router = useRouter()

  // Fast poll (10s) while a match is live — keeps score/minute/period current.
  // Slow poll (30s) while no match is live — catches the scheduled → live transition.
  useEffect(() => {
    const interval = active ? 10_000 : 30_000
    const id = setInterval(() => router.refresh(), interval)
    return () => clearInterval(id)
  }, [active, router])

  return null
}
