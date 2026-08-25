import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Users, Mail, Plus, Trash2, ChevronDown, Check, Copy, Crown, Shield, Eye, Edit3 } from 'lucide-react'
import { team as teamApi, TeamMember, PendingInvite, OrgSummary, setActiveOrg, getActiveOrg } from '../lib/api'
import { useAuth, useRole } from '../context/AuthContext'
import {
  Button, Card, Input, Label, FormGroup, Modal, Empty,
  ErrorMsg, Spinner, Select, Badge,
} from '../components/ui'

const ROLES = ['admin', 'editor', 'viewer'] as const
type Role = typeof ROLES[number]

const ROLE_META: Record<Role, { label: string; icon: React.ReactNode; description: string }> = {
  admin:  { label: 'Admin',  icon: <Shield size={12} />,  description: 'Can manage flags, environments, members, and invites' },
  editor: { label: 'Editor', icon: <Edit3 size={12} />,   description: 'Can create and edit flags and segments' },
  viewer: { label: 'Viewer', icon: <Eye size={12} />,     description: 'Read-only access to flags and audit log' },
}

// ─── Team page ────────────────────────────────────────────────
export function TeamPage() {
  const { canAdmin } = useRole()
  const [members, setMembers]     = useState<TeamMember[]>([])
  const [invites, setInvites]     = useState<PendingInvite[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [inviting, setInviting]   = useState(false)

  async function load() {
    setLoading(true)
    try {
      const r = await teamApi.list()
      setMembers(r.members); setInvites(r.invites); setError(null)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleRevoke(id: string) {
    try { await teamApi.revokeInvite(id); load() }
    catch (e: any) { setError(e.message) }
  }

  async function handleRoleChange(userId: string, role: string) {
    try { await teamApi.changeRole(userId, role); load() }
    catch (e: any) { setError(e.message) }
  }

  async function handleRemove(userId: string) {
    if (!confirm('Remove this member? They will lose access immediately.')) return
    try { await teamApi.removeMember(userId); load() }
    catch (e: any) { setError(e.message) }
  }

  if (loading) return <div className="flex-1 flex justify-center py-32"><Spinner size={24} /></div>

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="w-full max-w-4xl px-4 py-6 sm:px-8 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-medium text-slate-100">Team</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage who has access to this organisation.
          </p>
        </div>
        {canAdmin && (
          <Button className="shrink-0" icon={<Plus size={13} />} onClick={() => setInviting(true)}>
            Invite member
          </Button>
        )}
      </div>

      <ErrorMsg message={error} />

      {/* Members */}
      <section className="space-y-2">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
          Members — {members.length}
        </p>
        {members.length === 0 ? (
          <Empty icon={<Users size={18} />} title="No members" description="Invite your first teammate." />
        ) : (
          <div className="space-y-1.5">
            {members.map(m => (
              <MemberRow
                key={m.user_id}
                member={m}
                canManage={canAdmin}
                onRoleChange={role => handleRoleChange(m.user_id, role)}
                onRemove={() => handleRemove(m.user_id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Pending invites */}
      {invites.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Pending invites — {invites.length}
          </p>
          <div className="space-y-1.5">
            {invites.map(inv => (
              <InviteRow key={inv.id} invite={inv} onRevoke={() => handleRevoke(inv.id)} />
            ))}
          </div>
        </section>
      )}

      <InviteModal
        open={inviting}
        onClose={() => setInviting(false)}
        onInvited={load}
      />
      </div>
    </div>
  )
}

// ─── Member row ───────────────────────────────────────────────
function MemberRow({ member, canManage, onRoleChange, onRemove }: {
  member: TeamMember
  canManage: boolean
  onRoleChange: (role: string) => void
  onRemove: () => void
}) {
  const isOwner = member.role === 'owner'
  const meta = ROLE_META[member.role as Role] ?? ROLE_META.viewer

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-xs font-medium text-violet-300 shrink-0">
          {member.email?.[0]?.toUpperCase() ?? '?'}
        </div>

        {/* Email + joined */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-slate-200 truncate">{member.email ?? member.user_id}</span>
            {member.is_current && (
              <span className="text-[10px] text-slate-600 shrink-0">(you)</span>
            )}
          </div>
        </div>

        {/* Role */}
        {isOwner ? (
          <div className="flex items-center gap-1 text-xs text-amber-400 shrink-0">
            <Crown size={12} /> Owner
          </div>
        ) : (
          <div className="w-28 shrink-0">
            <RoleSelect
              value={member.role}
              onChange={onRoleChange}
              disabled={!canManage || member.is_current}
            />
          </div>
        )}

        {/* Remove */}
        {canManage && !member.is_current && (
          <button
            type="button"
            aria-label={`Remove ${member.email}`}
            onClick={onRemove}
            className="text-slate-700 hover:text-red-400 transition-colors shrink-0"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </Card>
  )
}

// ─── Role select ──────────────────────────────────────────────
function RoleSelect({ value, onChange, disabled }: {
  value: string; onChange: (r: string) => void; disabled?: boolean
}) {
  return (
    <Select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className="text-xs"
    >
      {ROLES.map(r => (
        <option key={r} value={r}>{ROLE_META[r].label}</option>
      ))}
    </Select>
  )
}

// ─── Pending invite row ───────────────────────────────────────
function InviteRow({ invite, onRevoke }: {
  invite: PendingInvite; onRevoke: () => void
}) {
  const expiresIn = Math.ceil(
    (new Date(invite.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )

  return (
    <Card className="p-0 overflow-hidden border-slate-800/60">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
          <Mail size={13} className="text-slate-500" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm text-slate-400 truncate block">{invite.email}</span>
          <span className="text-[11px] text-slate-600">
            Expires in {expiresIn}d · {ROLE_META[invite.role as Role]?.label ?? invite.role}
          </span>
        </div>
        <Badge variant="amber">Pending</Badge>
        <button
          type="button"
          aria-label={`Revoke invite for ${invite.email}`}
          onClick={onRevoke}
          className="text-slate-700 hover:text-red-400 transition-colors shrink-0"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </Card>
  )
}

// ─── Invite modal ─────────────────────────────────────────────
function InviteModal({ open, onClose, onInvited }: {
  open: boolean; onClose: () => void; onInvited: () => void
}) {
  const [email, setEmail]   = useState('')
  const [role, setRole]     = useState<Role>('editor')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [link, setLink]     = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function submit() {
    setSaving(true); setError(null)
    try {
      const r = await teamApi.invite(email.trim().toLowerCase(), role)
      setLink(r.inviteLink)
      // Don't call onInvited() yet — keep the modal open so the user
      // can see and copy the link first. Called on Done instead.
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  function copyLink() {
    if (!link) return
    navigator.clipboard.writeText(link).catch(() => {
      // Fallback: select the input so the user can copy manually
      const input = document.querySelector<HTMLInputElement>('input[readonly]')
      input?.select()
    })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function close() {
    const wasInvited = !!link
    setEmail(''); setRole('editor'); setLink(null); setError(null); setCopied(false)
    onClose()
    // Refresh the member list only after the user dismisses, not before —
    // calling onInvited() immediately was causing the modal to re-render
    // and reset before the user could see or copy the link.
    if (wasInvited) onInvited()
  }

  return (
    <Modal open={open} onClose={close} title="Invite a teammate" width="max-w-md">
      <div className="space-y-4">
        <ErrorMsg message={error} />

        {link ? (
          // Step 2 — show the invite link
          <div className="space-y-3">
            <p className="text-sm text-slate-300">
              Invite sent to <span className="text-slate-100 font-medium">{email}</span>.
            </p>
            <p className="text-xs text-slate-500">
              Share this link if they don't receive the email:
            </p>
            <div className="flex gap-2">
              <Input
                value={link}
                readOnly
                className="font-mono text-xs flex-1 bg-slate-900"
                onClick={e => (e.target as HTMLInputElement).select()}
              />
              <Button size="sm" onClick={copyLink} icon={copied ? <Check size={12} /> : <Copy size={12} />}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <div className="pt-1">
              <Button variant="ghost" onClick={close}>Done</Button>
            </div>
          </div>
        ) : (
          // Step 1 — compose invite
          <>
            <FormGroup>
              <Label required>Email address</Label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && email && submit()}
                placeholder="colleague@company.com"
                autoFocus
              />
            </FormGroup>

            <FormGroup>
              <Label>Role</Label>
              <div className="space-y-1.5">
                {ROLES.map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                      role === r
                        ? 'border-violet-500 bg-violet-500/10'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium flex items-center gap-1 ${role === r ? 'text-violet-300' : 'text-slate-300'}`}>
                        {ROLE_META[r].icon} {ROLE_META[r].label}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">{ROLE_META[r].description}</p>
                  </button>
                ))}
              </div>
            </FormGroup>

            <div className="flex gap-2">
              <Button loading={saving} disabled={!email.trim()} onClick={submit}>
                Send invite
              </Button>
              <Button variant="ghost" onClick={close}>Cancel</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

// ─── Org switcher (used in Sidebar) ──────────────────────────
export function OrgSwitcher({ currentOrgId }: { currentOrgId?: string }) {
  const [orgs, setOrgs]   = useState<OrgSummary[]>([])
  const [open, setOpen]   = useState(false)
  const current = orgs.find(o => o.id === (currentOrgId ?? getActiveOrg()))

  useEffect(() => {
    teamApi.listOrgs()
      .then(r => setOrgs(r.orgs))
      .catch(() => {})
  }, [])

  if (orgs.length <= 1) return null

  function switchOrg(org: OrgSummary) {
    setActiveOrg(org.id)
    setOpen(false)
    // Reload so all cached API data is refreshed for the new org.
    window.location.reload()
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
      >
        <span className="truncate max-w-[120px]">{current?.name ?? 'Select org'}</span>
        <ChevronDown size={11} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-7 z-20 w-52 rounded-lg border border-slate-700 bg-slate-900 shadow-xl py-1">
            {orgs.map(org => (
              <button
                key={org.id}
                type="button"
                onClick={() => switchOrg(org)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-800 transition-colors flex items-center justify-between gap-2"
              >
                <span className="truncate text-slate-300">{org.name}</span>
                {org.id === (currentOrgId ?? getActiveOrg()) && (
                  <Check size={11} className="text-violet-400 shrink-0" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Accept invite page ───────────────────────────────────────
export function AcceptInvitePage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [error, setError]   = useState<string | null>(null)
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  // Use React Router's useSearchParams — reliable after a soft navigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  useEffect(() => {
    if (authLoading) return  // wait for auth to resolve

    if (!token) { setStatus('error'); setError('No invite token found in URL.'); return }

    if (!user) {
      // Use navigate() not window.location.href — keeps React Router's
      // history intact so the token survives through login → signup → back.
      const returnTo = encodeURIComponent(`/accept-invite?token=${token}`)
      navigate(`/signup?returnTo=${returnTo}`, { replace: true })
      return
    }

    teamApi.acceptInvite(token)
      .then(r => {
        setActiveOrg(r.org_id)
        setStatus('success')
      })
      .catch(e => { setStatus('error'); setError(e.message) })
  }, [user, authLoading, token])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size={24} />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-6 max-w-sm text-center space-y-3">
          <p className="text-slate-300 font-medium">Invite not valid</p>
          <p className="text-sm text-slate-500">{error}</p>
          <p className="text-xs text-slate-600">The invite may have expired or already been used.</p>
          <Button onClick={() => window.location.href = '/'}>Go to dashboard</Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="p-6 max-w-sm text-center space-y-3">
        <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto">
          <Check size={18} className="text-emerald-400" />
        </div>
        <p className="text-slate-200 font-medium">You're in!</p>
        <p className="text-sm text-slate-500">You've joined the organisation successfully.</p>
        <Button onClick={() => window.location.href = '/'}>Go to dashboard</Button>
      </Card>
    </div>
  )
}
