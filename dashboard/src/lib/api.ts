const API = import.meta.env.VITE_API_URL || 'http://localhost:8787'

let _token: string | null = localStorage.getItem('rp_token')

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
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`)
  return data as T
}

// ── Auth ──────────────────────────────────────────────────────
export const auth = {
  signup: (email: string, password: string, org_name: string) =>
    request<{ access_token: string; user: User }>('POST', '/api/auth/signup', { email, password, org_name }),
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

export interface FlagState {
  id: string; flag_id: string; environment_id: string
  org_id: string; enabled: boolean; value: unknown
  rollout_pct: number | null; strategies: unknown[]
  updated_at: string
  environments?: Environment
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
}
