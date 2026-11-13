import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { ToastStack } from './components/ui/Toast'
import { Spotlight } from './components/ui/Spotlight'
import { CookieConsent } from './components/ui/CookieConsent'
import { AuthProvider } from './features/auth/AuthProvider'
import { PrivacyPage, TermsPage } from './pages/LegalPages'
import { LandingPage }     from './pages/LandingPage'
import { Dashboard }       from './pages/Dashboard'
import { ChartView }       from './pages/ChartView'
import { CanvasView }      from './pages/CanvasView'
import { RolesView }       from './pages/RolesView'
import { HeadcountView }   from './pages/HeadcountView'
import { SettingsView }    from './pages/SettingsView'
import { OnboardingPage }  from './pages/OnboardingPage'
import { SignInPage, SignUpPage } from './pages/SignInPage'
import { PricingRoute }    from './pages/PricingPage'
import { BillingSuccessPage } from './pages/BillingSuccessPage'
import { SharePage } from './pages/SharePage'
import { InvitePage } from './pages/InvitePage'
import { EmbedPage } from './pages/EmbedPage'
import { NotFoundPage } from './pages/NotFoundPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public share view — no auth, no layout */}
          <Route path="/share/:token" element={<SharePage />} />
          {/* Embeddable read-only chart: the one page allowed inside an iframe (vercel.json) */}
          <Route path="/embed/:code" element={<EmbedPage />} />

          {/* Public marketing + legal pages — no auth, no layout */}
          <Route path="/"        element={<LandingPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/pricing" element={<PricingRoute />} />
          <Route path="/terms"   element={<TermsPage />} />

          {/* Invite links from email — public; the page handles sign-in itself */}
          <Route path="/invite/:token" element={<InvitePage />} />

          {/* Auth routes — no sidebar layout */}
          {/* Clerk uses sub-routes like /sign-in/factor-one, so match with wildcard */}
          <Route path="/sign-in/*"   element={<SignInPage />} />
          <Route path="/sign-up/*"   element={<SignUpPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />

          {/* App routes — with sidebar layout */}
          <Route element={<Layout />}>
            <Route path="/dashboard"  element={<Dashboard />} />
            <Route path="/charts"     element={<ChartView />} />
            <Route path="/charts/:id" element={<CanvasView />} />
            <Route path="/roles"      element={<RolesView />} />
            <Route path="/headcount"  element={<HeadcountView />} />
            <Route path="/settings"   element={<SettingsView />} />
            <Route path="/billing/success" element={<BillingSuccessPage />} />
          </Route>

          {/* Anything else: a 404 page (public, see isKnownPath in AuthProvider) */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        <ToastStack />
        <Spotlight />
        <CookieConsent />
      </AuthProvider>
    </BrowserRouter>
  )
}
