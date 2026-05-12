import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { ToastStack } from './components/ui/Toast'
import { Spotlight } from './components/ui/Spotlight'
import { AuthProvider } from './features/auth/AuthProvider'
import { Dashboard }       from './pages/Dashboard'
import { ChartView }       from './pages/ChartView'
import { CanvasView }      from './pages/CanvasView'
import { RolesView }       from './pages/RolesView'
import { HeadcountView }   from './pages/HeadcountView'
import { SettingsView }    from './pages/SettingsView'
import { OnboardingPage }  from './pages/OnboardingPage'
import { SignInPage, SignUpPage } from './pages/SignInPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Auth routes — no sidebar layout */}
          <Route path="/sign-in"    element={<SignInPage />} />
          <Route path="/sign-up"    element={<SignUpPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />

          {/* App routes — with sidebar layout */}
          <Route element={<Layout />}>
            <Route path="/"           element={<Dashboard />} />
            <Route path="/charts"     element={<ChartView />} />
            <Route path="/charts/:id" element={<CanvasView />} />
            <Route path="/roles"      element={<RolesView />} />
            <Route path="/headcount"  element={<HeadcountView />} />
            <Route path="/settings"   element={<SettingsView />} />
          </Route>
        </Routes>
        <ToastStack />
        <Spotlight />
      </AuthProvider>
    </BrowserRouter>
  )
}
