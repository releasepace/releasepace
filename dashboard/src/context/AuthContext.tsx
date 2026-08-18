import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, setToken, getToken } from '../lib/api'

interface AuthCtx {
  user: User | null
  token: string | null
  login: (token: string, user: User) => void
  logout: () => void
  loading: boolean
}

const Ctx = createContext<AuthCtx>({
  user: null, token: null,
  login: () => {}, logout: () => {}, loading: true,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setTok] = useState<string | null>(getToken())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Restore session from localStorage
    const t = getToken()
    const u = localStorage.getItem('rp_user')
    if (t && u) {
      setTok(t)
      setUser(JSON.parse(u))
    }
    setLoading(false)
  }, [])

  function login(t: string, u: User) {
    setToken(t)
    setTok(t)
    setUser(u)
    localStorage.setItem('rp_user', JSON.stringify(u))
  }

  function logout() {
    setToken(null)
    setTok(null)
    setUser(null)
    localStorage.removeItem('rp_user')
  }

  return <Ctx.Provider value={{ user, token, login, logout, loading }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
