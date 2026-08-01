// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import {
  updateProfileSchema,
  updatePreferencesSchema,
  updateAvatarSchema,
  type UpdateProfileInput,
  type UpdatePreferencesInput,
  type UpdateAvatarInput,
} from "@repo/shared-validation";
import { jwtAuth } from "../middleware/jwt-auth.js";
import { tenantContext } from "../middleware/tenant-context.js";
import "../types.js";

export const profileRoute = new Hono();

profileRoute.use("/*", jwtAuth);
profileRoute.use("/*", tenantContext);

// ========== Get Profile ==========

profileRoute.get("/", async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  // Busca ou cria perfil
  let result = await query(
    "SELECT * FROM public.user_profiles WHERE user_id = $1 AND (tenant_id IS NULL OR tenant_id = $2) ORDER BY tenant_id NULLS LAST LIMIT 1",
    [user.sub, tenantId],
  );

  // Busca dados do user (email, name, role)
  const userResult = await query(
    "SELECT email, name, role FROM public.users WHERE id = $1",
    [user.sub],
  );

  const userData = (userResult.data?.rows[0] ?? {}) as { email?: string; name?: string; role?: string };
  const displayName = userData.name ?? userData.email ?? "User";
  const initials = displayName.substring(0, 2).toUpperCase();

  if (!result.data?.rows[0]) {
    // Cria perfil automaticamente
    const createResult = await query<{ id: string }>(
      `INSERT INTO public.user_profiles (tenant_id, user_id, display_name, avatar_initials)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [tenantId, user.sub, displayName, initials],
    );
    result = await query(
      "SELECT * FROM public.user_profiles WHERE id = $1",
      [createResult.data?.rows[0]?.id],
    );
  }

  const profile = result.data?.rows[0] ?? {};

  return c.json({
    profile: {
      ...profile,
      email: userData.email ?? null,
      name: userData.name ?? null,
      role: userData.role ?? (user.roles.length > 0 ? user.roles[0] : null),
    },
  });
});

// ========== Update Profile ==========

profileRoute.put("/", async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;
  const body = await c.req.json<UpdateProfileInput>();
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;
  const updateFields: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  const fieldMap: Record<string, string> = {
    display_name: "display_name", bio: "bio", phone: "phone", location: "location",
    timezone: "timezone", locale: "locale", job_title: "job_title", department: "department",
  };

  for (const [key, dbField] of Object.entries(fieldMap)) {
    if (data[key as keyof typeof data] !== undefined) {
      updateFields.push(`${dbField} = $${paramIdx++}`);
      params.push(data[key as keyof typeof data]);
    }
  }

  if (data.skills !== undefined) {
    updateFields.push(`skills = $${paramIdx++}`);
    params.push(JSON.stringify(data.skills));
  }

  if (data.social_links !== undefined) {
    updateFields.push(`social_links = $${paramIdx++}`);
    params.push(JSON.stringify(data.social_links));
  }

  if (updateFields.length > 0) {
    params.push(user.sub, tenantId);
    await query(
      `UPDATE public.user_profiles SET ${updateFields.join(", ")} WHERE user_id = $${paramIdx++} AND (tenant_id IS NULL OR tenant_id = $${paramIdx++})`,
      params,
    );
  }

  await query(
    "INSERT INTO public.user_security_log (tenant_id, user_id, event_type, metadata) VALUES ($1, $2, 'profile_update', $3)",
    [tenantId, user.sub, JSON.stringify({ fields: Object.keys(data) })],
  );

  return c.json({ updated: true });
});

// ========== Update Avatar ==========

profileRoute.put("/avatar", async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;
  const body = await c.req.json<UpdateAvatarInput>();
  const parsed = updateAvatarSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;
  const updateFields: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (data.avatar_url !== undefined) {
    updateFields.push(`avatar_url = $${paramIdx++}`);
    params.push(data.avatar_url);
  }

  if (data.avatar_initials !== undefined) {
    updateFields.push(`avatar_initials = $${paramIdx++}`);
    params.push(data.avatar_initials);
  }

  if (data.avatar_color !== undefined) {
    updateFields.push(`avatar_color = $${paramIdx++}`);
    params.push(data.avatar_color);
  }

  if (updateFields.length > 0) {
    params.push(user.sub, tenantId);
    await query(
      `UPDATE public.user_profiles SET ${updateFields.join(", ")} WHERE user_id = $${paramIdx++} AND (tenant_id IS NULL OR tenant_id = $${paramIdx++})`,
      params,
    );
  }

  await query(
    "INSERT INTO public.user_security_log (tenant_id, user_id, event_type, metadata) VALUES ($1, $2, 'avatar_change', $3)",
    [tenantId, user.sub, JSON.stringify({ fields: Object.keys(data) })],
  );

  return c.json({ updated: true });
});

// ========== Preferences ==========

profileRoute.get("/preferences", async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  const result = await query(
    `SELECT notification_email, notification_push, notification_sms,
       notification_digest_frequency, quiet_hours_start, quiet_hours_end,
       theme, density, sidebar_collapsed, dashboard_layout
     FROM public.user_profiles WHERE user_id = $1 AND (tenant_id IS NULL OR tenant_id = $2) ORDER BY tenant_id NULLS LAST LIMIT 1`,
    [user.sub, tenantId],
  );

  return c.json({ preferences: result.data?.rows[0] ?? {} });
});

profileRoute.put("/preferences", async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;
  const body = await c.req.json<UpdatePreferencesInput>();
  const parsed = updatePreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;
  const updateFields: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  const fieldMap: Record<string, string> = {
    notification_email: "notification_email", notification_push: "notification_push",
    notification_sms: "notification_sms", notification_digest_frequency: "notification_digest_frequency",
    quiet_hours_start: "quiet_hours_start", quiet_hours_end: "quiet_hours_end",
    theme: "theme", density: "density", sidebar_collapsed: "sidebar_collapsed",
  };

  for (const [key, dbField] of Object.entries(fieldMap)) {
    if (data[key as keyof typeof data] !== undefined) {
      updateFields.push(`${dbField} = $${paramIdx++}`);
      params.push(data[key as keyof typeof data]);
    }
  }

  if (data.dashboard_layout !== undefined) {
    updateFields.push(`dashboard_layout = $${paramIdx++}`);
    params.push(JSON.stringify(data.dashboard_layout));
  }

  if (updateFields.length > 0) {
    params.push(user.sub, tenantId);
    await query(
      `UPDATE public.user_profiles SET ${updateFields.join(", ")} WHERE user_id = $${paramIdx++} AND (tenant_id IS NULL OR tenant_id = $${paramIdx++})`,
      params,
    );
  }

  await query(
    "INSERT INTO public.user_security_log (tenant_id, user_id, event_type, metadata) VALUES ($1, $2, 'preferences_update', $3)",
    [tenantId, user.sub, JSON.stringify({ fields: Object.keys(data) })],
  );

  return c.json({ updated: true });
});

// ========== Sessions ==========

profileRoute.get("/sessions", async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  const result = await query(
    `SELECT id, device_type, device_name, ip_address, location, is_active,
       last_activity, expires_at, created_at
     FROM public.user_sessions WHERE user_id = $1 AND tenant_id = $2
     ORDER BY last_activity DESC`,
    [user.sub, tenantId],
  );

  return c.json({ sessions: result.data?.rows ?? [] });
});

profileRoute.delete("/sessions/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  await query(
    "UPDATE public.user_sessions SET is_active = false WHERE id = $1 AND user_id = $2 AND tenant_id = $3",
    [sessionId, user.sub, tenantId],
  );

  await query(
    "INSERT INTO public.user_security_log (tenant_id, user_id, event_type, metadata) VALUES ($1, $2, 'session_revoked', $3)",
    [tenantId, user.sub, JSON.stringify({ session_id: sessionId })],
  );

  return c.json({ revoked: true });
});

profileRoute.delete("/sessions", async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  // Revoga todas exceto a atual (baseado no JWT jti se disponível)
  await query(
    "UPDATE public.user_sessions SET is_active = false WHERE user_id = $1 AND tenant_id = $2 AND is_active = true",
    [user.sub, tenantId],
  );

  await query(
    "INSERT INTO public.user_security_log (tenant_id, user_id, event_type, metadata) VALUES ($1, $2, 'session_revoked', $3)",
    [tenantId, user.sub, JSON.stringify({ all: true })],
  );

  return c.json({ revoked: true });
});

// ========== Security Log ==========

profileRoute.get("/security/log", async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);

  const result = await query(
    `SELECT id, event_type, ip_address, user_agent, metadata, created_at
     FROM public.user_security_log WHERE user_id = $1 AND tenant_id = $2
     ORDER BY created_at DESC LIMIT $3`,
    [user.sub, tenantId, limit],
  );

  return c.json({ events: result.data?.rows ?? [] });
});
