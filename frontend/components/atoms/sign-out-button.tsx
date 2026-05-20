'use client'

import { useState } from 'react'
import { useAuth } from '@/providers/auth-provider'

export function SignOutButton() {
  const { logout } = useAuth()
  const [pending, setPending] = useState(false)

  async function handleLogout() {
    setPending(true)
    await logout()
  }

  return (
    <button
      onClick={handleLogout}
      disabled={pending}
      className="w-full flex items-center px-4 py-3.5 hover:bg-surface-elevated transition-colors text-left disabled:opacity-50"
    >
      <span className="text-[15px] font-medium text-status-lost">
        {pending ? 'Signing out…' : 'Sign Out'}
      </span>
    </button>
  )
}
