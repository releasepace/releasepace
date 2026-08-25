const API = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8787' : '')

if (!API) throw new Error('VITE_API_URL is required for production builds')

let _token: string | null = localStorage.getItem('rp_token')
let _orgId: string | null = localStorage.getItem('rp_org_id')

export function setActiveOrg(id: string | null) {
  _orgId = id
  sessionStorage.removeItem('rp_role')
  if (id) localStorage.setItem('rp_org_id', id)
  else localStorage.removeItem('rp_org_id')
}

export function getActiveOrg() { return _orgId }

export function setToken(t: string | null) {
  _token = t
  if (t) localStorage.setItem('rp_token', t)
  else localStorage.removeItem('rp_token')
}

export function getToken() { return _token }

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ..._token ? { Authorization: `Bearer ${_token}` } : {},
      ...(_orgId && path.startsWith('/api/admin/')) ? { 'X-Org-Id': _orgId } : {},
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`)
  return data as T
}

// ── Auth ──────────────────────────────────────────────────────
export const auth = {
  checkOrg: (name: string) =>
    request<{ matches: string[] }>('GET', `/api/auth/check-org?name=${encodeURIComponent(name)}`),
  invite: (token: string) =>
    request<{ email: string }>('GET', `/api/auth/invite?token=${encodeURIComponent(token)}`),
  signup: (email: string, password: string, org_name?: string) =>
    request<{ access_token: string; user: User }>('POST', '/api/auth/signup', { email, password, ...(org_name ? { org_name } : {}) }),
  login: (email: string, password: string) =>
    request<{ access_token: string; user: User }>('POST', '/api/auth/login', { email, password }),
}

// ── Flags ─────────────────────────────────────────────────────
export const flags = {
  list: (params?: { q?: string; archived?: boolean; page?: number }) => {
    const qs = new URLSearchParams()
    if (params?.q) qs.set('q', params.q)
    if (params?.archived) qs.set('archived', 'true')
    if (params?.page) qs.set('page', String(params.page))
    return request<{ flags: Flag[]; total: number }>('GET', `/api/admin/flags?${qs}`)
  },
  get: (id: string) => request<Flag>('GET', `/api/admin/flags/${id}`),
  create: (body: CreateFlagBody) => request<Flag>('POST', '/api/admin/flags', body),
  update: (id: string, body: Partial<Flag>) => request<Flag>('PATCH', `/api/admin/flags/${id}`, body),
  setState: (id: string, body: SetStateBody) => request<FlagState>('PUT', `/api/admin/flags/${id}/state`, body),
  archive: (id: string) => request<{ archived: boolean }>('DELETE', `/api/admin/flags/${id}`),
}

// ── Environments ──────────────────────────────────────────────
export const environments = {
  list: () => request<Environment[]>('GET', '/api/admin/environments'),
  create: (body: { name: string; slug: string; color: string }) =>
    request<Environment>('POST', '/api/admin/environments', body),
  update: (id: string, body: { name?: string; color?: string }) =>
    request<Environment>('PATCH', `/api/admin/environments/${id}`, body),
  delete: (id: string) => request<{ deleted: boolean }>('DELETE', `/api/admin/environments/${id}`),
}

// ── API Keys ──────────────────────────────────────────────────
export interface LookupFlag {
  key: string; name: string; type: string
  enabled: boolean; value: unknown
  reason: string
  rule_id?: string
  rule_description?: string
  rollout_pct?: number | null
  bucket_by?: BucketBy | null
  bucket?: number
}

export interface LookupResult {
  environment: { id: string; slug: string; name: string }
  context: Record<string, string>
  segments: { key: string; name: string }[]
  flags: LookupFlag[]
}

export const lookup = {
  run: (body: { environment_id?: string; context: Record<string, string> }) =>
    request<LookupResult>('POST', '/api/admin/lookup', body),
}

export interface TeamMember {
  user_id: string; email: string | null; role: string
  joined_at: string; is_current: boolean
}

export interface PendingInvite {
  id: string; email: string; role: string
  created_at: string; expires_at: string
}

export interface OrgSummary {
  id: string; name: string; slug: string; plan: string; role: string
}

export const me = {
  get: () => request<{ role: string; org_id: string; user_id: string; email: string }>('GET', '/api/admin/me'),
}

export const team = {
  list:          () => request<{ members: TeamMember[]; invites: PendingInvite[] }>('GET', '/api/admin/team'),
  invite:        (email: string, role: string) => request<{ invite: PendingInvite; inviteLink: string; org: string }>('POST', '/api/admin/team/invite', { email, role }),
  revokeInvite:  (id: string) => request<{ revoked: boolean }>('DELETE', `/api/admin/team/invite/${id}`),
  changeRole:    (userId: string, role: string) => request<{ updated: boolean }>('PATCH', `/api/admin/team/members/${userId}`, { role }),
  removeMember:  (userId: string) => request<{ removed: boolean }>('DELETE', `/api/admin/team/members/${userId}`),
  acceptInvite:  (token: string) => request<{ org_id: string }>('POST', '/api/admin/team/accept', { token }),
  listOrgs:      () => request<{ orgs: OrgSummary[] }>('GET', '/api/admin/team/orgs'),
}

export const segments = {
  list: () => request<{ segments: Segment[] }>('GET', '/api/admin/segments'),
  get: (id: string) => request<Segment>('GET', `/api/admin/segments/${id}`),
  create: (body: { key: string; name: string; description?: string; entity_keys?: string[] }) =>
    request<Segment>('POST', '/api/admin/segments', body),
  update: (id: string, body: { name?: string; description?: string }) =>
    request<Segment>('PATCH', `/api/admin/segments/${id}`, body),
  delete: (id: string) => request<{ deleted: boolean }>('DELETE', `/api/admin/segments/${id}`),
  members: (id: string) =>
    request<{ members: SegmentMember[] }>('GET', `/api/admin/segments/${id}/members`),
  addMembers: (id: string, entity_keys: string[]) =>
    request<{ added: number }>('POST', `/api/admin/segments/${id}/members`, { entity_keys }),
  removeMembers: (id: string, entity_keys: string[]) =>
    request<{ removed: number }>('DELETE', `/api/admin/segments/${id}/members`, { entity_keys }),
}

export const apiKeys = {
  list: () => request<ApiKey[]>('GET', '/api/admin/keys'),
  create: (body: { name: string; type: string; environment_id?: string; expires_at?: string }) =>
    request<ApiKey & { raw_key: string }>('POST', '/api/admin/keys', body),
  delete: (id: string) => request<{ deleted: boolean }>('DELETE', `/api/admin/keys/${id}`),
}

// ── Audit log ─────────────────────────────────────────────────
export const audit = {
  list: (params?: { flag_id?: string; environment_id?: string; page?: number }) => {
    const qs = new URLSearchParams()
    if (params?.flag_id) qs.set('flag_id', params.flag_id)
    if (params?.environment_id) qs.set('environment_id', params.environment_id)
    if (params?.page) qs.set('page', String(params.page))
    return request<{ entries: AuditEntry[]; total: number }>('GET', `/api/admin/audit?${qs}`)
  },
}

// ── Types ──────────────────────────────────────────────────────
export interface User { id: string; email: string }
export interface Organisation { id: string; name: string; slug: string; plan: string }

export interface Flag {
  id: string; org_id: string; key: string; name: string
  description: string; type: 'boolean' | 'string' | 'number' | 'json'
  tags: string[]; archived: boolean
  created_at: string; updated_at: string
  flag_states?: FlagState[]
}

export type BucketBy = 'userId' | 'tenantId'

export type Operator =
  | 'in' | 'not_in' | 'in_segment' | 'not_in_segment'
  | 'equals' | 'contains' | 'starts_with' | 'semver_gte'

export interface Condition {
  attribute: string
  op: Operator
  values?: string[]
  value?: string
}

export interface TargetingRule {
  id: string
  description?: string
  conditions: Condition[]
  serve: { enabled: boolean; value?: unknown }
  rollout_pct?: number | null
  bucket_by?: BucketBy | null
}

export interface FlagState {
  id: string; flag_id: string; environment_id: string
  org_id: string; enabled: boolean; value: unknown
  rollout_pct: number | null; strategies: unknown[]
  bucket_by: BucketBy | null
  targeting_rules: TargetingRule[]
  updated_at: string
  environments?: Environment
}

export interface Segment {
  id: string; org_id: string; key: string; name: string
  description: string | null
  rules: unknown[]
  member_count?: number
  segment_members?: SegmentMember[]
  created_at: string; updated_at: string
}

export interface SegmentMember {
  entity_key: string
  label: string | null
  added_at: string
}

export interface Environment {
  id: string; org_id: string; name: string; slug: string
  color: string; protected: boolean; created_at: string
}

export interface ApiKey {
  id: string; name: string; key_prefix: string; type: string
  environment_id: string | null; last_used_at: string | null
  expires_at: string | null; created_at: string
  environments?: { slug: string }
  raw_key?: string
}

export interface AuditEntry {
  id: string; org_id: string; flag_id: string | null
  environment_id: string | null; action: string
  actor_email: string | null; old_value: unknown
  new_value: unknown; created_at: string
}

export interface CreateFlagBody {
  key: string; name: string; type: string; description?: string; tags?: string[]
}

export interface SetStateBody {
  environment_id: string; enabled?: boolean
  value?: unknown; rollout_pct?: number; strategies?: unknown[]
  bucket_by?: BucketBy | null
  targeting_rules?: TargetingRule[]
}
