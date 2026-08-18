import { useState, FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const data = await auth.login(email, password)
      login(data.access_token, data.user)
      navigate('/flags')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Sign in" sub="to your ReleasePace workspace">
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
          <Link to="/signup" className="text-violet-400 hover:text-violet-300">Create one →</Link>
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
  const { login } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const data = await auth.signup(email, password, orgName)
      login(data.access_token, data.user)
      navigate('/flags')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Create your workspace" sub="Start managing feature flags in minutes">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label required>Organisation name</Label>
          <Input placeholder="Acme Corp" value={orgName} onChange={e => setOrgName(e.target.value)} required />
        </div>
        <div>
          <Label required>Work email</Label>
          <Input type="email" placeholder="you@acme.com" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div>
          <Label required>Password</Label>
          <Input type="password" placeholder="At least 8 characters" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required />
        </div>
        <ErrorMsg message={error} />
        <Button type="submit" loading={loading} className="w-full justify-center">Create workspace</Button>
        <p className="text-center text-xs text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="text-violet-400 hover:text-violet-300">Sign in →</Link>
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
