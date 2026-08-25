import { useState, useEffect, useRef, FormEvent } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Zap } from 'lucide-react'
import { auth } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { Input, Label, Button, ErrorMsg } from '../components/ui'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const returnTo = params.get('returnTo') || '/flags'

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const data = await auth.login(email, password)
      login(data.access_token, data.user)
      navigate(returnTo)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Sign in"
      sub={returnTo.includes('accept-invite')
        ? "Sign in to accept your team invite"
        : "to your ReleasePace workspace"}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label required>Email</Label>
          <Input type="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div>
          <Label required>Password</Label>
          <Input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        <ErrorMsg message={error} />
        <Button type="submit" loading={loading} className="w-full justify-center">Sign in</Button>
        <p className="text-center text-xs text-slate-500">
          No account?{' '}
          <Link
            to={returnTo !== '/flags' ? `/signup?returnTo=${encodeURIComponent(returnTo)}` : '/signup'}
            className="text-violet-400 hover:text-violet-300"
          >Create one →</Link>
        </p>
      </form>
    </AuthShell>
  )
}

export function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [orgName, setOrgName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [similarOrgs, setSimilarOrgs] = useState<string[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const returnTo = params.get('returnTo') || '/flags'

  const isInviteFlow = returnTo.includes('accept-invite')

  // Debounced similarity check — skip entirely in invite flow since the
  // org name field is hidden and the user isn't creating a new org.
  useEffect(() => {
    setSimilarOrgs([])
    if (isInviteFlow || orgName.trim().length < 3) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await auth.checkOrg(orgName.trim())
        setSimilarOrgs(r.matches)
      } catch { /* non-critical */ }
    }, 500)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [orgName])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const data = await auth.signup(email, password, isInviteFlow ? undefined : orgName)
      login(data.access_token, data.user)
      navigate(returnTo)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title={returnTo.includes('accept-invite') ? "Create your account" : "Create your workspace"}
      sub={returnTo.includes('accept-invite')
        ? "Create an account to accept your team invite"
        : "Start managing feature flags in minutes"}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {!returnTo.includes('accept-invite') && (
          <div>
            <Label required>Organisation name</Label>
            <Input placeholder="Acme Corp" value={orgName} onChange={e => setOrgName(e.target.value)} required />
            {similarOrgs.length > 0 && (
              <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
                <p className="text-xs font-medium text-amber-300 mb-1">
                  {similarOrgs.length === 1
                    ? 'A workspace with a similar name already exists:'
                    : 'Workspaces with similar names already exist:'}
                </p>
                <ul className="space-y-0.5 mb-2">
                  {similarOrgs.map(name => (
                    <li key={name} className="text-xs text-amber-200/70 font-medium">{name}</li>
                  ))}
                </ul>
                <p className="text-[11px] text-amber-300/60">
                  If your team is already on ReleasePace, ask an admin to invite you
                  instead of creating a new workspace. Duplicate workspaces can't be merged later.
                </p>
              </div>
            )}
          </div>
        )}
        <div>
          <Label required>Work email</Label>
          <Input type="email" placeholder="you@acme.com" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div>
          <Label required>Password</Label>
          <Input type="password" placeholder="At least 8 characters" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required />
        </div>
        <ErrorMsg message={error} />
        <Button type="submit" loading={loading} className="w-full justify-center">
          {returnTo.includes('accept-invite') ? 'Create account' : 'Create workspace'}
        </Button>
        <p className="text-center text-xs text-slate-500">
          Already have an account?{' '}
          <Link
            to={returnTo !== '/flags' ? `/login?returnTo=${encodeURIComponent(returnTo)}` : '/login'}
            className="text-violet-400 hover:text-violet-300"
          >Sign in →</Link>
        </p>
      </form>
    </AuthShell>
  )
}


function AuthShell({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center">
            <Zap size={16} className="text-white" />
          </div>
          <span className="text-base font-semibold text-white tracking-tight">ReleasePace</span>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
          <h1 className="text-lg font-semibold text-white mb-1">{title}</h1>
          <p className="text-xs text-slate-500 mb-6">{sub}</p>
          {children}
        </div>
      </div>
    </div>
  )
}
