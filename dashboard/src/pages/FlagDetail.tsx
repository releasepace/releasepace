import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Save, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { flags as flagsApi, audit as auditApi, Flag, FlagState, AuditEntry } from '../lib/api'
import { Button, Toggle, Badge, TypeBadge, ColorDot, Input, Textarea, Label, FormGroup, ErrorMsg, Spinner, Card } from '../components/ui'
import { formatDistanceToNow } from 'date-fns'

export function FlagDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [flag, setFlag] = useState<Flag | null>(null)
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAudit, setShowAudit] = useState(false)

  async function load() {
    if (!id) return
    setLoading(true)
    try {
      const [f, a] = await Promise.all([
        flagsApi.get(id),
        auditApi.list({ flag_id: id }),
      ])
      setFlag(f)
      setAuditEntries(a.entries)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  async function handleStateChange(envId: string, patch: Partial<FlagState>) {
    if (!flag) return
    setSaving(envId); setError(null)
    try {
      await flagsApi.setState(flag.id, { environment_id: envId, ...patch })
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <div className="flex justify-center py-32"><Spinner size={24} /></div>
  if (!flag) return <div className="p-8 text-slate-500 text-sm">Flag not found.</div>

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
      {/* Breadcrumb */}
      <div>
        <Link to="/flags" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 mb-4 transition-colors">
          <ArrowLeft size={12} /> All flags
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-semibold text-white">{flag.name}</h1>
              <TypeBadge type={flag.type} />
              {flag.archived && <Badge variant="red">archived</Badge>}
            </div>
            <div className="flex items-center gap-3">
              <code className="text-xs text-violet-400 font-mono bg-violet-500/10 px-2 py-0.5 rounded">{flag.key}</code>
              {flag.description && <span className="text-xs text-slate-500">{flag.description}</span>}
            </div>
          </div>
          {!flag.archived && (
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 size={13} />}
              onClick={async () => {
                if (confirm('Archive this flag? It will stop being served to SDKs.')) {
                  await flagsApi.archive(flag.id)
                  await load()
                }
              }}
            >
              Archive
            </Button>
          )}
        </div>
      </div>

      <ErrorMsg message={error} />

      {/* Per-environment cards */}
      <div>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Environments</h2>
        <div className="space-y-3">
          {(flag.flag_states ?? []).map(state => {
            const env = state.environments
            if (!env) return null
            return (
              <EnvStateCard
                key={state.id}
                state={state}
                flagType={flag.type}
                envName={env.name}
                envColor={env.color}
                envProtected={env.protected}
                saving={saving === state.environment_id}
                onChange={patch => handleStateChange(state.environment_id, patch)}
              />
            )
          })}
        </div>
      </div>

      {/* Audit log */}
      <div>
        <button
          className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 hover:text-slate-300 transition-colors"
          onClick={() => setShowAudit(a => !a)}
        >
          {showAudit ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          Audit log ({auditEntries.length})
        </button>
        {showAudit && (
          <Card>
            {auditEntries.length === 0 ? (
              <p className="text-xs text-slate-600 p-4">No changes recorded yet.</p>
            ) : (
              <div className="divide-y divide-slate-800">
                {auditEntries.map(entry => (
                  <div key={entry.id} className="px-4 py-3 flex items-start justify-between gap-4">
                    <div>
                      <span className="text-xs font-mono text-violet-400">{entry.action}</span>
                      {entry.actor_email && (
                        <span className="text-xs text-slate-500 ml-2">by {entry.actor_email}</span>
                      )}
                      {entry.new_value && (
                        <div className="text-xs text-slate-600 mt-0.5 font-mono">
                          → {JSON.stringify(entry.new_value).slice(0, 80)}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-slate-600 shrink-0">
                      {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}

function EnvStateCard({ state, flagType, envName, envColor, envProtected, saving, onChange }: {
  state: FlagState; flagType: string; envName: string; envColor: string
  envProtected: boolean; saving: boolean; onChange: (patch: Partial<FlagState>) => void
}) {
  const [localValue, setLocalValue] = useState(JSON.stringify(state.value ?? ''))
  const [localRollout, setLocalRollout] = useState(state.rollout_pct ?? 100)
  const [dirty, setDirty] = useState(false)

  function handleValueChange(v: string) {
    setLocalValue(v); setDirty(true)
  }

  function handleRolloutChange(v: number) {
    setLocalRollout(v); setDirty(true)
  }

  function handleSave() {
    let parsed: unknown = localValue
    if (flagType === 'number') parsed = Number(localValue)
    else if (flagType === 'json') {
      try { parsed = JSON.parse(localValue) } catch { alert('Invalid JSON'); return }
    }
    onChange({ value: parsed, rollout_pct: localRollout })
    setDirty(false)
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ColorDot color={envColor} />
          <span className="text-sm font-medium text-slate-200">{envName}</span>
          {envProtected && <Badge variant="amber">protected</Badge>}
        </div>
        <div className="flex items-center gap-3">
          {flagType === 'boolean' && (
            <span className={`text-xs font-medium ${state.enabled ? 'text-emerald-400' : 'text-slate-500'}`}>
              {state.enabled ? 'Enabled' : 'Disabled'}
            </span>
          )}
          <Toggle
            checked={state.enabled}
            onChange={v => onChange({ enabled: v })}
            disabled={saving}
          />
        </div>
      </div>

      {/* Non-boolean value editor */}
      {flagType !== 'boolean' && (
        <div className="space-y-3">
          <FormGroup>
            <Label>Value</Label>
            {flagType === 'string' ? (
              <Textarea rows={2} value={localValue.replace(/^"|"$/g, '')}
                onChange={e => handleValueChange(`"${e.target.value}"`)} />
            ) : (
              <Input
                type={flagType === 'number' ? 'number' : 'text'}
                value={localValue}
                onChange={e => handleValueChange(e.target.value)}
                className="font-mono"
              />
            )}
          </FormGroup>
        </div>
      )}

      {/* Rollout slider */}
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1.5">
          <Label>Rollout</Label>
          <span className="text-xs text-slate-400 font-mono">{localRollout}%</span>
        </div>
        <input
          type="range" min={0} max={100} value={localRollout}
          onChange={e => handleRolloutChange(Number(e.target.value))}
          className="w-full accent-violet-500 h-1.5 rounded-full bg-slate-700 cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-slate-600 mt-1">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      {dirty && (
        <div className="mt-3 pt-3 border-t border-slate-800">
          <Button size="sm" icon={<Save size={12} />} loading={saving} onClick={handleSave}>
            Save changes
          </Button>
        </div>
      )}

      <div className="mt-3 text-xs text-slate-600">
        Last updated {formatDistanceToNow(new Date(state.updated_at), { addSuffix: true })}
      </div>
    </Card>
  )
}
