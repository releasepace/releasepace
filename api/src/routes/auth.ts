import { SupabaseClient } from "@supabase/supabase-js";
import { json, err } from "../lib/response";

export async function handleAuth(
  request: Request,
  supabase: SupabaseClient,
  corsHeaders: HeadersInit
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace("/api/auth", "");
  const body = await request.json() as any;

  // POST /api/auth/signup
  if (path === "/signup" && request.method === "POST") {
    const { email, password, org_name } = body;
    if (!email || !password || !org_name) {
      return err("email, password, and org_name are required", 400, corsHeaders);
    }

    const { data: auth, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authErr) return err(authErr.message, 400, corsHeaders);

    const slug = org_name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
    const { data: orgId, error: orgErr } = await supabase
      .rpc("create_org_for_user", {
        p_user_id: auth.user.id,
        p_org_name: org_name,
        p_org_slug: `${slug}-${Math.random().toString(36).slice(2, 6)}`,
      });

    if (orgErr) return err(orgErr.message, 500, corsHeaders);

    return json({ user: auth.user, org_id: orgId }, 201, corsHeaders);
  }

  // POST /api/auth/login
  if (path === "/login" && request.method === "POST") {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });
    if (error) return err(error.message, 401, corsHeaders);
    return json({ access_token: data.session?.access_token, user: data.user }, 200, corsHeaders);
  }

  return err("Not found", 404, corsHeaders);
}
