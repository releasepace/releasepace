import { SupabaseClient } from "@supabase/supabase-js";

export interface KeyContext {
  orgId: string;
  environmentId: string | null;
  keyType: "client" | "server" | "admin";
  userId: string | null;
  userEmail: string | null;
  role: string | null;
}

/**
 * Resolves either:
 *  - Bearer rp_live_xxx  → SDK/admin API key
 *  - Bearer <JWT>        → Supabase user session (for dashboard)
 */
export async function resolveApiKey(
  request: Request,
  supabase: SupabaseClient,
  requiredType: "client" | "admin"
): Promise<KeyContext | null> {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);

  // ── API key (starts with fk_) ──────────────────────────────
  if (token.startsWith("rp_")) {
    return resolveSDKKey(token, supabase, requiredType);
  }

  // ── Supabase JWT (dashboard users) ────────────────────────
  if (requiredType === "admin") {
    return resolveJWT(token, supabase);
  }

  return null;
}

/** Authenticate a dashboard user before they have an organisation membership. */
export async function resolveUnscopedJWT(
  request: Request,
  supabase: SupabaseClient
): Promise<KeyContext | null> {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;

  const { data: { user }, error } = await supabase.auth.getUser(auth.slice(7));
  if (error || !user) return null;

  return {
    orgId: "",
    environmentId: null,
    keyType: "admin",
    userId: user.id,
    userEmail: user.email ?? null,
    role: null,
  };
}

async function resolveSDKKey(
  rawKey: string,
  supabase: SupabaseClient,
  requiredType: string
): Promise<KeyContext | null> {
  // Hash the key before lookup – we never store raw keys
  const hash = await sha256(rawKey);

  const { data: key, error } = await supabase
    .from("api_keys")
    .select("id, org_id, environment_id, type, expires_at")
    .eq("key_hash", hash)
    .single();

  if (error || !key) return null;
  if (key.expires_at && new Date(key.expires_at) < new Date()) return null;
  if (requiredType === "client" && key.type === "admin") return null;

  // Update last_used async (don't await – don't slow the request)
  supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", key.id)
    .then(() => {});

  return {
    orgId: key.org_id,
    environmentId: key.environment_id,
    keyType: key.type,
    userId: null,
    userEmail: null,
    role: key.type === "admin" ? "admin" : "viewer",
  };
}

async function resolveJWT(
  token: string,
  supabase: SupabaseClient
): Promise<KeyContext | null> {
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  // Get the org the user belongs to (first one – later support multi-org)
  const { data: member } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!member) return null;

  return {
    orgId: member.org_id,
    environmentId: null,
    keyType: "admin",
    userId: user.id,
    userEmail: user.email ?? null,
    role: member.role,
  };
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashKey(rawKey: string): Promise<string> {
  return sha256(rawKey);
}

export function generateApiKey(type: "client" | "server" | "admin", env: string): string {
  const prefix = `rp_${type === "client" ? "live" : type === "server" ? "srv" : "adm"}_`;
  const random = Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${prefix}${random}`;
}
