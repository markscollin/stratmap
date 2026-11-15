import { lazy, Suspense } from 'react'
import type { ComponentType } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ToastStack } from './components/ui/Toast'
import { Spotlight } from './components/ui/Spotlight'
import { CookieConsent } from './components/ui/CookieConsent'
import { AuthProvider } from './features/auth/AuthProvider'
import { PageFallback } from './components/ui/PageFallback'

// Every page is its own download (R-24): a visitor to the landing page, a share link or an embed no longer fetches the canvas,
// the rich-text editor or the settings screens. Pages are named exports, hence the small adapter.
function page<T extends Record<string, unknown>>(load: () => Promise<T>, name: keyof T) {
  return lazy(() => load().then(m => ({ default: m[name] as ComponentType })))
}
const Layout             = page(() => import('./components/layout/Layout'), 'Layout')
const PrivacyPage        = page(() => import('./pages/LegalPages'), 'PrivacyPage')
const TermsPage          = page(() => import('./pages/LegalPages'), 'TermsPage')
const LandingPage        = page(() => import('./pages/LandingPage'), 'LandingPage')
const Dashboard          = page(() => import('./pages/Dashboard'), 'Dashboard')
const ChartView          = page(() => import('./pages/ChartView'), 'ChartView')
const CanvasView         = page(() => import('./pages/CanvasView'), 'CanvasView')
const RolesView          = page(() => import('./pages/RolesView'), 'RolesView')
const HeadcountView      = page(() => import('./pages/HeadcountView'), 'HeadcountView')
const SettingsView       = page(() => import('./pages/SettingsView'), 'SettingsView')
const OnboardingPage     = page(() => import('./pages/OnboardingPage'), 'OnboardingPage')
const SignInPage         = page(() => import('./pages/SignInPage'), 'SignInPage')
const SignUpPage         = page(() => import('./pages/SignInPage'), 'SignUpPage')
const PricingRoute       = page(() => import('./pages/PricingPage'), 'PricingRoute')
const BillingSuccessPage = page(() => import('./pages/BillingSuccessPage'), 'BillingSuccessPage')
const SharePage          = page(() => import('./pages/SharePage'), 'SharePage')
const InvitePage         = page(() => import('./pages/InvitePage'), 'InvitePage')
const EmbedPage          = page(() => import('./pages/EmbedPage'), 'EmbedPage')
const NotFoundPage       = page(() => import('./pages/NotFoundPage'), 'NotFoundPage')

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<PageFallback />}>
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
        </Suspense>
        <ToastStack />
        <Spotlight />
        <CookieConsent />
      </AuthProvider>
    </BrowserRouter>
  )
}
