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
import { PricingPage }     from './pages/PricingPage'
import { BillingSuccessPage } from './pages/BillingSuccessPage'
import { SharePage } from './pages/SharePage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public share view — no auth, no layout */}
          <Route path="/share/:token" element={<SharePage />} />

          {/* Public marketing + legal pages — no auth, no layout */}
          <Route path="/"        element={<LandingPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms"   element={<TermsPage />} />

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
            <Route path="/pricing"    element={<PricingPage />} />
            <Route path="/billing/success" element={<BillingSuccessPage />} />
          </Route>
        </Routes>
        <ToastStack />
        <Spotlight />
        <CookieConsent />
      </AuthProvider>
    </BrowserRouter>
  )
}
