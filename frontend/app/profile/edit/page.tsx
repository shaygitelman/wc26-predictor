import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { SESSION_COOKIE } from '@/lib/session'
import { apiGet } from '@/lib/api-server'
import { EditProfileClient } from './edit-profile-client'
import type { User } from '@/types/user'

export default async function EditProfilePage() {
  const store = await cookies()
  if (!store.get(SESSION_COOKIE)?.value) redirect('/login')

  const user = await apiGet<User>('/users/me').catch(() => null)
  if (!user) redirect('/login')

  return <EditProfileClient user={user} />
}
