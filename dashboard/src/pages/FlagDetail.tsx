import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Save, Trash2, ChevronDown, ChevronUp, Plus, X, Users, User } from 'lucide-react'
import { flags as flagsApi, audit as auditApi, segments as segmentsApi,
  Flag, FlagState, AuditEntry, Segment, BucketBy, TargetingRule } from '../lib/api'
import { useRole } from '../context/AuthContext'
import { Button, Toggle, Badge, TypeBadge, ColorDot, Input, Select, Textarea, Label, FormGroup, ErrorMsg, Spinner, Card } from '../components/ui'
import { formatDistanceToNow } from 'date-fns'

export function FlagDetailPage() {
  const { canWrite } = useRole()
  const { id } = useParams<{ id: string }>()
  const [flag, setFlag] = useState<Flag | null>(null)
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAudit, setShowAudit] = useState(false)
  const [allSegments, setAllSegments] = useState<Segment[]>([])

  useEffect(() => {
    segmentsApi.list()
      .then(r => setAllSegments(r.segments))
      .catch(() => setAllSegments([]))
  }, [])

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
      await flagsApi.setState(flag.id, {
        environment_id: envId,
        enabled: patch.enabled,
        value: patch.value,
        strategies: patch.strategies,
        ...(patch.rollout_pct == null ? {} : { rollout_pct: patch.rollout_pct }),
        ...(patch.bucket_by === undefined ? {} : { bucket_by: patch.bucket_by }),
        ...(patch.targeting_rules === undefined ? {} : { targeting_rules: patch.targeting_rules }),
      })
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
                segments={allSegments}
                canWrite={canWrite}
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
                      {entry.new_value != null && (
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

function EnvStateCard({ state, flagType, envName, envColor, envProtected, segments, canWrite, saving, onChange }: {
  state: FlagState; flagType: string; envName: string; envColor: string
  envProtected: boolean; segments: Segment[]; canWrite: boolean; saving: boolean
  onChange: (patch: Partial<FlagState>) => void
}) {
  const [localValue, setLocalValue] = useState(JSON.stringify(state.value ?? ''))
  const [localRollout, setLocalRollout] = useState(state.rollout_pct ?? 100)
  const [bucketBy, setBucketBy] = useState<BucketBy | null>(state.bucket_by ?? null)
  const [rules, setRules] = useState<TargetingRule[]>(state.targeting_rules ?? [])
  const [addingRule, setAddingRule] = useState(false)
  const [dirty, setDirty] = useState(false)

  // 0 and 100 never reach the hash, so they need no bucketing choice.
  const isPartial = localRollout > 0 && localRollout < 100
  const needsBucketChoice = isPartial && !bucketBy

  function handleValueChange(v: string) {
    setLocalValue(v); setDirty(true)
  }

  function handleRolloutChange(v: number) {
    setLocalRollout(v); setDirty(true)
  }

  function handleBucketChange(v: BucketBy) {
    setBucketBy(v); setDirty(true)
  }

  function handleRulesChange(next: TargetingRule[]) {
    setRules(next); setDirty(true)
  }

  function handleSave() {
    if (needsBucketChoice) return
    let parsed: unknown = localValue
    if (flagType === 'number') parsed = Number(localValue)
    else if (flagType === 'json') {
      try { parsed = JSON.parse(localValue) } catch { alert('Invalid JSON'); return }
    }
    onChange({
      value: parsed,
      rollout_pct: localRollout,
      bucket_by: isPartial ? bucketBy : null,
      targeting_rules: rules,
    })
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
            disabled={saving || !canWrite}
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

      {/* Targeting rules — checked before the rollout below */}
      <TargetingSection
        rules={rules}
        segments={segments}
        adding={addingRule}
        onAddingChange={setAddingRule}
        onChange={handleRulesChange}
      />

      {/* Rollout slider */}
      <div className="mt-4 pt-4 border-t border-slate-800">
        <div className="flex items-center justify-between mb-1.5">
          <Label>Rollout for everyone else</Label>
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

      {/* Bucketing — asked only when the percentage actually means something */}
      {isPartial && (
        <div className={`mt-3 rounded-lg border p-3 ${
          needsBucketChoice ? 'border-amber-500/40 bg-amber-500/5' : 'border-slate-800 bg-slate-900/40'
        }`}>
          <div className="text-xs font-medium text-slate-200 mb-1">
            {localRollout}% of what?
          </div>
          <p className="text-xs text-slate-500 mb-2.5">
            Whoever lands inside the percentage stays inside it as you ramp up.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <BucketOption
              active={bucketBy === 'tenantId'}
              icon={<Users size={13} />}
              title="Organisations"
              detail="A whole org is in or out"
              onClick={() => handleBucketChange('tenantId')}
            />
            <BucketOption
              active={bucketBy === 'userId'}
              icon={<User size={13} />}
              title="Users"
              detail="Split across every org"
              onClick={() => handleBucketChange('userId')}
            />
          </div>
          {needsBucketChoice && (
            <p className="mt-2.5 text-xs text-amber-400">
              Pick one to save this rollout.
            </p>
          )}
        </div>
      )}

      {dirty && (
        <div className="mt-3 pt-3 border-t border-slate-800">
          <Button
            size="sm"
            icon={<Save size={12} />}
            loading={saving}
            disabled={needsBucketChoice || !canWrite}
            onClick={handleSave}
            title={!canWrite ? 'You need editor access to save changes' : undefined}
          >
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

function BucketOption({ active, icon, title, detail, onClick }: {
  active: boolean; icon: React.ReactNode; title: string; detail: string; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-left rounded-lg border px-2.5 py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
        active
          ? 'border-violet-500 bg-violet-500/10'
          : 'border-slate-700 hover:border-slate-600'
      }`}
    >
      <div className={`flex items-center gap-1.5 text-xs font-medium ${active ? 'text-violet-300' : 'text-slate-300'}`}>
        {icon}{title}
      </div>
      <div className="text-[11px] text-slate-500 mt-0.5">{detail}</div>
    </button>
  )
}

/** Ordered targeting rules. The first one that matches decides. */

// ─── Operator metadata ────────────────────────────────────────
// Defines which operators are available, how they're labelled,
// and what value input they need.

type InputKind = 'text' | 'multi' | 'segment' | 'none'

interface OpMeta {
  label: string
  kind: InputKind
  hint?: string
}

const OPERATORS: Record<string, OpMeta> = {
  in_segment:     { label: 'is in segment',     kind: 'segment' },
  not_in_segment: { label: 'is not in segment', kind: 'segment' },
  equals:         { label: 'equals',             kind: 'text',  hint: 'exact value' },
  in:             { label: 'is one of',          kind: 'multi', hint: 'comma separated' },
  not_in:         { label: 'is not one of',      kind: 'multi', hint: 'comma separated' },
  contains:       { label: 'contains',           kind: 'text',  hint: 'substring' },
  starts_with:    { label: 'starts with',        kind: 'text',  hint: 'prefix' },
  semver_gte:     { label: '≥ version',          kind: 'text',  hint: 'e.g. 4.2.0' },
}

// Common attribute suggestions — the user can also type anything
const ATTRIBUTE_SUGGESTIONS = [
  'tenantId', 'userId', 'plan', 'region', 'country',
  'appVersion', 'env', 'email', 'role',
]

// ─── Draft condition (what the editor works with) ────────────
interface DraftCondition {
  attribute: string
  op: string
  value: string   // for text / segment / semver_gte
  values: string  // for multi — raw comma-separated string
}

function emptyCondition(): DraftCondition {
  return { attribute: 'tenantId', op: 'equals', value: '', values: '' }
}

function conditionToApi(d: DraftCondition): any {
  if (d.op === 'in' || d.op === 'not_in') {
    return {
      attribute: d.attribute,
      op: d.op,
      values: d.values.split(',').map(v => v.trim()).filter(Boolean),
    }
  }
  return { attribute: d.attribute, op: d.op, value: d.value }
}

function conditionFromApi(c: any): DraftCondition {
  return {
    attribute: c.attribute ?? 'tenantId',
    op: c.op ?? 'equals',
    value: c.value ?? '',
    values: Array.isArray(c.values) ? c.values.join(', ') : '',
  }
}

function conditionIsValid(d: DraftCondition): boolean {
  if (!d.attribute.trim()) return false
  const meta = OPERATORS[d.op]
  if (!meta) return false
  if (meta.kind === 'text' || meta.kind === 'segment') return d.value.trim() !== ''
  if (meta.kind === 'multi') return d.values.split(',').some(v => v.trim())
  return true
}

// ─── Single condition row ────────────────────────────────────
function ConditionRow({
  cond, segments, onChange, onRemove, showRemove,
}: {
  cond: DraftCondition
  segments: Segment[]
  onChange: (c: DraftCondition) => void
  onRemove: () => void
  showRemove: boolean
}) {
  const meta = OPERATORS[cond.op] ?? { kind: 'text' }

  return (
    <div className="flex items-start gap-1.5 flex-wrap">
      {/* Attribute */}
      <div className="relative">
        <Input
          list="attr-suggestions"
          value={cond.attribute}
          onChange={e => onChange({ ...cond, attribute: e.target.value })}
          placeholder="attribute"
          className="font-mono text-xs w-32"
        />
        <datalist id="attr-suggestions">
          {ATTRIBUTE_SUGGESTIONS.map(a => <option key={a} value={a} />)}
        </datalist>
      </div>

      {/* Operator */}
      <Select
        value={cond.op}
        onChange={e => onChange({ ...cond, op: e.target.value, value: '', values: '' })}
        className="text-xs w-36"
      >
        {Object.entries(OPERATORS).map(([op, m]) => (
          <option key={op} value={op}>{m.label}</option>
        ))}
      </Select>

      {/* Value — adapts to operator */}
      {meta.kind === 'segment' && (
        <Select
          value={cond.value}
          onChange={e => onChange({ ...cond, value: e.target.value })}
          className="text-xs flex-1 min-w-[120px]"
        >
          <option value="">Choose segment…</option>
          {segments.map(s => (
            <option key={s.id} value={s.key}>
              {s.name} ({s.member_count ?? 0})
            </option>
          ))}
        </Select>
      )}

      {meta.kind === 'text' && (
        <Input
          value={cond.value}
          onChange={e => onChange({ ...cond, value: e.target.value })}
          placeholder={meta.hint ?? 'value'}
          className="text-xs flex-1 min-w-[100px] font-mono"
        />
      )}

      {meta.kind === 'multi' && (
        <Input
          value={cond.values}
          onChange={e => onChange({ ...cond, values: e.target.value })}
          placeholder={meta.hint ?? 'value1, value2'}
          className="text-xs flex-1 min-w-[140px] font-mono"
        />
      )}

      {/* Remove condition */}
      {showRemove && (
        <button
          type="button"
          aria-label="Remove condition"
          onClick={onRemove}
          className="text-slate-600 hover:text-red-400 mt-1.5"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}

// ─── Rule builder form ────────────────────────────────────────
function RuleBuilder({
  segments,
  onAdd,
  onCancel,
}: {
  segments: Segment[]
  onAdd: (rule: TargetingRule) => void
  onCancel: () => void
}) {
  const [serveEnabled, setServeEnabled] = useState(true)
  const [conditions, setConditions] = useState<DraftCondition[]>([emptyCondition()])

  function updateCondition(i: number, c: DraftCondition) {
    setConditions(prev => prev.map((p, idx) => idx === i ? c : p))
  }

  function removeCondition(i: number) {
    setConditions(prev => prev.filter((_, idx) => idx !== i))
  }

  function addCondition() {
    setConditions(prev => [...prev, emptyCondition()])
  }

  function submit() {
    const apiConditions = conditions.map(conditionToApi)
    const description = buildDescription(serveEnabled, conditions)
    onAdd({
      id: `rule_${Date.now().toString(36)}`,
      description,
      conditions: apiConditions,
      serve: { enabled: serveEnabled },
    })
  }

  const allValid = conditions.length > 0 && conditions.every(conditionIsValid)

  return (
    <div className="mt-2 rounded-lg border border-slate-700 bg-slate-900/60 p-3 space-y-3">
      {/* Serve */}
      <div className="flex items-center gap-2">
        <Select
          value={serveEnabled ? 'on' : 'off'}
          onChange={e => setServeEnabled(e.target.value === 'on')}
          className="w-20 text-xs"
        >
          <option value="on">Turn on</option>
          <option value="off">Turn off</option>
        </Select>
        <span className="text-xs text-slate-500">when ALL of these match:</span>
      </div>

      {/* Conditions */}
      <div className="space-y-2 pl-1 border-l-2 border-slate-800">
        {conditions.map((cond, i) => (
          <ConditionRow
            key={i}
            cond={cond}
            segments={segments}
            onChange={c => updateCondition(i, c)}
            onRemove={() => removeCondition(i)}
            showRemove={conditions.length > 1}
          />
        ))}

        <button
          type="button"
          onClick={addCondition}
          className="text-xs text-slate-500 hover:text-violet-400 flex items-center gap-1 mt-1"
        >
          <Plus size={10} /> AND condition
        </button>
      </div>

      {/* Hint when all conditions valid */}
      {allValid && (
        <p className="text-[11px] text-slate-600 italic">
          {buildDescription(serveEnabled, conditions)}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button size="sm" disabled={!allValid} onClick={submit}>Add rule</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

// ─── Targeting section ────────────────────────────────────────
function TargetingSection({ rules, segments, adding, onAddingChange, onChange }: {
  rules: TargetingRule[]; segments: Segment[]; adding: boolean
  onAddingChange: (v: boolean) => void
  onChange: (next: TargetingRule[]) => void
}) {
  function handleAdd(rule: TargetingRule) {
    onChange([...rules, rule])
    onAddingChange(false)
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-1.5">
        <Label>Targeting</Label>
        {!adding && (
          <button
            type="button"
            onClick={() => onAddingChange(true)}
            className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1"
          >
            <Plus size={11} /> Add rule
          </button>
        )}
      </div>

      {rules.length === 0 && !adding && (
        <p className="text-xs text-slate-600">
          No rules. Every request falls through to the rollout below.
        </p>
      )}

      {rules.length > 0 && (
        <ol className="space-y-1.5">
          {rules.map((rule, i) => (
            <li
              key={rule.id}
              className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-2.5 py-1.5"
            >
              <span className="text-[10px] font-mono text-slate-600 w-4 shrink-0 mt-0.5">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <span className="text-xs text-slate-300 truncate block">
                  {rule.description ?? describeRule(rule)}
                </span>
                {/* Show conditions detail on hover */}
                {(rule.conditions ?? []).length > 0 && (
                  <span className="text-[10px] text-slate-600 truncate block">
                    {rule.conditions.map(c => describeCondition(c)).join(' AND ')}
                  </span>
                )}
              </div>
              <Badge variant={rule.serve.enabled ? 'green' : 'slate'}>
                {rule.serve.enabled ? 'on' : 'off'}
              </Badge>
              <button
                type="button"
                aria-label={`Remove rule ${i + 1}`}
                onClick={() => onChange(rules.filter(r => r.id !== rule.id))}
                className="text-slate-600 hover:text-red-400 mt-0.5"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ol>
      )}

      {adding && (
        <RuleBuilder
          segments={segments}
          onAdd={handleAdd}
          onCancel={() => onAddingChange(false)}
        />
      )}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────
function describeCondition(c: any): string {
  const meta = OPERATORS[c.op]
  const opLabel = meta?.label ?? c.op
  if (c.op === 'in_segment' || c.op === 'not_in_segment') {
    return `${c.attribute} ${opLabel} "${c.value}"`
  }
  if (c.op === 'in' || c.op === 'not_in') {
    const vals = (c.values ?? []).join(', ')
    return `${c.attribute} ${opLabel} [${vals}]`
  }
  return `${c.attribute} ${opLabel} "${c.value ?? ''}"`
}

function describeRule(rule: TargetingRule): string {
  const serve = rule.serve.enabled ? 'Turn on' : 'Turn off'
  const conds = (rule.conditions ?? []).map(describeCondition).join(' AND ')
  return conds ? `${serve} when ${conds}` : serve
}

function buildDescription(serveEnabled: boolean, conditions: DraftCondition[]): string {
  const serve = serveEnabled ? 'Turn on' : 'Turn off'
  const conds = conditions
    .filter(conditionIsValid)
    .map(c => {
      const meta = OPERATORS[c.op]
      const opLabel = meta?.label ?? c.op
      if (c.op === 'in' || c.op === 'not_in') {
        const vals = c.values.split(',').map(v => v.trim()).filter(Boolean).join(', ')
        return `${c.attribute} ${opLabel} [${vals}]`
      }
      return `${c.attribute} ${opLabel} "${c.value}"`
    })
    .join(' AND ')
  return conds ? `${serve} when ${conds}` : serve
}
