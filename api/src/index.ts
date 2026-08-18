/**
 * ReleasePace API – Cloudflare Worker
 * Routes: /api/client/* (SDK), /api/admin/* (dashboard)
 */
import { createClient } from "@supabase/supabase-js";
import { handleClientFeatures } from "./routes/client";
import { handleAdminFlags } from "./routes/admin-flags";
import { handleAdminEnvironments } from "./routes/admin-environments";
import { handleAdminKeys } from "./routes/admin-keys";
import { handleAdminAudit } from "./routes/admin-audit";
import { handleAuth } from "./routes/auth";
import { cors, json, err } from "./lib/response";
import { resolveApiKey } from "./lib/auth";

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  SUPABASE_JWT_SECRET: string;
  ALLOWED_ORIGINS: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // ── CORS preflight ──────────────────────────────────────
    if (method === "OPTIONS") {
      return cors(env.ALLOWED_ORIGINS, request.headers.get("Origin") || "");
    }

    // ── Supabase admin client (service key – bypasses RLS) ──
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const origin = request.headers.get("Origin") || "";
    const corsHeaders = buildCorsHeaders(env.ALLOWED_ORIGINS, origin);

    try {
      // ── Auth endpoints (signup, login – proxy to Supabase) ─
      if (path.startsWith("/api/auth")) {
        return handleAuth(request, supabase, corsHeaders);
      }

      // ── SDK client endpoint ─────────────────────────────────
      // GET /api/client/features   – SDK key required
      if (path === "/api/client/features" && method === "GET") {
        const keyCtx = await resolveApiKey(request, supabase, "client");
        if (!keyCtx) return err("Invalid or missing SDK key", 401, corsHeaders);
        return handleClientFeatures(request, supabase, keyCtx, corsHeaders);
      }

      // ── Admin endpoints – JWT required ──────────────────────
      if (path.startsWith("/api/admin")) {
        const keyCtx = await resolveApiKey(request, supabase, "admin");
        if (!keyCtx) return err("Unauthorized", 401, corsHeaders);

        if (path.startsWith("/api/admin/flags")) {
          return handleAdminFlags(request, supabase, keyCtx, corsHeaders);
        }
        if (path.startsWith("/api/admin/environments")) {
          return handleAdminEnvironments(request, supabase, keyCtx, corsHeaders);
        }
        if (path.startsWith("/api/admin/keys")) {
          return handleAdminKeys(request, supabase, keyCtx, corsHeaders);
        }
        if (path.startsWith("/api/admin/audit")) {
          return handleAdminAudit(request, supabase, keyCtx, corsHeaders);
        }
      }

      return err("Not found", 404, corsHeaders);
    } catch (e: any) {
      console.error(e);
      return err(e.message || "Internal error", 500, corsHeaders);
    }
  },
};

function buildCorsHeaders(allowed: string, origin: string): HeadersInit {
  const origins = allowed.split(",").map((s) => s.trim());
  const allow = origins.includes(origin) || origins.includes("*") ? origin : origins[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400",
  };
}
