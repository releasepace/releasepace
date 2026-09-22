import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Flag as FlagIcon, ChevronRight, ChevronLeft, Archive, Layers, Pencil, Trash2 } from 'lucide-react'
import { flags as flagsApi, apps as appsApi, App, Flag, Environment, environments as envApi } from '../lib/api'
import { Button, Badge, Toggle, TypeBadge, Modal, Input, Select, Textarea, Label, FormGroup, ErrorMsg, Empty, Spinner, ColorDot } from '../components/ui'
import { formatDistanceToNow } from 'date-fns'

const PAGE_SIZE = 10
const STANDARD_ENVIRONMENT_COLORS: Record<string, string> = {
  development: '#10b981',
  staging: '#f59e0b',
  production: '#ef4444',
}

function environmentColor(env: Environment) {
  const slug = (env.slug || '').trim().toLowerCase()
  const name = (env.name || '').trim().toLowerCase()
  if (slug === 'development' || name === 'development') return STANDARD_ENVIRONMENT_COLORS.development
  if (slug === 'staging' || name === 'staging') return STANDARD_ENVIRONMENT_COLORS.staging
  if (slug === 'production' || name === 'production') return STANDARD_ENVIRONMENT_COLORS.production
  return env.color || '#6366f1'
}

export function FlagsPage() {
  const [flagList, setFlagList] = useState<Flag[]>([])
  const [appList, setAppList] = useState<App[]>([])
  const [envList, setEnvList] = useState<Environment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showCreateApp, setShowCreateApp] = useState(false)
  const [editingApp, setEditingApp] = useState<App | null>(null)
  const [appFilter, setAppFilter] = useState('')
  const [appPages, setAppPages] = useState<Record<string, number>>({})
  const [appTotals, setAppTotals] = useState<Record<string, number>>({})
  const [toggling, setToggling] = useState<string | null>(null)
  const [appError, setAppError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [e, a] = await Promise.all([envApi.list(), appsApi.list()])
      setEnvList(e)
      setAppList(a)
      if (a.length > 0 && (!appFilter || !a.some(app => app.id === appFilter))) {
        setAppFilter(a[0].id)
        return
      }
      const visibleApps = appFilter ? a.filter(app => app.id === appFilter) : a
      const appResults = await Promise.all(visibleApps.map(app => flagsApi.list({
        q: search || undefined,
        archived: showArchived,
        page: appPages[app.id] || 1,
        limit: PAGE_SIZE,
        app_id: app.id,
      })))
      const unassignedResult = appFilter ? null : await flagsApi.list({
        q: search || undefined,
        archived: showArchived,
        page: appPages.unassigned || 1,
        limit: PAGE_SIZE,
        app_id: 'unassigned',
      })
      const totals: Record<string, number> = {}
      visibleApps.forEach((app, index) => { totals[app.id] = appResults[index].total })
      if (unassignedResult) totals.unassigned = unassignedResult.total
      setFlagList([...appResults.flatMap(result => result.flags), ...(unassignedResult?.flags ?? [])])
      setAppTotals(totals)
    } finally {
      setLoading(false)
    }
  }, [search, showArchived, appFilter, appPages])

  useEffect(() => { load() }, [load])

  async function handleToggle(flag: Flag, envId: string, enabled: boolean) {
    setToggling(`${flag.id}-${envId}`)
    try {
      await flagsApi.setState(flag.id, { environment_id: envId, enabled })
      await load()
    } finally {
      setToggling(null)
    }
  }

  async function handleDeleteApp(app: App) {
    if (!confirm(`Delete app “${app.name}”? This is only allowed when it has no active flags.`)) return
    setAppError(null)
    try {
      await appsApi.delete(app.id)
      setAppList(list => list.filter(item => item.id !== app.id))
      if (appFilter === app.id) setAppFilter('')
      await load()
    } catch (e: any) {
      setAppError(e.message)
    }
  }

  // Get the "production" env or the first one for the list view toggle
  const primaryEnv = envList.find(e => e.slug === 'production') || envList[0]
  const groupedFlags = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; flags: Flag[] }>()
    for (const app of appList) {
      if (!appFilter || app.id === appFilter) groups.set(app.id, { id: app.id, name: app.name, flags: [] })
    }
    for (const flag of flagList) {
      const key = flag.apps?.id || flag.app_id || 'unassigned'
      const current = groups.get(key) || { id: key, name: flag.apps?.name || 'Unassigned', flags: [] }
      current.flags.push(flag)
      groups.set(key, current)
    }
    return [...groups.values()]
  }, [flagList, appList, appFilter])
  function setAppPage(appId: string, nextPage: number) {
    setAppPages(current => ({ ...current, [appId]: nextPage }))
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-950/80 backdrop-blur border-b border-slate-800/60 px-8 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <Input
                placeholder="Search flags…"
                value={search}
                onChange={e => { setAppPages({}); setSearch(e.target.value) }}
                className="pl-9"
              />
            </div>
            <button
              onClick={() => { setAppPages({}); setShowArchived(a => !a) }}
              className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-all ${showArchived ? 'border-violet-500/50 text-violet-300 bg-violet-500/10' : 'border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600'}`}
            >
              <Archive size={12} />
              Archived
            </button>
          </div>
          <Button icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
            New flag
          </Button>
        </div>
        {primaryEnv && (
          <div className="flex items-center gap-4 px-4 pt-4 mt-4 border-t border-slate-800/60 text-xs text-slate-600 font-medium uppercase tracking-wider">
            <span className="flex-1">Flag</span>
            <div className="flex gap-8">
              {envList.slice(0, 3).map(env => (
                <span key={env.id} className="w-20 text-center flex items-center justify-center gap-1">
                  <ColorDot color={environmentColor(env)} />
                  {env.name}
                </span>
              ))}
            </div>
            <span className="w-8" />
          </div>
        )}
        <div className="flex items-center gap-1.5 mt-3 overflow-x-auto">
          {appList.map(app => (
            <button
              key={app.id}
              type="button"
              onClick={() => { setAppPages({}); setAppFilter(app.id) }}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${appFilter === app.id ? 'border-violet-500/60 bg-violet-500/15 text-violet-300 shadow-sm' : 'border-slate-800 bg-slate-900/40 text-slate-500 hover:border-slate-700 hover:bg-slate-800/60 hover:text-slate-300'}`}
            >
              {app.name}
            </button>
          ))}
          {appTotals.unassigned > 0 && (
            <button
              type="button"
              onClick={() => { setAppPages({}); setAppFilter('unassigned') }}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${appFilter === 'unassigned' ? 'border-violet-500/60 bg-violet-500/15 text-violet-300 shadow-sm' : 'border-slate-800 bg-slate-900/40 text-slate-500 hover:border-slate-700 hover:bg-slate-800/60 hover:text-slate-300'}`}
            >
              Unassigned
            </button>
          )}
          <button type="button" onClick={() => setShowCreateApp(true)} className="shrink-0 px-3 py-1.5 text-xs text-violet-400 hover:text-violet-300">+ New app</button>
        </div>
      </div>

      {/* Table */}
      <div className="px-8 py-6">
        {appError && <div className="mb-4"><ErrorMsg message={appError} /></div>}
        {loading ? (
          <div className="flex justify-center py-20"><Spinner size={24} /></div>
        ) : flagList.length === 0 && appList.length === 0 ? (
          <Empty
            icon={<FlagIcon size={40} />}
            title={search ? 'No flags match your search' : 'No flags yet'}
            description={search ? 'Try a different search term.' : 'Create your first feature flag to start controlling your releases.'}
            action={!search && <Button icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>Create first flag</Button>}
          />
        ) : (
          <div className="space-y-6">
            {groupedFlags.map(group => <section key={group.name}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <Layers size={14} className="text-violet-400" />
                <h2 className="text-sm font-semibold text-slate-200">{group.name}</h2>
                <span className="text-xs text-slate-600">{appTotals[group.id] ?? group.flags.length} {(appTotals[group.id] ?? group.flags.length) === 1 ? 'flag' : 'flags'}</span>
                {group.id !== 'unassigned' && <div className="ml-auto flex items-center gap-1">
                  <button type="button" title="Rename app" onClick={() => setEditingApp(appList.find(app => app.id === group.id) || null)} className="p-1 text-slate-600 hover:text-slate-300"><Pencil size={12} /></button>
                  <button type="button" title="Delete app" onClick={() => { const app = appList.find(item => item.id === group.id); if (app) void handleDeleteApp(app) }} className="p-1 text-slate-600 hover:text-red-400"><Trash2 size={12} /></button>
                </div>}
              </div>
              <div className="space-y-2">
              {group.flags.length === 0 ? <div className="rounded-xl border border-dashed border-slate-800 px-4 py-4 text-xs text-slate-600">No flags in this app{search ? ' matching your search' : ''}.</div> : group.flags.map(flag => <div key={flag.id} className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-4 hover:border-slate-700 transition-colors group">
                {/* Flag info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-slate-100">{flag.name}</span>
                    <TypeBadge type={flag.type} />
                    {flag.archived && <Badge variant="red">archived</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-slate-500 font-mono">{flag.key}</code>
                    {flag.description && (
                      <span className="text-xs text-slate-600 truncate max-w-xs">· {flag.description}</span>
                    )}
                  </div>
                </div>

                {/* Per-environment toggles */}
                <div className="flex gap-8">
                  {envList.slice(0, 3).map(env => {
                    const state = flag.flag_states?.find(s => s.environment_id === env.id)
                    const key = `${flag.id}-${env.id}`
                    return (
                      <div key={env.id} className="w-20 flex flex-col items-center gap-1">
                        {flag.type === 'boolean' ? (
                          <>
                            <Toggle
                              checked={state?.enabled ?? false}
                              onChange={v => handleToggle(flag, env.id, v)}
                              disabled={toggling === key || flag.archived}
                            />
                            <span className={`text-[10px] ${state?.enabled ? 'text-emerald-400' : 'text-slate-600'}`}>
                              {state?.enabled ? 'on' : 'off'}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400 font-mono truncate max-w-[72px]" title={String(state?.value ?? '')}>
                            {state?.enabled ? String(state?.value ?? '—') : <span className="text-slate-600">off</span>}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Detail link */}
                <Link to={`/flags/${flag.id}`} className="text-slate-600 hover:text-slate-300 transition-colors opacity-0 group-hover:opacity-100">
                  <ChevronRight size={16} />
                </Link>
              </div>)}
              </div>
              {(appTotals[group.id] ?? 0) > PAGE_SIZE && <div className="flex items-center justify-end gap-2 pt-2 text-xs text-slate-500">
                <Button size="sm" variant="outline" icon={<ChevronLeft size={13} />} disabled={(appPages[group.id] || 1) === 1} onClick={() => setAppPage(group.id, (appPages[group.id] || 1) - 1)}>Previous</Button>
                <span>Page {appPages[group.id] || 1} of {Math.ceil((appTotals[group.id] || 0) / PAGE_SIZE)}</span>
                <Button size="sm" variant="outline" icon={<ChevronRight size={13} />} disabled={(appPages[group.id] || 1) >= Math.ceil((appTotals[group.id] || 0) / PAGE_SIZE)} onClick={() => setAppPage(group.id, (appPages[group.id] || 1) + 1)}>Next</Button>
              </div>}
            </section>)}
          </div>
        )}
      </div>

      {/* Create modal */}
      <CreateFlagModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        apps={appList}
        onCreateApp={() => setShowCreateApp(true)}
        onCreated={() => { setShowCreate(false); load() }}
      />
      <CreateAppModal open={showCreateApp} onClose={() => setShowCreateApp(false)} onCreated={(app) => { setAppList(list => [...list, app].sort((a, b) => a.name.localeCompare(b.name))); setShowCreateApp(false) }} />
      <EditAppModal app={editingApp} onClose={() => setEditingApp(null)} onUpdated={(app) => { setAppList(list => list.map(item => item.id === app.id ? app : item).sort((a, b) => a.name.localeCompare(b.name))); setEditingApp(null) }} />
    </div>
  )
}

function CreateFlagModal({ open, onClose, onCreated, apps, onCreateApp }: { open: boolean; onClose: () => void; onCreated: () => void; apps: App[]; onCreateApp: () => void }) {
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState('boolean')
  const [desc, setDesc] = useState('')
  const [clientSide, setClientSide] = useState(false)
  const [appId, setAppId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!appId && apps.length > 0) setAppId(apps[0].id)
  }, [apps, appId])

  // Auto-generate key from name
  function handleNameChange(v: string) {
    setName(v)
    setKey(v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
  }

  async function handleSubmit() {
    if (!key || !name) { setError('Name and key are required'); return }
    if (!appId) { setError('Select an app before creating a flag'); return }
    if (!/^[a-z0-9-]+$/.test(key)) { setError('Key must be lowercase letters, numbers, and hyphens'); return }
    setLoading(true); setError(null)
    try {
      await flagsApi.create({ key, name, type, description: desc, client_side: clientSide, app_id: appId })
      setKey(''); setName(''); setType('boolean'); setDesc(''); setClientSide(false); setAppId('')
      onCreated()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New feature flag">
      <div className="space-y-4">
        <FormGroup>
          <Label required>App</Label>
          <div className="flex gap-2">
            <Select value={appId} onChange={e => setAppId(e.target.value)}>
              {apps.map(app => <option key={app.id} value={app.id}>{app.name}</option>)}
            </Select>
            <Button type="button" size="sm" variant="outline" onClick={onCreateApp}>New</Button>
          </div>
        </FormGroup>
        <FormGroup>
          <Label required>Name</Label>
          <Input placeholder="New checkout flow" value={name} onChange={e => handleNameChange(e.target.value)} />
        </FormGroup>
        <FormGroup>
          <Label required>Key</Label>
          <Input placeholder="new-checkout-flow" value={key} onChange={e => setKey(e.target.value)} className="font-mono" />
          <p className="text-xs text-slate-600 mt-1">Lowercase letters, numbers, hyphens. Used in your code.</p>
        </FormGroup>
        <FormGroup>
          <Label>Type</Label>
          <Select value={type} onChange={e => setType(e.target.value)}>
            <option value="boolean">Boolean — on/off toggle</option>
            <option value="string">String — text value</option>
            <option value="number">Number — numeric value</option>
            <option value="json">JSON — structured data</option>
          </Select>
        </FormGroup>
        <FormGroup>
          <Label>Description</Label>
          <Textarea placeholder="What does this flag control?" value={desc} onChange={e => setDesc(e.target.value)} rows={2} />
        </FormGroup>
        <label className="flex items-start gap-3 rounded-lg border border-slate-800 p-3 cursor-pointer">
          <input type="checkbox" checked={clientSide} onChange={e => setClientSide(e.target.checked)} className="mt-0.5 accent-violet-500" />
          <span>
            <span className="block text-sm text-slate-200">Expose to browser and mobile SDKs</span>
            <span className="block text-xs text-slate-500 mt-0.5">Only enable this when the flag's values and targeting outcomes are safe for end users to see.</span>
          </span>
        </label>
        <ErrorMsg message={error} />
        <div className="flex gap-3 pt-1">
          <Button onClick={handleSubmit} loading={loading} className="flex-1 justify-center">Create flag</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  )
}

function CreateAppModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (app: App) => void }) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function handleSubmit() {
    if (!name.trim()) { setError('App name is required'); return }
    setLoading(true); setError(null)
    try { const app = await appsApi.create(name); setName(''); onCreated(app) } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }
  return <Modal open={open} onClose={onClose} title="New app">
    <div className="space-y-4">
      <FormGroup><Label required>Name</Label><Input autoFocus placeholder="Web dashboard" value={name} onChange={e => setName(e.target.value)} /></FormGroup>
      <ErrorMsg message={error} />
      <div className="flex gap-3"><Button onClick={handleSubmit} loading={loading} className="flex-1 justify-center">Create app</Button><Button variant="outline" onClick={onClose}>Cancel</Button></div>
    </div>
  </Modal>
}

function EditAppModal({ app, onClose, onUpdated }: { app: App | null; onClose: () => void; onUpdated: (app: App) => void }) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setName(app?.name || ''); setError(null) }, [app])
  async function handleSubmit() {
    if (!app || !name.trim()) { setError('App name is required'); return }
    setLoading(true); setError(null)
    try { onUpdated(await appsApi.update(app.id, name)) } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }
  return <Modal open={!!app} onClose={onClose} title="Rename app">
    <div className="space-y-4">
      <FormGroup><Label required>Name</Label><Input autoFocus value={name} onChange={e => setName(e.target.value)} /></FormGroup>
      <ErrorMsg message={error} />
      <div className="flex gap-3"><Button onClick={handleSubmit} loading={loading} className="flex-1 justify-center">Save name</Button><Button variant="outline" onClick={onClose}>Cancel</Button></div>
    </div>
  </Modal>
}
