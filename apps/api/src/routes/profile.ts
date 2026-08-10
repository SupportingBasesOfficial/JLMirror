// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import {
  updateProfileSchema,
  updatePreferencesSchema,
  updateAvatarSchema,
  type UpdateProfileInput,
  type UpdatePreferencesInput,
  type UpdateAvatarInput,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { safeJsonBody } from "../lib/safe-json.js";
import "../types.js";

export const profileRoute = new Hono();

profileRoute.use("/*", requirePermission("self:profile:read"));

// ========== Get Profile ==========

profileRoute.get("/", httpCache(15), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;
  const userId = user?.sub ?? null;

  try {
    // Paraleliza 2 queries independentes (profile + user data)
    const [profileResult, userResult] = await Promise.all([
      query(
        "SELECT * FROM public.user_profiles WHERE user_id = $1 AND (tenant_id IS NULL OR tenant_id = $2) ORDER BY tenant_id NULLS LAST LIMIT 1",
        [userId, tenantId],
      ),
      query("SELECT email, name, role FROM public.users WHERE id = $1", [
        userId,
      ]),
    ]);

    const userData = (userResult.data?.rows[0] ?? {}) as {
      email?: string;
      name?: string;
      role?: string;
    };
    const displayName = userData.name ?? userData.email ?? "User";
    const initials = displayName.substring(0, 2).toUpperCase();

    let profile = profileResult.data?.rows[0];

    if (!profile) {
      // Cria perfil automaticamente
      const createResult = await query<{ id: string }>(
        `INSERT INTO public.user_profiles (tenant_id, user_id, display_name, avatar_initials)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [tenantId, userId, displayName, initials],
      );

      if (createResult.data?.rows[0]) {
        const created = await query(
          "SELECT * FROM public.user_profiles WHERE id = $1",
          [createResult.data.rows[0].id],
        );
        profile = created.data?.rows[0];
      }
    }

    return c.json({
      profile: {
        ...(profile ?? {}),
        email: userData.email ?? null,
        name: userData.name ?? null,
        role: userData.role ?? (user?.roles?.length ? user.roles[0] : null),
      },
    });
  } catch (error) {
    logger.error("Erro ao buscar profile", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

// ========== Update Profile ==========

profileRoute.put(
  "/",
  requirePermission("self:profile:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = updateProfileSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const data = parsed.data as UpdateProfileInput;
    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    const fieldMap: Record<string, string> = {
      display_name: "display_name",
      bio: "bio",
      phone: "phone",
      location: "location",
      timezone: "timezone",
      locale: "locale",
      job_title: "job_title",
      department: "department",
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

    try {
      if (updateFields.length > 0) {
        params.push(userId, tenantId);
        await query(
          `UPDATE public.user_profiles SET ${updateFields.join(", ")} WHERE user_id = $${paramIdx++} AND (tenant_id IS NULL OR tenant_id = $${paramIdx++})`,
          params,
        );
      }

      try {
        await query(
          "INSERT INTO public.user_security_log (tenant_id, user_id, event_type, metadata) VALUES ($1, $2, 'profile_update', $3)",
          [tenantId, userId, JSON.stringify({ fields: Object.keys(data) })],
        );
      } catch {
        // Security log falhou — nao bloqueia
      }

      logger.info("Profile atualizado", { userId, tenantId });

      return c.json({ updated: true });
    } catch (error) {
      logger.error("Erro ao atualizar profile", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao atualizar" } },
        500,
      );
    }
  },
);

// ========== Update Avatar ==========

profileRoute.put(
  "/avatar",
  requirePermission("self:profile:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = updateAvatarSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const data = parsed.data as UpdateAvatarInput;
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

    try {
      if (updateFields.length > 0) {
        params.push(userId, tenantId);
        await query(
          `UPDATE public.user_profiles SET ${updateFields.join(", ")} WHERE user_id = $${paramIdx++} AND (tenant_id IS NULL OR tenant_id = $${paramIdx++})`,
          params,
        );
      }

      try {
        await query(
          "INSERT INTO public.user_security_log (tenant_id, user_id, event_type, metadata) VALUES ($1, $2, 'avatar_change', $3)",
          [tenantId, userId, JSON.stringify({ fields: Object.keys(data) })],
        );
      } catch {
        // Security log falhou — nao bloqueia
      }

      logger.info("Avatar atualizado", { userId, tenantId });

      return c.json({ updated: true });
    } catch (error) {
      logger.error("Erro ao atualizar avatar", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao atualizar" } },
        500,
      );
    }
  },
);

// ========== Preferences ==========

profileRoute.get("/preferences", httpCache(15), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;
  const userId = user?.sub ?? null;

  try {
    const result = await query(
      `SELECT notification_email, notification_push, notification_sms,
         notification_digest_frequency, quiet_hours_start, quiet_hours_end,
         theme, density, sidebar_collapsed, dashboard_layout
       FROM public.user_profiles WHERE user_id = $1 AND (tenant_id IS NULL OR tenant_id = $2) ORDER BY tenant_id NULLS LAST LIMIT 1`,
      [userId, tenantId],
    );

    return c.json({ preferences: result.data?.rows[0] ?? {} });
  } catch (error) {
    logger.error("Erro ao buscar preferences", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

profileRoute.put(
  "/preferences",
  requirePermission("self:profile:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = updatePreferencesSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Dados inválidos",
            details: parsed.error.flatten(),
          },
        },
        400,
      );
    }

    const data = parsed.data as UpdatePreferencesInput;
    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    const fieldMap: Record<string, string> = {
      notification_email: "notification_email",
      notification_push: "notification_push",
      notification_sms: "notification_sms",
      notification_digest_frequency: "notification_digest_frequency",
      quiet_hours_start: "quiet_hours_start",
      quiet_hours_end: "quiet_hours_end",
      theme: "theme",
      density: "density",
      sidebar_collapsed: "sidebar_collapsed",
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

    try {
      if (updateFields.length > 0) {
        params.push(userId, tenantId);
        await query(
          `UPDATE public.user_profiles SET ${updateFields.join(", ")} WHERE user_id = $${paramIdx++} AND (tenant_id IS NULL OR tenant_id = $${paramIdx++})`,
          params,
        );
      }

      try {
        await query(
          "INSERT INTO public.user_security_log (tenant_id, user_id, event_type, metadata) VALUES ($1, $2, 'preferences_update', $3)",
          [tenantId, userId, JSON.stringify({ fields: Object.keys(data) })],
        );
      } catch {
        // Security log falhou — nao bloqueia
      }

      logger.info("Preferences atualizado", { userId, tenantId });

      return c.json({ updated: true });
    } catch (error) {
      logger.error("Erro ao atualizar preferences", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao atualizar" } },
        500,
      );
    }
  },
);

// ========== Sessions ==========

profileRoute.get("/sessions", httpCache(15), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;
  const userId = user?.sub ?? null;

  try {
    const result = await query(
      `SELECT id, device_type, device_name, ip_address, location, is_active,
         last_activity, expires_at, created_at
       FROM public.user_sessions WHERE user_id = $1 AND tenant_id = $2
       ORDER BY last_activity DESC`,
      [userId, tenantId],
    );

    return c.json({ sessions: result.data?.rows ?? [] });
  } catch (error) {
    logger.error("Erro ao buscar sessions", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

profileRoute.delete(
  "/sessions/:sessionId",
  requirePermission("self:profile:write"),
  rateLimitWrite,
  async (c) => {
    const sessionId = c.req.param("sessionId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;

    try {
      const result = await query(
        "UPDATE public.user_sessions SET is_active = false WHERE id = $1 AND user_id = $2 AND tenant_id = $3",
        [sessionId, userId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Sessão não encontrada" } },
          404,
        );
      }

      try {
        await query(
          "INSERT INTO public.user_security_log (tenant_id, user_id, event_type, metadata) VALUES ($1, $2, 'session_revoked', $3)",
          [tenantId, userId, JSON.stringify({ session_id: sessionId })],
        );
      } catch {
        // Security log falhou — nao bloqueia
      }

      logger.info("Sessão revogada", { userId, sessionId });

      return c.json({ revoked: true });
    } catch (error) {
      logger.error("Erro ao revogar sessão", {
        userId,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "DELETE_ERROR", message: "Erro ao revogar" } },
        500,
      );
    }
  },
);

profileRoute.delete(
  "/sessions",
  requirePermission("self:profile:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;

    try {
      await query(
        "UPDATE public.user_sessions SET is_active = false WHERE user_id = $1 AND tenant_id = $2 AND is_active = true",
        [userId, tenantId],
      );

      try {
        await query(
          "INSERT INTO public.user_security_log (tenant_id, user_id, event_type, metadata) VALUES ($1, $2, 'session_revoked', $3)",
          [tenantId, userId, JSON.stringify({ all: true })],
        );
      } catch {
        // Security log falhou — nao bloqueia
      }

      logger.info("Todas sessões revogadas", { userId, tenantId });

      return c.json({ revoked: true });
    } catch (error) {
      logger.error("Erro ao revogar todas sessões", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "DELETE_ERROR", message: "Erro ao revogar" } },
        500,
      );
    }
  },
);

// ========== Security Log ==========

profileRoute.get("/security/log", httpCache(15), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;
  const userId = user?.sub ?? null;
  const limit = Math.min(
    Number.parseInt(c.req.query("limit") ?? "20", 10) || 20,
    100,
  );

  try {
    const result = await query(
      `SELECT id, event_type, ip_address, user_agent, metadata, created_at
       FROM public.user_security_log WHERE user_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC LIMIT $3`,
      [userId, tenantId, limit],
    );

    return c.json({ events: result.data?.rows ?? [] });
  } catch (error) {
    logger.error("Erro ao buscar security log", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});
