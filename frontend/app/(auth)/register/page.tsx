import { redirect } from 'next/navigation'

// Registration is handled automatically via Google Sign-In.
// New users are created on first login — no separate register flow needed.
export default function RegisterPage() {
  redirect('/login')
}
