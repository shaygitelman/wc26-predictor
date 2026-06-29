'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function LiveRefresh({ active }: { active: boolean }) {
  const router = useRouter()

  // Fast poll (15s) while a match is live — keeps score/minute/period current.
  // Slow poll (45s) while no match is live — catches the scheduled → live transition.
  useEffect(() => {
    const interval = active ? 15_000 : 45_000
    const id = setInterval(() => router.refresh(), interval)
    return () => clearInterval(id)
  }, [active, router])

  return null
}
