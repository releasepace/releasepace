import { useEffect, useState, useMemo } from 'react'
import { Search, Users, Plus, X, ChevronDown, ChevronUp } from 'lucide-react'
import {
  lookup as lookupApi, environments as envApi,
  Environment, LookupResult, LookupFlag,
} from '../lib/api'
import {
  Button, Card, Input, Label, Select, Badge, Empty,
  ErrorMsg, Spinner,
} from '../components/ui'

/**
 * "Why can't Acme see the new report builder?"
 *
 * The context editor mirrors what the SDK sends at evaluation time —
 * any attribute the targeting rules reference can be provided here.
 * Fixed tenantId / userId fields are gone; you build the exact same
 * context object your backend sends.
 */

// Attributes to suggest — same list as the condition editor
const COMMON_ATTRS = [
  { key: 'tenantId',   placeholder: 'acme-corp',     hint: 'org identifier'    },
  { key: 'userId',     placeholder: 'user_1042',      hint: 'user identifier'   },
  { key: 'plan',       placeholder: 'enterprise',     hint: 'subscription plan' },
  { key: 'region',     placeholder: 'eu',             hint: 'deployment region' },
  { key: 'country',    placeholder: 'IN',             hint: 'ISO country code'  },
  { key: 'appVersion', placeholder: '4.2.0',          hint: 'semver string'     },
  { key: 'env',        placeholder: 'production',     hint: 'app environment'   },
  { key: 'role',       placeholder: 'admin',          hint: 'user role'         },
]

interface ContextEntry { key: string; value: string }

function emptyEntry(): ContextEntry { return { key: '', value: '' } }

// ─── Context editor ────────────────────────────────────────────
function ContextEditor({
  entries, onChange,
}: {
  entries: ContextEntry[]
  onChange: (next: ContextEntry[]) => void
}) {
  function update(i: number, patch: Partial<ContextEntry>) {
    onChange(entries.map((e, idx) => idx === i ? { ...e, ...patch } : e))
  }

  function remove(i: number) {
    onChange(entries.filter((_, idx) => idx !== i))
  }

  function addSuggested(attrKey: string) {
    // Don't add a duplicate key
    if (entries.some(e => e.key === attrKey)) return
    onChange([...entries, { key: attrKey, value: '' }])
  }

  const usedKeys = new Set(entries.map(e => e.key))
  const suggestions = COMMON_ATTRS.filter(a => !usedKeys.has(a.key))
  const attrMeta = (key: string) => COMMON_ATTRS.find(a => a.key === key)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Context</Label>
        <span className="text-[11px] text-slate-600">Same attributes your SDK sends</span>
      </div>

      {/* Active entries */}
      {entries.length > 0 && (
        <div className="space-y-1.5">
          {entries.map((entry, i) => {
            const meta = attrMeta(entry.key)
            return (
              <div key={i} className="flex items-center gap-1.5">
                {/* Key — free text with datalist suggestions */}
                <div className="relative w-36 shrink-0">
                  <Input
                    list="ctx-attr-suggestions"
                    value={entry.key}
                    onChange={e => update(i, { key: e.target.value })}
                    placeholder="attribute"
                    className="font-mono text-xs"
                  />
                  <datalist id="ctx-attr-suggestions">
                    {COMMON_ATTRS.map(a => <option key={a.key} value={a.key} />)}
                  </datalist>
                </div>

                <span className="text-slate-600 text-xs shrink-0">=</span>

                {/* Value */}
                <Input
                  value={entry.value}
                  onChange={e => update(i, { value: e.target.value })}
                  placeholder={meta?.placeholder ?? 'value'}
                  className="font-mono text-xs flex-1"
                />

                <button
                  type="button"
                  aria-label={`Remove ${entry.key}`}
                  onClick={() => remove(i)}
                  className="text-slate-600 hover:text-red-400 shrink-0"
                >
                  <X size={12} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Quick-add suggestions */}
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        {suggestions.slice(0, 5).map(a => (
          <button
            key={a.key}
            type="button"
            onClick={() => addSuggested(a.key)}
            title={a.hint}
            className="text-[11px] font-mono text-slate-500 hover:text-violet-400 border border-slate-800 hover:border-violet-500/40 rounded px-1.5 py-0.5 transition-colors flex items-center gap-1"
          >
            <Plus size={9} />{a.key}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange([...entries, emptyEntry()])}
          className="text-[11px] text-slate-600 hover:text-slate-400 border border-slate-800 border-dashed rounded px-1.5 py-0.5 transition-colors flex items-center gap-1"
        >
          <Plus size={9} /> custom
        </button>
      </div>

      {entries.length === 0 && (
        <p className="text-xs text-slate-600 py-1">
          Add attributes to match your targeting rules — e.g. tenantId, plan, region.
        </p>
      )}
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────
export function LookupPage() {
  const [envs, setEnvs]         = useState<Environment[]>([])
  const [envId, setEnvId]       = useState('')
  const [entries, setEntries]   = useState<ContextEntry[]>([
    { key: 'tenantId', value: '' },
  ])
  const [result, setResult]     = useState<LookupResult | null>(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [flagFilter, setFlagFilter] = useState('')
  const [showOnly, setShowOnly] = useState<'all' | 'on' | 'off'>('all')

  useEffect(() => {
    envApi.list()
      .then(list => {
        setEnvs(list)
        const prod = list.find(e => e.protected) ?? list[0]
        if (prod) setEnvId(prod.id)
      })
      .catch(e => setError(e.message))
  }, [])

  const context = useMemo(() => {
    const ctx: Record<string, string> = {}
    for (const { key, value } of entries) {
      if (key.trim() && value.trim()) ctx[key.trim()] = value.trim()
    }
    return ctx
  }, [entries])

  const canRun = Object.keys(context).length > 0

  async function run() {
    if (!canRun) return
    setLoading(true); setError(null)
    try {
      setResult(await lookupApi.run({ environment_id: envId || undefined, context }))
    } catch (e: any) {
      setError(e.message)
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  const tenantId = context.tenantId ?? ''

  const filteredFlags = useMemo(() => {
    if (!result) return []
    return result.flags.filter(f => {
      if (showOnly === 'on' && !f.enabled) return false
      if (showOnly === 'off' && f.enabled) return false
      if (flagFilter) {
        const q = flagFilter.toLowerCase()
        return f.key.toLowerCase().includes(q) || f.name.toLowerCase().includes(q)
      }
      return true
    })
  }, [result, flagFilter, showOnly])

  const onCount  = result?.flags.filter(f => f.enabled).length ?? 0
  const offCount = result?.flags.filter(f => !f.enabled).length ?? 0

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-medium text-slate-100">Lookup</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Simulate what any context sees — matches exactly what your SDK sends at evaluation time.
        </p>
      </div>

      {/* Context builder */}
      <Card className="p-4 space-y-4">
        <ContextEditor entries={entries} onChange={setEntries} />

        {/* Environment + run */}
        <div className="flex items-end gap-3 pt-1 border-t border-slate-800">
          <div className="w-44">
            <Label>Environment</Label>
            <Select value={envId} onChange={e => setEnvId(e.target.value)} className="text-xs">
              {envs.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </div>
          <Button
            icon={<Search size={13} />}
            loading={loading}
            disabled={!canRun}
            onClick={run}
          >
            Evaluate
          </Button>
          {!canRun && (
            <span className="text-xs text-slate-600 mb-0.5">
              Add at least one attribute with a value.
            </span>
          )}
        </div>
      </Card>

      <ErrorMsg message={error} />

      {loading && <div className="flex justify-center py-16"><Spinner size={24} /></div>}

      {result && !loading && (
        <>
          {/* Segment membership */}
          {result.segments.length > 0 ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Users size={12} className="text-slate-500" />
              <span className="text-xs text-slate-500">In segments:</span>
              {result.segments.map(s => (
                <Badge key={s.key} variant="violet">{s.name}</Badge>
              ))}
            </div>
          ) : tenantId ? (
            <p className="text-xs text-slate-600">
              <code className="text-slate-400">{tenantId}</code> is not in any segment.
              {' '}Attribute-based rules still apply.
            </p>
          ) : null}

          {/* Results header + filters */}
          {result.flags.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              {/* On/off filter pills */}
              <div className="flex rounded-lg border border-slate-800 overflow-hidden text-xs">
                {(['all', 'on', 'off'] as const).map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setShowOnly(v)}
                    className={`px-2.5 py-1 transition-colors ${
                      showOnly === v
                        ? 'bg-slate-700 text-slate-200'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {v === 'all'
                      ? `All ${result.flags.length}`
                      : v === 'on'
                      ? `On ${onCount}`
                      : `Off ${offCount}`}
                  </button>
                ))}
              </div>

              {/* Flag search */}
              <div className="relative flex-1 min-w-[160px]">
                <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                <Input
                  value={flagFilter}
                  onChange={e => setFlagFilter(e.target.value)}
                  placeholder="Filter flags…"
                  className="pl-7 text-xs py-1"
                />
              </div>

              <span className="text-xs text-slate-600 shrink-0">
                {result.environment.name}
              </span>
            </div>
          )}

          {/* Flag results */}
          {result.flags.length === 0 ? (
            <Empty
              icon={<Search size={20} />}
              title="No flags in this environment"
              description="Create a flag to see how it evaluates for a given context."
            />
          ) : filteredFlags.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              No flags match the current filter.
            </p>
          ) : (
            <div className="space-y-1.5">
              {filteredFlags.map(f => <LookupRow key={f.key} flag={f} context={context} />)}
            </div>
          )}

          {result.flags.length > 0 && (
            <p className="text-xs text-slate-700">
              {onCount} on · {offCount} off
              {(flagFilter || showOnly !== 'all') && ` · ${filteredFlags.length} shown`}
            </p>
          )}
        </>
      )}
    </div>
  )
}

// ─── Flag result row ───────────────────────────────────────────
function LookupRow({ flag, context }: { flag: LookupFlag; context: Record<string, string> }) {
  const [expanded, setExpanded] = useState(false)
  const explanation = explain(flag)
  const isMissing = flag.reason === 'MISSING_BUCKET_ATTRIBUTE'

  return (
    <Card className={`p-0 overflow-hidden ${isMissing ? 'border-amber-500/30' : ''}`}>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full text-left px-3 py-2.5 flex items-start gap-3 hover:bg-slate-800/30 transition-colors"
      >
        {/* Status dot */}
        <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${
          flag.enabled ? 'bg-emerald-400' : 'bg-slate-600'
        }`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-200 truncate">{flag.name}</span>
            <code className="text-[10px] text-slate-600 font-mono hidden sm:inline truncate">{flag.key}</code>
          </div>
          <p className={`text-xs mt-0.5 truncate ${isMissing ? 'text-amber-400' : 'text-slate-500'}`}>
            {explanation}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={flag.enabled ? 'green' : 'slate'}>
            {flag.enabled ? 'on' : 'off'}
          </Badge>
          {expanded
            ? <ChevronUp size={12} className="text-slate-600" />
            : <ChevronDown size={12} className="text-slate-600" />
          }
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-800 px-3 py-2.5 space-y-2 bg-slate-900/40">
          {/* Reason */}
          <div className="flex gap-2">
            <span className="text-[10px] text-slate-600 uppercase tracking-wide w-16 shrink-0 mt-0.5">Reason</span>
            <code className="text-xs font-mono text-slate-400">{flag.reason}</code>
          </div>

          {/* Rule matched */}
          {flag.rule_id && (
            <div className="flex gap-2">
              <span className="text-[10px] text-slate-600 uppercase tracking-wide w-16 shrink-0 mt-0.5">Rule</span>
              <span className="text-xs text-slate-400">{flag.rule_description ?? flag.rule_id}</span>
            </div>
          )}

          {/* Bucket arithmetic when rollout decided */}
          {flag.bucket !== undefined && flag.rollout_pct != null && (
            <div className="flex gap-2">
              <span className="text-[10px] text-slate-600 uppercase tracking-wide w-16 shrink-0 mt-0.5">Bucket</span>
              <span className="text-xs text-slate-400 font-mono">
                {flag.bucket} / 100
                {' '}·{' '}
                rollout is {flag.rollout_pct}%
                {' '}·{' '}
                <span className={flag.bucket < flag.rollout_pct ? 'text-emerald-400' : 'text-slate-500'}>
                  {flag.bucket < flag.rollout_pct ? 'inside' : 'outside'}
                </span>
              </span>
            </div>
          )}

          {/* Value when on */}
          {flag.enabled && flag.value != null && (
            <div className="flex gap-2">
              <span className="text-[10px] text-slate-600 uppercase tracking-wide w-16 shrink-0 mt-0.5">Value</span>
              <code className="text-xs font-mono text-slate-300 break-all">
                {JSON.stringify(flag.value)}
              </code>
            </div>
          )}

          {/* Missing attribute hint */}
          {isMissing && (
            <div className="rounded-md bg-amber-500/5 border border-amber-500/20 px-2.5 py-2 text-xs text-amber-300">
              Add <code className="font-mono">{flag.bucket_by}</code> to the context above to evaluate this flag properly.
            </div>
          )}

          {/* Context used */}
          <div className="flex gap-2">
            <span className="text-[10px] text-slate-600 uppercase tracking-wide w-16 shrink-0 mt-0.5">Context</span>
            <div className="flex flex-wrap gap-1">
              {Object.entries(context).map(([k, v]) => (
                <span key={k} className="text-[10px] font-mono bg-slate-800 text-slate-400 rounded px-1.5 py-0.5">
                  {k}={v}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

// ─── Explanation text ──────────────────────────────────────────
function explain(f: LookupFlag): string {
  const rule = f.rule_description ?? f.rule_id
  const unit = f.bucket_by === 'tenantId' ? 'organisation' : 'user'
  const math =
    f.bucket !== undefined && f.rollout_pct != null
      ? ` — bucket ${f.bucket} of ${f.rollout_pct}%`
      : ''

  switch (f.reason) {
    case 'KILL_SWITCH':
      return 'Flag is off for this entire environment.'
    case 'TARGETING_MATCH':
      return `Matched rule "${rule}"${math}.`
    case 'TARGETING_MATCH_ROLLOUT_EXCLUDED':
      return `Matched rule "${rule}" but outside its rollout${math}.`
    case 'DEFAULT_ROLLOUT_INCLUDED':
      return `No rule matched — inside the default rollout${math}.`
    case 'DEFAULT_ROLLOUT_EXCLUDED':
      return `No rule matched — outside the default rollout${math}.`
    case 'MISSING_BUCKET_ATTRIBUTE':
      return `Needs ${f.bucket_by} in context to evaluate rollout. Served off.`
    case 'DEFAULT':
      return 'On for everyone in this environment.'
    default:
      return f.reason
  }
}
