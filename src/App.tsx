import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { Dashboard }     from './pages/Dashboard'
import { ChartView }     from './pages/ChartView'
import { CanvasView }    from './pages/CanvasView'
import { RolesView }     from './pages/RolesView'
import { HeadcountView } from './pages/HeadcountView'
import { SettingsView }  from './pages/SettingsView'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/"           element={<Dashboard />} />
          <Route path="/charts"     element={<ChartView />} />
          <Route path="/charts/:id" element={<CanvasView />} />
          <Route path="/roles"      element={<RolesView />} />
          <Route path="/headcount"  element={<HeadcountView />} />
          <Route path="/settings"   element={<SettingsView />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
