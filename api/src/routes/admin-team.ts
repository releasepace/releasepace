import { SupabaseClient } from "@supabase/supabase-js";
import { KeyContext } from "../lib/auth";
import { json, err } from "../lib/response";

/**
 * Team management endpoints.
 *
 *   GET    /api/admin/team                    – list members + pending invites
 *   POST   /api/admin/team/invite             – send an invite
 *   DELETE /api/admin/team/invite/:id         – revoke a pending invite
 *   PATCH  /api/admin/team/members/:userId    – change a member's role
 *   DELETE /api/admin/team/members/:userId    – remove a member
 *   POST   /api/admin/team/accept             – accept an invite (token in body)
 *   GET    /api/admin/team/orgs               – list all orgs the current user belongs to
 */
export async function handleAdminTeam(
  request: Request,
  supabase: SupabaseClient,
  ctx: KeyContext,
  corsHeaders: HeadersInit
): Promise<Response> {
  const url  = new URL(request.url);
  const path = url.pathname.replace("/api/admin/team", "").replace(/\/$/, "");
  const method = request.method;

  // ── GET /api/admin/team ──────────────────────────────────────
  // Returns current members and pending invites in one call so the
  // team page renders in a single request.
  if (!path && method === "GET") {
    const [membersResult, invitesResult] = await Promise.all([
      supabase
        .from("org_members")
        .select("user_id, role, created_at, invited_at")
        .eq("org_id", ctx.orgId)
        .order("created_at", { ascending: true }),
      supabase
        .from("pending_invites")
        .select("id, email, role, created_at, expires_at, invited_by, accepted_at")
        .eq("org_id", ctx.orgId)
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }),
    ]);

    if (membersResult.error) return err(membersResult.error.message, 500, corsHeaders);
    if (invitesResult.error) return err(invitesResult.error.message, 500, corsHeaders);

    const members = membersResult.data ?? [];
    const userResults = await Promise.all(
      members.map((member) => supabase.auth.admin.getUserById(member.user_id))
    );

    const formattedMembers = members.map((m, index) => ({
      user_id:    m.user_id,
      email:      userResults[index].data.user?.email ?? null,
      role:       m.role,
      joined_at:  m.invited_at ?? m.created_at,
      is_current: m.user_id === ctx.userId,
    }));

    return json({ members: formattedMembers, invites: invitesResult.data ?? [] }, 200, corsHeaders);
  }

  // ── GET /api/admin/team/orgs ─────────────────────────────────
  // Lists every org the authenticated user belongs to, for the
  // org-switcher dropdown in the dashboard.
  if (path === "/orgs" && method === "GET") {
    if (!ctx.userId) return err("Not authenticated", 401, corsHeaders);

    const { data, error } = await supabase
      .from("org_members")
      .select("role, organisations(id, name, slug, plan)")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: true });

    if (error) return err(error.message, 500, corsHeaders);

    const orgs = (data ?? []).map((m: any) => ({
      id:   m.organisations.id,
      name: m.organisations.name,
      slug: m.organisations.slug,
      plan: m.organisations.plan,
      role: m.role,
    }));

    return json({ orgs }, 200, corsHeaders);
  }

  // ── POST /api/admin/team/invite ──────────────────────────────
  if (path === "/invite" && method === "POST") {
    if (!["owner", "admin"].includes(ctx.role ?? "")) {
      return err("Only owners and admins can invite members", 403, corsHeaders);
    }

    const body = (await request.json()) as any;
    const email = (body?.email ?? "").trim().toLowerCase();
    const role  = body?.role ?? "editor";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return err("A valid email address is required", 400, corsHeaders);
    }
    if (!["admin", "editor", "viewer"].includes(role)) {
      return err("role must be admin, editor, or viewer", 400, corsHeaders);
    }

    // Check the invitee isn't already a member.
    const { data: existingUser } = await supabase
      .from("auth.users")
      .select("id")
      .eq("email", email)
      .single();

    if (existingUser) {
      const { data: existingMember } = await supabase
        .from("org_members")
        .select("user_id")
        .eq("org_id", ctx.orgId)
        .eq("user_id", existingUser.id)
        .single();

      if (existingMember) {
        return err(`${email} is already a member of this organisation`, 409, corsHeaders);
      }
    }

    // Generate a cryptographically random token.
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const { data: invite, error } = await supabase
      .from("pending_invites")
      .upsert(
        {
          org_id:     ctx.orgId,
          email,
          role,
          token,
          invited_by: ctx.userId,
          // Reset expiry if re-inviting.
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          accepted_at: null,
        },
        { onConflict: "org_id,email" }
      )
      .select()
      .single();

    if (error) return err(error.message, 400, corsHeaders);

    // Fetch the org name for the invite email.
    const { data: org } = await supabase
      .from("organisations")
      .select("name")
      .eq("id", ctx.orgId)
      .single();

    await writeAudit(supabase, ctx, "team.invite.sent", null, { email, role });

    // The invite link — the dashboard handles acceptance.
    // In production you'd send this via an email provider (Resend,
    // SendGrid, etc.). For now it's returned so the caller can display
    // it or wire up their own email sending.
    // The browser's Origin makes the link follow whichever dashboard
    // deployment sent the request.
    const origin = request.headers.get("Origin");
    if (!origin) return err("Request origin is required", 400, corsHeaders);
    const inviteLink = `${origin}/accept-invite?token=${token}`;

    return json({ invite, inviteLink, org: org?.name }, 201, corsHeaders);
  }

  // ── DELETE /api/admin/team/invite/:id ────────────────────────
  if (path.startsWith("/invite/") && method === "DELETE") {
    if (!["owner", "admin"].includes(ctx.role ?? "")) {
      return err("Only owners and admins can revoke invites", 403, corsHeaders);
    }

    const inviteId = path.replace("/invite/", "");
    const { data: invite } = await supabase
      .from("pending_invites")
      .select("email, role")
      .eq("id", inviteId)
      .eq("org_id", ctx.orgId)
      .single();

    if (!invite) return err("Invite not found", 404, corsHeaders);

    await supabase
      .from("pending_invites")
      .delete()
      .eq("id", inviteId)
      .eq("org_id", ctx.orgId);

    await writeAudit(supabase, ctx, "team.invite.revoked", invite, null);
    return json({ revoked: true }, 200, corsHeaders);
  }

  // ── PATCH /api/admin/team/members/:userId ────────────────────
  if (path.startsWith("/members/") && method === "PATCH") {
    if (!["owner", "admin"].includes(ctx.role ?? "")) {
      return err("Only owners and admins can change roles", 403, corsHeaders);
    }

    const targetUserId = path.replace("/members/", "");
    const body = (await request.json()) as any;
    const newRole = body?.role;

    if (!["admin", "editor", "viewer"].includes(newRole)) {
      return err("role must be admin, editor, or viewer", 400, corsHeaders);
    }

    // Owners cannot be demoted except by themselves.
    const { data: target } = await supabase
      .from("org_members")
      .select("role")
      .eq("org_id", ctx.orgId)
      .eq("user_id", targetUserId)
      .single();

    if (!target) return err("Member not found", 404, corsHeaders);
    if (target.role === "owner" && ctx.userId !== targetUserId) {
      return err("Only the owner can change their own role", 403, corsHeaders);
    }

    await supabase
      .from("org_members")
      .update({ role: newRole })
      .eq("org_id", ctx.orgId)
      .eq("user_id", targetUserId);

    await writeAudit(supabase, ctx, "team.member.role_changed",
      { role: target.role }, { role: newRole, user_id: targetUserId });

    return json({ updated: true }, 200, corsHeaders);
  }

  // ── DELETE /api/admin/team/members/:userId ───────────────────
  if (path.startsWith("/members/") && method === "DELETE") {
    if (!["owner", "admin"].includes(ctx.role ?? "")) {
      return err("Only owners and admins can remove members", 403, corsHeaders);
    }

    const targetUserId = path.replace("/members/", "");

    if (ctx.userId === targetUserId) {
      return err("You cannot remove yourself", 400, corsHeaders);
    }

    const { data: target, error: targetError } = await supabase
      .from("org_members")
      .select("user_id, role")
      .eq("org_id", ctx.orgId)
      .eq("user_id", targetUserId)
      .single();

    if (targetError || !target) return err("Member not found", 404, corsHeaders);

    const { error: removeError } = await supabase
      .from("org_members")
      .delete()
      .eq("org_id", ctx.orgId)
      .eq("user_id", targetUserId);

    if (removeError) return err(removeError.message, 500, corsHeaders);

    await writeAudit(supabase, ctx, "team.member.removed", target, null);
    return json({ removed: true }, 200, corsHeaders);
  }

  // ── POST /api/admin/team/accept ──────────────────────────────
  // Accepts an invite. The user must already be authenticated.
  if (path === "/accept" && method === "POST") {
    if (!ctx.userId) return err("Must be logged in to accept an invite", 401, corsHeaders);

    const body = (await request.json()) as any;
    const token = body?.token;
    if (!token) return err("token is required", 400, corsHeaders);

    const { data: invite, error: inviteError } = await supabase
      .from("pending_invites")
      .select("email")
      .eq("token", token)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (inviteError) return err(inviteError.message, 500, corsHeaders);
    if (!invite) return err("Invite not found or expired", 404, corsHeaders);
    if (invite.email.trim().toLowerCase() !== ctx.userEmail?.trim().toLowerCase()) {
      return err("This invite was sent to a different email address", 403, corsHeaders);
    }

    const { data, error } = await supabase.rpc("accept_invite", {
      p_token:   token,
      p_user_id: ctx.userId,
    });

    if (error) return err(error.message, 400, corsHeaders);

    await writeAudit(supabase, { ...ctx, orgId: data }, "team.invite.accepted", null, { org_id: data });
    return json({ org_id: data }, 200, corsHeaders);
  }

  return err("Not found", 404, corsHeaders);
}

async function writeAudit(
  supabase: SupabaseClient,
  ctx: KeyContext,
  action: string,
  oldValue: unknown,
  newValue: unknown
) {
  await supabase.from("audit_log").insert({
    org_id:      ctx.orgId,
    action,
    actor_id:    ctx.userId,
    actor_email: ctx.userEmail,
    old_value:   oldValue,
    new_value:   newValue,
  });
}
