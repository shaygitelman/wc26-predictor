'use client'

import { usePathname } from 'next/navigation'
import { BottomTabBar } from './bottom-tab-bar'
import { AUTH_ROUTES } from '@/lib/constants'

export function ConditionalTabBar() {
  const pathname = usePathname()
  const isAuthRoute = AUTH_ROUTES.some(route => pathname.startsWith(route))

  if (isAuthRoute) return null
  return <BottomTabBar />
}
