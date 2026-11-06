import { useNavigate } from 'react-router-dom'
import { useClerk } from '@clerk/clerk-react'
import { IS_DEV_BYPASS } from './useAuth'
import { useUserStore } from '../../store/userStore'

/**
 * Signs the person out: clears the app's own state, then ends the Clerk session (or, in dev-bypass, goes to /sign-in).
 * IS_DEV_BYPASS is a module-level build constant, so the hook order is stable across renders. We can't call
 * useClerk() unconditionally because it throws when no ClerkProvider is mounted (dev-bypass renders DevBypassProvider).
 */
export function useSignOut(): (redirectUrl?: string) => Promise<void> {
  const navigate = useNavigate()
  const { signOut: storeSignOut } = useUserStore()
  let clerkSignOut: ((redirectUrl: string) => Promise<void>) | undefined
  if (!IS_DEV_BYPASS) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const clerk = useClerk()
    clerkSignOut = (redirectUrl) => clerk.signOut({ redirectUrl })
  }
  return async (redirectUrl = '/sign-in') => {
    storeSignOut()
    if (clerkSignOut) await clerkSignOut(redirectUrl)
    else navigate(redirectUrl)
  }
}
