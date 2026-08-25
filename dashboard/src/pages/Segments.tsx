import { useEffect, useRef, useState, useMemo } from 'react'
import { Plus, Users, X, Search, Upload, Trash2, ChevronRight, Copy, Check } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { segments as segmentsApi, Segment, SegmentMember } from '../lib/api'
import { useRole } from '../context/AuthContext'
import {
  Button, Card, Input, Label, FormGroup, Modal, Empty,
  ErrorMsg, Spinner, Textarea, Badge,
} from '../components/ui'

const PAGE_SIZE = 100   // members rendered per virtual page

// ─── Segments list page ───────────────────────────────────────
export function SegmentsPage() {
  const { canWrite, canAdmin } = useRole()
  const [segments, setSegments]   = useState<Segment[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [creating, setCreating]   = useState(false)
  const [open, setOpen]           = useState<Segment | null>(null)
  const [search, setSearch]       = useState('')
  const [deleting, setDeleting]   = useState<Segment | null>(null)

  async function load() {
    setLoading(true)
    try { setSegments((await segmentsApi.list()).segments); setError(null) }
    catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleDelete(seg: Segment) {
    try {
      await segmentsApi.delete(seg.id)
      setDeleting(null)
      load()
    } catch (e: any) { setError(e.message) }
  }

  const filtered = useMemo(() =>
    search
      ? segments.filter(s =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.key.toLowerCase().includes(search.toLowerCase()) ||
          (s.description ?? '').toLowerCase().includes(search.toLowerCase())
        )
      : segments
  , [segments, search])

  if (loading) return <div className="flex-1 flex justify-center py-32"><Spinner size={24} /></div>

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="w-full max-w-4xl px-4 py-6 sm:px-8 space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-medium text-slate-100">Segments</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Named groups of organisations you can target flags at.
          </p>
        </div>
        {canWrite && (
          <Button className="shrink-0" icon={<Plus size={13} />} onClick={() => setCreating(true)}>
            New segment
          </Button>
        )}
      </div>

      <ErrorMsg message={error} />

      {/* Search */}
      {segments.length > 4 && (
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search segments…"
            className="pl-7 text-xs"
          />
        </div>
      )}

      {/* List */}
      {segments.length === 0 ? (
        <Empty
          icon={<Users size={20} />}
          title="No segments yet"
          description="Create a segment to turn a feature on for specific organisations without touching everyone."
          action={<Button icon={<Plus size={13} />} onClick={() => setCreating(true)}>New segment</Button>}
        />
      ) : filtered.length === 0 ? (
        <p className="text-xs text-slate-500 py-8 text-center">No segments match "{search}".</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(seg => (
            <Card key={seg.id} className="p-0 overflow-hidden">
              <div className="flex items-stretch">
                {/* Main click target */}
                <button
                  type="button"
                  onClick={() => setOpen(seg)}
                  className="flex-1 text-left px-4 py-3 hover:bg-slate-800/40 transition-colors group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-md bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                      <Users size={13} className="text-violet-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-200 truncate">{seg.name}</span>
                        <code className="text-[10px] text-slate-600 font-mono hidden sm:inline">{seg.key}</code>
                      </div>
                      {seg.description && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">{seg.description}</p>
                      )}
                    </div>
                  </div>
                </button>

                {/* Right side — count + actions */}
                <div className="flex items-center gap-3 px-4 border-l border-slate-800">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-medium text-slate-300">{(seg.member_count ?? 0).toLocaleString()}</p>
                    <p className="text-[10px] text-slate-600">{seg.member_count === 1 ? 'org' : 'orgs'}</p>
                  </div>
                  <Badge variant="slate">
                    {(seg.member_count ?? 0).toLocaleString()}
                  </Badge>
                  {canAdmin && (
                    <button
                      type="button"
                      aria-label={`Delete ${seg.name}`}
                      onClick={e => { e.stopPropagation(); setDeleting(seg) }}
                      className="text-slate-700 hover:text-red-400 transition-colors p-1"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                  <ChevronRight size={13} className="text-slate-700" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {segments.length > 0 && (
        <p className="text-xs text-slate-700">
          {segments.length} {segments.length === 1 ? 'segment' : 'segments'}
          {search && ` · ${filtered.length} shown`}
        </p>
      )}

      {/* Modals */}
      <CreateSegmentModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => { setCreating(false); load() }}
      />

      {open && (
        <SegmentDetailModal
          segment={open}
          canWrite={canWrite}
          onClose={() => { setOpen(null); load() }}
        />
      )}

      {deleting && (
        <ConfirmDeleteModal
          segment={deleting}
          onConfirm={() => handleDelete(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
      </div>
    </div>
  )
}

// ─── Create segment modal ─────────────────────────────────────
function CreateSegmentModal({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: () => void
}) {
  const [name, setName]           = useState('')
  const [key, setKey]             = useState('')
  const [description, setDesc]    = useState('')
  const [members, setMembers]     = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)

  function handleNameChange(v: string) {
    setName(v)
    setKey(prev => prev === '' || prev === slugify(name) ? slugify(v) : prev)
  }

  async function submit() {
    setSaving(true); setError(null)
    try {
      await segmentsApi.create({
        key, name,
        description: description || undefined,
        entity_keys: parseKeys(members),
      })
      setName(''); setKey(''); setDesc(''); setMembers('')
      onCreated()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const parsedCount = parseKeys(members).length

  return (
    <Modal open={open} onClose={onClose} title="New segment">
      <div className="space-y-3">
        <ErrorMsg message={error} />
        <FormGroup>
          <Label required>Name</Label>
          <Input value={name} onChange={e => handleNameChange(e.target.value)} placeholder="Design partners" autoFocus />
        </FormGroup>
        <FormGroup>
          <Label required>Key</Label>
          <Input value={key} onChange={e => setKey(slugify(e.target.value))} placeholder="design-partners" className="font-mono" />
          <p className="text-[11px] text-slate-600 mt-1">Used in targeting rules and the SDK. Cannot be changed later.</p>
        </FormGroup>
        <FormGroup>
          <Label>Description</Label>
          <Input value={description} onChange={e => setDesc(e.target.value)} placeholder="Early access customers" />
        </FormGroup>
        <FormGroup>
          <Label>Seed with organisation IDs <span className="text-slate-600 font-normal">(optional)</span></Label>
          <Textarea
            rows={4}
            value={members}
            onChange={e => setMembers(e.target.value)}
            placeholder={'acme-corp\nglobex\ninitech'}
            className="font-mono text-xs"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            One per line or comma-separated. Match the <code className="text-slate-400">tenantId</code> your SDK sends.
            {parsedCount > 0 && <span className="text-violet-400 ml-1">{parsedCount} will be added.</span>}
          </p>
        </FormGroup>
        <div className="flex gap-2 pt-1">
          <Button loading={saving} disabled={!name || !key} onClick={submit}>Create segment</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Segment detail / members modal ──────────────────────────
function SegmentDetailModal({ segment, canWrite, onClose }: {
  segment: Segment; canWrite: boolean; onClose: () => void
}) {
  const [members, setMembers]   = useState<SegmentMember[]>([])
  const [loading, setLoading]   = useState(true)
  const [adding, setAdding]     = useState('')
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [search, setSearch]     = useState('')
  const [page, setPage]         = useState(0)
  const [copied, setCopied]     = useState(false)
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  async function load() {
    setLoading(true)
    try { setMembers((await segmentsApi.members(segment.id)).members); setError(null) }
    catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [segment.id])
  // Reset page when search changes
  useEffect(() => { setPage(0) }, [search])

  const filtered = useMemo(() =>
    search
      ? members.filter(m => m.entity_key.toLowerCase().includes(search.toLowerCase()))
      : members
  , [members, search])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const shown = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  async function addSingle() {
    const keys = parseKeys(adding)
    if (!keys.length) return
    setBusy(true); setError(null)
    try {
      await segmentsApi.addMembers(segment.id, keys)
      setAdding('')
      await load()
    } catch (e: any) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function addBulk() {
    const keys = parseKeys(bulkText)
    if (!keys.length) return
    setBusy(true); setError(null)
    try {
      await segmentsApi.addMembers(segment.id, keys)
      setBulkText(''); setBulkMode(false)
      await load()
    } catch (e: any) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function removeOne(entityKey: string) {
    setBusy(true); setError(null)
    try { await segmentsApi.removeMembers(segment.id, [entityKey]); await load() }
    catch (e: any) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function removeSelected() {
    if (!selected.size) return
    setBusy(true); setError(null)
    try {
      await segmentsApi.removeMembers(segment.id, [...selected])
      setSelected(new Set())
      await load()
    } catch (e: any) { setError(e.message) }
    finally { setBusy(false) }
  }

  function toggleSelect(key: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function copyAll() {
    navigator.clipboard.writeText(members.map(m => m.entity_key).join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const bulkCount = parseKeys(bulkText).length

  return (
    <Modal open onClose={onClose} title={segment.name} width="max-w-2xl">
      <div className="space-y-3">
        {/* Segment meta */}
        <div className="flex items-center gap-3 pb-2 border-b border-slate-800">
          <code className="text-[11px] font-mono text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">{segment.key}</code>
          {segment.description && <p className="text-xs text-slate-500 truncate">{segment.description}</p>}
          <span className="ml-auto text-xs text-slate-500 shrink-0">
            {members.length.toLocaleString()} {members.length === 1 ? 'org' : 'orgs'}
          </span>
        </div>

        <ErrorMsg message={error} />

        {/* Add — single line or bulk */}
        {bulkMode ? (
          <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-900/40 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <Upload size={12} /> Bulk import
              </p>
              <button type="button" onClick={() => setBulkMode(false)} className="text-slate-600 hover:text-slate-400">
                <X size={13} />
              </button>
            </div>
            <Textarea
              rows={6}
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              placeholder={'acme-corp\nglobex\ninitech\n...'}
              className="font-mono text-xs"
              autoFocus
            />
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-slate-600">
                {bulkCount > 0
                  ? <span className="text-violet-400">{bulkCount} organisations will be added</span>
                  : 'One per line or comma-separated'}
              </p>
              <div className="flex gap-2">
                <Button size="sm" loading={busy} disabled={!bulkCount} onClick={addBulk}>
                  Add {bulkCount > 0 ? bulkCount.toLocaleString() : ''}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setBulkMode(false)}>Cancel</Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              value={adding}
              onChange={e => setAdding(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSingle()}
              placeholder="org-id or comma-separated list"
              className="font-mono text-xs flex-1"
            />
            <Button loading={busy} disabled={!adding.trim()} onClick={addSingle}>Add</Button>
            <button
              type="button"
              title="Bulk import"
              onClick={() => setBulkMode(true)}
              className="px-2.5 rounded-lg border border-slate-700 text-slate-500 hover:text-violet-400 hover:border-violet-500/40 transition-colors"
            >
              <Upload size={13} />
            </button>
          </div>
        )}

        {/* Selected actions bar */}
        {selected.size > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-violet-500/10 border border-violet-500/20 px-3 py-2">
            <span className="text-xs text-violet-300">{selected.size} selected</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
              <Button size="sm" loading={busy} onClick={removeSelected}
                className="!text-red-400 hover:!bg-red-500/10">
                Remove {selected.size}
              </Button>
            </div>
          </div>
        )}

        {/* Search + toolbar */}
        {members.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={`Search ${members.length.toLocaleString()} organisations…`}
                className="pl-7 text-xs"
              />
            </div>
            <button
              type="button"
              title="Copy all IDs"
              onClick={copyAll}
              className="px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1.5 text-xs"
            >
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy all'}
            </button>
          </div>
        )}

        {/* Member list */}
        {loading ? (
          <div className="flex justify-center py-10"><Spinner size={20} /></div>
        ) : members.length === 0 ? (
          <div className="py-8 text-center">
            <Users size={20} className="text-slate-700 mx-auto mb-2" />
            <p className="text-xs text-slate-500">No organisations yet.</p>
            <p className="text-xs text-slate-600 mt-0.5">Add IDs above or use the bulk import button.</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">No organisations match "{search}".</p>
        ) : (
          <>
            {/* Virtualised page — renders max PAGE_SIZE rows at a time */}
            <div className="rounded-lg border border-slate-800 overflow-hidden">
              {/* Column headers */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border-b border-slate-800">
                <input
                  type="checkbox"
                  className="accent-violet-500"
                  checked={shown.length > 0 && shown.every(m => selected.has(m.entity_key))}
                  onChange={e => {
                    const next = new Set(selected)
                    shown.forEach(m => e.target.checked ? next.add(m.entity_key) : next.delete(m.entity_key))
                    setSelected(next)
                  }}
                />
                <span className="text-[10px] text-slate-600 uppercase tracking-wide flex-1">Organisation ID</span>
                <span className="text-[10px] text-slate-600 uppercase tracking-wide hidden sm:block w-28 text-right">Added</span>
                <span className="w-5" />
              </div>

              {/* Rows */}
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/60">
                {shown.map(m => (
                  <div
                    key={m.entity_key}
                    className={`flex items-center gap-2 px-3 py-2 transition-colors ${
                      selected.has(m.entity_key) ? 'bg-violet-500/5' : 'hover:bg-slate-800/30'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="accent-violet-500 shrink-0"
                      checked={selected.has(m.entity_key)}
                      onChange={() => toggleSelect(m.entity_key)}
                    />
                    <code className="text-xs text-slate-300 font-mono flex-1 truncate">
                      {m.entity_key}
                    </code>
                    <span className="text-[10px] text-slate-600 hidden sm:block w-28 text-right shrink-0">
                      {formatDistanceToNow(new Date(m.added_at), { addSuffix: true })}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${m.entity_key}`}
                      disabled={busy}
                      onClick={() => removeOne(m.entity_key)}
                      className="text-slate-700 hover:text-red-400 disabled:opacity-30 transition-colors shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-600">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString()}
                  {search && ` matching "${search}"`}
                </p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={page === 0}
                    onClick={() => setPage(p => p - 1)}
                    className="px-2 py-1 text-xs rounded border border-slate-700 text-slate-400 disabled:opacity-30 hover:border-slate-600 transition-colors"
                  >← Prev</button>
                  <button
                    type="button"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(p => p + 1)}
                    className="px-2 py-1 text-xs rounded border border-slate-700 text-slate-400 disabled:opacity-30 hover:border-slate-600 transition-colors"
                  >Next →</button>
                </div>
              </div>
            )}

            <p className="text-xs text-slate-700">
              {members.length.toLocaleString()} {members.length === 1 ? 'organisation' : 'organisations'} total
              {search && ` · ${filtered.length.toLocaleString()} shown`}
              {selected.size > 0 && ` · ${selected.size} selected`}
            </p>
          </>
        )}

        <div className="pt-1 border-t border-slate-800">
          <Button variant="ghost" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Confirm delete modal ─────────────────────────────────────
function ConfirmDeleteModal({ segment, onConfirm, onCancel }: {
  segment: Segment; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <Modal open onClose={onCancel} title="Delete segment" width="max-w-sm">
      <div className="space-y-4">
        <p className="text-sm text-slate-300">
          Delete <span className="font-medium text-slate-100">{segment.name}</span>?
        </p>
        <p className="text-xs text-slate-500">
          Any targeting rules that reference{' '}
          <code className="text-slate-400">{segment.key}</code> will stop matching.
          This cannot be undone.
        </p>
        <div className="flex gap-2">
          <Button onClick={onConfirm} className="!bg-red-500/10 !text-red-400 hover:!bg-red-500/20 border !border-red-500/20">
            Delete segment
          </Button>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Utilities ────────────────────────────────────────────────
function slugify(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function parseKeys(raw: string): string[] {
  const seen = new Set<string>()
  for (const part of raw.split(/[\n,\s]+/)) {
    const k = part.trim()
    if (k) seen.add(k)
  }
  return [...seen]
}
