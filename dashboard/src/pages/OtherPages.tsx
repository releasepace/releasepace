import { useEffect, useState } from 'react'
import { Plus, Trash2, Copy, Check, Eye, EyeOff, Globe, Key, ScrollText, Settings as SettingsIcon } from 'lucide-react'
import { environments as envApi, apiKeys as keysApi, audit as auditApi, Environment, ApiKey, AuditEntry } from '../lib/api'
import { Button, Badge, Input, Select, Label, FormGroup, ErrorMsg, Modal, Empty, Spinner, Card, ColorDot } from '../components/ui'
import { formatDistanceToNow, format } from 'date-fns'
import { useAuth } from '../context/AuthContext'

// ── Environments ──────────────────────────────────────────────
export function EnvironmentsPage() {
  const [envList, setEnvList] = useState<Environment[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState(''); const [slug, setSlug] = useState(''); const [color, setColor] = useState('#6366f1')
  const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try { setEnvList(await envApi.list()) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  function handleNameChange(v: string) {
    setName(v)
    setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
  }

  async function handleCreate() {
    if (!name || !slug) { setError('Name and slug required'); return }
    setSaving(true); setError(null)
    try {
      await envApi.create({ name, slug, color })
      setName(''); setSlug(''); setColor('#6366f1')
      setShowCreate(false); load()
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete environment "${name}"? This cannot be undone.`)) return
    try { await envApi.delete(id); load() } catch (e: any) { alert(e.message) }
  }

  const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6']

  return (
    <PageShell
      title="Environments"
      sub="Manage deployment environments — dev, staging, production."
      icon={<Globe size={16} />}
      action={<Button icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>New environment</Button>}
    >
      {loading ? <div className="flex justify-center py-20"><Spinner size={24} /></div> : (
        <div className="space-y-2">
          {envList.map(env => (
            <Card key={env.id} className="px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: env.color + '20' }}>
                  <ColorDot color={env.color} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-100">{env.name}</span>
                    {env.protected && <Badge variant="amber">protected</Badge>}
                  </div>
                  <code className="text-xs text-slate-500">{env.slug}</code>
                </div>
              </div>
              {!env.protected && (
                <Button variant="danger" size="sm" icon={<Trash2 size={12} />}
                  onClick={() => handleDelete(env.id, env.name)}>Delete</Button>
              )}
            </Card>
          ))}
          {envList.length === 0 && <Empty icon={<Globe size={36} />} title="No environments" description="Create environments to manage flag states separately." />}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New environment">
        <div className="space-y-4">
          <FormGroup><Label required>Name</Label><Input placeholder="QA" value={name} onChange={e => handleNameChange(e.target.value)} /></FormGroup>
          <FormGroup><Label required>Slug</Label><Input placeholder="qa" value={slug} onChange={e => setSlug(e.target.value)} className="font-mono" /></FormGroup>
          <FormGroup>
            <Label>Color</Label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-lg transition-all ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-110' : ''}`}
                  style={{ background: c }} />
              ))}
            </div>
          </FormGroup>
          <ErrorMsg message={error} />
          <div className="flex gap-3 pt-1">
            <Button onClick={handleCreate} loading={saving} className="flex-1 justify-center">Create</Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </PageShell>
  )
}

// ── API Keys ──────────────────────────────────────────────────
export function ApiKeysPage() {
  const [keyList, setKeyList] = useState<ApiKey[]>([])
  const [envList, setEnvList] = useState<Environment[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'client', environment_id: '' })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [k, e] = await Promise.all([keysApi.list(), import('../lib/api').then(m => m.environments.list())])
      setKeyList(k); setEnvList(e)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function handleCreate() {
    if (!form.name) { setError('Name required'); return }
    setSaving(true); setError(null)
    try {
      const data = await keysApi.create({ name: form.name, type: form.type, environment_id: form.environment_id || undefined })
      setNewKey(data.raw_key)
      setForm({ name: '', type: 'client', environment_id: '' })
      load()
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  function copyKey(k: string) {
    navigator.clipboard.writeText(k)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleDelete(id: string) {
    if (!confirm('Revoke this API key? Any apps using it will immediately lose access.')) return
    await keysApi.delete(id); load()
  }

  const typeColors: Record<string, 'violet' | 'blue' | 'amber'> = { client: 'violet', server: 'blue', admin: 'amber' }

  return (
    <PageShell
      title="API Keys"
      sub="Keys are hashed before storage. The raw key is shown once at creation."
      icon={<Key size={16} />}
      action={<Button icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>New key</Button>}
    >
      {/* Newly created key banner */}
      {newKey && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-5 py-4 mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-emerald-300 mb-1">Key created — copy it now, it won't be shown again</p>
            <code className="text-sm text-emerald-200 font-mono break-all">{newKey}</code>
          </div>
          <Button size="sm" variant="outline" icon={copied ? <Check size={13} /> : <Copy size={13} />}
            onClick={() => copyKey(newKey)}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      )}

      {loading ? <div className="flex justify-center py-20"><Spinner size={24} /></div> : (
        <div className="space-y-2">
          {keyList.map(key => (
            <Card key={key.id} className="px-5 py-4 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-slate-100">{key.name}</span>
                  <Badge variant={typeColors[key.type] || 'slate'}>{key.type}</Badge>
                  {key.environments && <Badge variant="slate">{key.environments.slug}</Badge>}
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <code className="font-mono">{key.key_prefix}</code>
                  {key.last_used_at
                    ? <span>Last used {formatDistanceToNow(new Date(key.last_used_at), { addSuffix: true })}</span>
                    : <span className="text-slate-600">Never used</span>}
                  {key.expires_at && <span>Expires {format(new Date(key.expires_at), 'MMM d, yyyy')}</span>}
                </div>
              </div>
              <Button variant="danger" size="sm" icon={<Trash2 size={12} />}
                onClick={() => handleDelete(key.id)}>Revoke</Button>
            </Card>
          ))}
          {keyList.length === 0 && <Empty icon={<Key size={36} />} title="No API keys" description="Create a key to connect your SDKs." />}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create API key">
        <div className="space-y-4">
          <FormGroup><Label required>Name</Label><Input placeholder="Production client key" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></FormGroup>
          <FormGroup>
            <Label>Type</Label>
            <Select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              <option value="client">Client — for browser/mobile SDKs</option>
              <option value="server">Server — for backend SDKs</option>
              <option value="admin">Admin — for management API</option>
            </Select>
          </FormGroup>
          <FormGroup>
            <Label>Environment (optional)</Label>
            <Select value={form.environment_id} onChange={e => setForm(f => ({ ...f, environment_id: e.target.value }))}>
              <option value="">All environments</option>
              {envList.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </FormGroup>
          <ErrorMsg message={error} />
          <div className="flex gap-3 pt-1">
            <Button onClick={handleCreate} loading={saving} className="flex-1 justify-center">Generate key</Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </PageShell>
  )
}

// ── Audit Log ─────────────────────────────────────────────────
export function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  async function load(p = 1) {
    setLoading(true)
    try {
      const data = await auditApi.list({ page: p })
      setEntries(data.entries); setTotal(data.total)
    } finally { setLoading(false) }
  }
  useEffect(() => { load(page) }, [page])

  const actionColor: Record<string, string> = {
    'flag.created': 'text-emerald-400', 'flag.updated': 'text-blue-400',
    'flag.archived': 'text-red-400', 'flag.state.updated': 'text-violet-400',
  }

  return (
    <PageShell title="Audit Log" sub="Every change to your flags, who made it, and when." icon={<ScrollText size={16} />}>
      {loading ? <div className="flex justify-center py-20"><Spinner size={24} /></div> : (
        <Card>
          <div className="divide-y divide-slate-800">
            {entries.length === 0 && <p className="p-8 text-center text-xs text-slate-600">No audit events yet.</p>}
            {entries.map(entry => (
              <div key={entry.id} className="px-5 py-3.5 flex items-start gap-4 hover:bg-white/2 transition-colors">
                <div className={`text-xs font-mono font-medium shrink-0 w-40 ${actionColor[entry.action] || 'text-slate-400'}`}>
                  {entry.action}
                </div>
                <div className="flex-1 min-w-0">
                  {entry.actor_email && <span className="text-xs text-slate-400">{entry.actor_email}</span>}
                  {entry.new_value != null && (
                    <div className="text-xs text-slate-600 font-mono mt-0.5 truncate">
                      {JSON.stringify(entry.new_value)}
                    </div>
                  )}
                </div>
                <span className="text-xs text-slate-600 shrink-0">
                  {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
          {total > 50 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800">
              <span className="text-xs text-slate-500">{total} total entries</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </PageShell>
  )
}

// ── Settings ──────────────────────────────────────────────────
export function SettingsPage() {
  const { user } = useAuth()
  return (
    <PageShell title="Settings" sub="Workspace and account settings." icon={<SettingsIcon size={16} />}>
      <Card className="px-6 py-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-4">Account</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Email</span>
            <span className="text-xs text-slate-300">{user?.email}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">User ID</span>
            <code className="text-xs text-slate-500 font-mono">{user?.id?.slice(0, 8)}…</code>
          </div>
        </div>
      </Card>
      <Card className="px-6 py-5 mt-3">
        <h3 className="text-sm font-semibold text-slate-200 mb-1">About</h3>
        <p className="text-xs text-slate-500 mb-3">ReleasePace is an open source feature flag platform.</p>
        <div className="flex items-center gap-4">
          <div>
            <div className="text-xs text-slate-400 font-medium">Aryaa Tiwari</div>
            <div className="text-[10px] text-slate-600 mt-0.5">Creator &amp; maintainer</div>
          </div>
          <div className="flex gap-3">
            <a href="https://github.com/AryaaTiwari" target="_blank" rel="noopener noreferrer"
              className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
              GitHub →
            </a>
            <a href="https://www.linkedin.com/in/aryaa-tiwari/" target="_blank" rel="noopener noreferrer"
              className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
              LinkedIn →
            </a>
          </div>
        </div>
      </Card>

      <Card className="px-6 py-5 mt-3">
        <h3 className="text-sm font-semibold text-slate-200 mb-2">SDK quick-start</h3>
        <p className="text-xs text-slate-500 mb-3">Copy into your app — replace the API key from the Keys page.</p>
        <pre className="bg-slate-950 rounded-lg px-4 py-3 text-xs text-slate-400 font-mono overflow-x-auto">{`// JavaScript
import { ReleasePace } from 'releasepace-js'
const rp = new ReleasePace({ apiKey: 'rp_live_xxx' })
await rp.connect()
if (rp.isEnabled('my-flag')) { ... }

# Python
from releasepace import ReleasePace
with ReleasePace(api_key='rp_live_xxx') as rp:
    if rp.is_enabled('my-flag'): ...

// Java
ReleasePace rp = ReleasePace.builder().apiKey("rp_live_xxx").build().connect();
if (rp.isEnabled("my-flag")) { ... }

// Go
client, _ := releasepace.New(releasepace.Options{APIKey: "rp_live_xxx"})
defer client.Close()
if client.IsEnabled("my-flag") { ... }`}
        </pre>
      </Card>
    </PageShell>
  )
}

// ── Shared page shell ─────────────────────────────────────────
function PageShell({ title, sub, icon, action, children }: {
  title: string; sub: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="sticky top-0 z-10 bg-slate-950/80 backdrop-blur border-b border-slate-800/60 px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-slate-500">{icon}</span>
            <div>
              <h1 className="text-sm font-semibold text-white">{title}</h1>
              <p className="text-xs text-slate-500">{sub}</p>
            </div>
          </div>
          {action}
        </div>
      </div>
      <div className="px-8 py-6">{children}</div>
    </div>
  )
}
