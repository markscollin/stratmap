import { SignIn } from '@clerk/clerk-react'
import { IS_DEV_BYPASS } from '../features/auth/useAuth'
import { Navigate } from 'react-router-dom'

export function SignInPage() {
  if (IS_DEV_BYPASS) return <Navigate to="/" replace />

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 32,
    }}>
      <Logo />
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
    </div>
  )
}

export function SignUpPage() {
  if (IS_DEV_BYPASS) return <Navigate to="/" replace />

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 32,
    }}>
      <Logo />
      <SignIn routing="path" path="/sign-up" signInUrl="/sign-in" />
    </div>
  )
}

function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: 'var(--grad-brand)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 800, color: '#fff',
        boxShadow: '0 4px 14px var(--brand-glow)',
      }}>SM</div>
      <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-.4px' }}>StratMap</span>
    </div>
  )
}
