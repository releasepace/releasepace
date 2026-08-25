import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, me as meApi, setToken, getToken, setActiveOrg } from '../lib/api'

export type UserRole = 'owner' | 'admin' | 'editor' | 'viewer'

interface AuthCtx {
  user: User | null
  role: UserRole | null
  token: string | null
  login: (token: string, user: User) => void
  logout: () => void
  loading: boolean
  /** True when the user can create/edit/delete — owner, admin, or editor. */
  canWrite: boolean
  /** True when the user can manage members and environments — owner or admin. */
  canAdmin: boolean
  /** True when the user is the org owner. */
  isOwner: boolean
}

const Ctx = createContext<AuthCtx>({
  user: null, role: null, token: null,
  login: () => {}, logout: () => {}, loading: true,
  canWrite: false, canAdmin: false, isOwner: false,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]   = useState<User | null>(null)
  const [role, setRole]   = useState<UserRole | null>(null)
  const [token, setTok]   = useState<string | null>(getToken())
  const [loading, setLoading] = useState(true)

  // Fetch the current user's role from the API whenever the token changes.
  // Stored in sessionStorage so it survives a page refresh without a
  // second API call, but is cleared on logout or org switch.
  useEffect(() => {
    const t = getToken()
    const u = localStorage.getItem('rp_user')
    if (t && u) {
      setTok(t)
      setUser(JSON.parse(u))
      const cachedRole = sessionStorage.getItem('rp_role') as UserRole | null
      if (cachedRole) setRole(cachedRole)

      const refreshRole = () => {
        if (!getToken()) return
        meApi.get()
          .then(r => { setRole(r.role as UserRole); sessionStorage.setItem('rp_role', r.role) })
          .catch(() => {})
      }

      refreshRole()
      setLoading(false)
      window.addEventListener('focus', refreshRole)
      return () => window.removeEventListener('focus', refreshRole)
    } else {
      setLoading(false)
    }
  }, [])

  function login(t: string, u: User) {
    setToken(t)
    setTok(t)
    setUser(u)
    localStorage.setItem('rp_user', JSON.stringify(u))
    sessionStorage.removeItem('rp_role')
    // Fetch role immediately after login
    meApi.get()
      .then(r => { setRole(r.role as UserRole); sessionStorage.setItem('rp_role', r.role) })
      .catch(() => setRole('viewer'))
  }

  function logout() {
    setToken(null)
    setActiveOrg(null)
    setTok(null)
    setUser(null)
    setRole(null)
    localStorage.removeItem('rp_user')
    sessionStorage.removeItem('rp_role')
  }

  const canWrite = role !== null && ['owner', 'admin', 'editor'].includes(role)
  const canAdmin = role !== null && ['owner', 'admin'].includes(role)
  const isOwner  = role === 'owner'

  return (
    <Ctx.Provider value={{ user, role, token, login, logout, loading, canWrite, canAdmin, isOwner }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)

/** Convenience hook — returns the three permission flags and the raw role. */
export function useRole() {
  const { role, canWrite, canAdmin, isOwner } = useAuth()
  return { role, canWrite, canAdmin, isOwner }
}
