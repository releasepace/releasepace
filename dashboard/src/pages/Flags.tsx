import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Flag as FlagIcon, ChevronRight, Archive } from 'lucide-react'
import { flags as flagsApi, Flag, Environment, environments as envApi } from '../lib/api'
import { Button, Badge, Toggle, TypeBadge, Modal, Input, Select, Textarea, Label, FormGroup, ErrorMsg, Empty, Spinner, ColorDot } from '../components/ui'
import { formatDistanceToNow } from 'date-fns'

export function FlagsPage() {
  const [flagList, setFlagList] = useState<Flag[]>([])
  const [envList, setEnvList] = useState<Environment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [f, e] = await Promise.all([
        flagsApi.list({ q: search || undefined, archived: showArchived }),
        envApi.list(),
      ])
      setFlagList(f.flags)
      setEnvList(e)
    } finally {
      setLoading(false)
    }
  }, [search, showArchived])

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

  // Get the "production" env or the first one for the list view toggle
  const primaryEnv = envList.find(e => e.slug === 'production') || envList[0]

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
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <button
              onClick={() => setShowArchived(a => !a)}
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
      </div>

      {/* Table */}
      <div className="px-8 py-6">
        {loading ? (
          <div className="flex justify-center py-20"><Spinner size={24} /></div>
        ) : flagList.length === 0 ? (
          <Empty
            icon={<FlagIcon size={40} />}
            title={search ? 'No flags match your search' : 'No flags yet'}
            description={search ? 'Try a different search term.' : 'Create your first feature flag to start controlling your releases.'}
            action={!search && <Button icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>Create first flag</Button>}
          />
        ) : (
          <div className="space-y-2">
            {/* Column headers */}
            {primaryEnv && (
              <div className="flex items-center gap-4 px-4 pb-2 text-xs text-slate-600 font-medium uppercase tracking-wider">
                <span className="flex-1">Flag</span>
                <div className="flex gap-6">
                  {envList.slice(0, 3).map(env => (
                    <span key={env.id} className="w-20 text-center flex items-center justify-center gap-1">
                      <ColorDot color={env.color} />
                      {env.name}
                    </span>
                  ))}
                </div>
                <span className="w-8" />
              </div>
            )}

            {flagList.map(flag => (
              <div key={flag.id} className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-4 hover:border-slate-700 transition-colors group">
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
                <div className="flex gap-6">
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
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      <CreateFlagModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); load() }}
      />
    </div>
  )
}

function CreateFlagModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState('boolean')
  const [desc, setDesc] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Auto-generate key from name
  function handleNameChange(v: string) {
    setName(v)
    setKey(v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
  }

  async function handleSubmit() {
    if (!key || !name) { setError('Name and key are required'); return }
    if (!/^[a-z0-9-]+$/.test(key)) { setError('Key must be lowercase letters, numbers, and hyphens'); return }
    setLoading(true); setError(null)
    try {
      await flagsApi.create({ key, name, type, description: desc })
      setKey(''); setName(''); setType('boolean'); setDesc('')
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
        <ErrorMsg message={error} />
        <div className="flex gap-3 pt-1">
          <Button onClick={handleSubmit} loading={loading} className="flex-1 justify-center">Create flag</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  )
}
