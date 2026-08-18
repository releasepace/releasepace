import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { Sidebar } from './components/Sidebar'
import { LoginPage, SignupPage } from './pages/Auth'
import { FlagsPage } from './pages/Flags'
import { FlagDetailPage } from './pages/FlagDetail'
import { EnvironmentsPage, ApiKeysPage, AuditLogPage, SettingsPage } from './pages/OtherPages'
import { Spinner } from './components/ui'

function AuthGuard() {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><Spinner size={24} /></div>
  if (!user) return <Navigate to="/login" replace />
  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden flex">
        <Outlet />
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route element={<AuthGuard />}>
            <Route path="/" element={<Navigate to="/flags" replace />} />
            <Route path="/flags" element={<FlagsPage />} />
            <Route path="/flags/:id" element={<FlagDetailPage />} />
            <Route path="/environments" element={<EnvironmentsPage />} />
            <Route path="/keys" element={<ApiKeysPage />} />
            <Route path="/audit" element={<AuditLogPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
