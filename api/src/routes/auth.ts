import { SupabaseClient } from "@supabase/supabase-js";
import { json, err } from "../lib/response";

export async function handleAuth(
  request: Request,
  supabase: SupabaseClient,
  corsHeaders: HeadersInit
): Promise<Response> {
  const url  = new URL(request.url);
  const path = url.pathname.replace("/api/auth", "");

  // ── GET /api/auth/check-org?name=Acme+Corp ─────────────────
  // Returns similar existing org names so the signup form can
  // warn a user before they accidentally create a duplicate org.
  // Returns only names (never IDs or membership data) and is
  // intentionally available without authentication.
  if (path === "/check-org" && request.method === "GET") {
    const name = url.searchParams.get("name")?.trim() ?? "";
    if (name.length < 3) return json({ matches: [] }, 200, corsHeaders);

    const { data } = await supabase.rpc("similar_org_names", { p_name: name });
    const matches = (data ?? []).map((r: any) => r.name);

    return json({ matches }, 200, corsHeaders);
  }

  const body = await request.json() as any;

  // ── POST /api/auth/signup ───────────────────────────────────
  if (path === "/signup" && request.method === "POST") {
    const { email, password, org_name } = body;
    if (!email || !password) {
      return err("email and password are required", 400, corsHeaders);
    }

    const { data: auth, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authErr) {
      // Invite signup may be retried after the user was created but the
      // original response/session was interrupted. Verify the supplied
      // password and resume instead of leaving that user stuck.
      if (!org_name?.trim()) {
        const { data: existingSession, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
        if (!signInErr && existingSession.session && existingSession.user) {
          return json({
            access_token: existingSession.session.access_token,
            user: existingSession.user,
            org_id: null,
          }, 200, corsHeaders);
        }
      }
      return err(authErr.message, 400, corsHeaders);
    }

    // org_name is optional — omit it when signing up to accept an invite.
    // In that case the user is added to an existing org via /team/accept,
    // not a new one.
    if (!org_name?.trim()) {
      const { data: session, error: sessionErr } = await supabase.auth.signInWithPassword({ email, password });
      if (sessionErr) return err(sessionErr.message, 500, corsHeaders);
      return json({
        access_token: session.session?.access_token,
        user: auth.user,
        org_id: null,
      }, 201, corsHeaders);
    }

    // Normalise the display name — trim and collapse internal whitespace.
    const displayName    = org_name.trim().replace(/\s+/g, " ");
    const normalisedName = displayName.toLowerCase();

    const slug = normalisedName
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const { data: orgId, error: orgErr } = await supabase
      .rpc("create_org_for_user", {
        p_user_id:  auth.user.id,
        p_org_name: displayName,
        p_org_slug: `${slug}-${Math.random().toString(36).slice(2, 6)}`,
      });

    if (orgErr) return err(orgErr.message, 500, corsHeaders);

    // Store the normalised name for future similarity matching.
    await supabase
      .from("organisations")
      .update({ name_normalised: normalisedName })
      .eq("id", orgId);

    const { data: session, error: sessionErr } = await supabase.auth.signInWithPassword({ email, password });
    if (sessionErr) return err(sessionErr.message, 500, corsHeaders);

    return json({
      access_token: session.session?.access_token,
      user: auth.user,
      org_id: orgId,
    }, 201, corsHeaders);
  }

  // ── POST /api/auth/login ────────────────────────────────────
  if (path === "/login" && request.method === "POST") {
    const { data, error } = await supabase.auth.signInWithPassword({
      email:    body.email,
      password: body.password,
    });
    if (error) return err(error.message, 401, corsHeaders);

    const { count: membershipCount, error: membershipError } = await supabase
      .from("org_members")
      .select("*", { count: "exact", head: true })
      .eq("user_id", data.user.id);

    if (membershipError) return err(membershipError.message, 500, corsHeaders);

    if ((membershipCount ?? 0) === 0) {
      // A user awaiting an invitation must be able to sign in before the
      // acceptance endpoint can create their first membership.
      const { data: pendingInvite, error: inviteError } = await supabase
        .from("pending_invites")
        .select("id")
        .eq("email", (data.user.email ?? body.email).trim().toLowerCase())
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString())
        .limit(1)
        .maybeSingle();

      if (inviteError) return err(inviteError.message, 500, corsHeaders);
      if (!pendingInvite) {
        return err(
          "Your workspace access has been removed. Ask an administrator to invite you again.",
          403,
          corsHeaders
        );
      }
    }

    return json(
      { access_token: data.session?.access_token, user: data.user },
      200,
      corsHeaders
    );
  }

  return err("Not found", 404, corsHeaders);
}
