// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { createHash } from "node:crypto";
import { query } from "@repo/db";
import {
  createFeatureFlagSchema,
  updateFeatureFlagSchema,
  evaluateFlagSchema,
  createOverrideSchema,
  type CreateFeatureFlagInput,
  type UpdateFeatureFlagInput,
  type EvaluateFlagInput,
  type CreateOverrideInput,
} from "@repo/shared-validation";
import { jwtAuth } from "../middleware/jwt-auth.js";
import { tenantContext } from "../middleware/tenant-context.js";
import { requirePermission } from "../middleware/require-permission.js";
import "../types.js";

export const featureFlagRoute = new Hono();

function hashString(input: string): number {
  const hash = createHash("sha256").update(input).digest();
  return hash.readUInt32BE(0);
}

function evaluatePercentage(flagKey: string, userId: string, percentage: number): boolean {
  const hashVal = hashString(`${flagKey}:${userId}`) % 10000;
  return hashVal < (percentage * 100);
}

function pickVariant(flagKey: string, userId: string, variants: Array<{ key: string; value: unknown; weight: number }>): { key: string; value: unknown } {
  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
  if (totalWeight === 0) return { key: variants[0]?.key ?? "default", value: variants[0]?.value ?? false };
  const hashVal = hashString(`${flagKey}:${userId}:variant`) % totalWeight;
  let cumulative = 0;
  for (const v of variants) {
    cumulative += v.weight;
    if (hashVal < cumulative) return { key: v.key, value: v.value };
  }
  return { key: variants[0].key, value: variants[0].value };
}

// ========== List ==========

featureFlagRoute.get("/", jwtAuth, tenantContext, requirePermission("feature_flags:read"), async (c) => {
  const user = c.get("user");
  const activeOnly = c.req.query("active") === "true";

  const conditions: string[] = ["tenant_id IS NULL OR tenant_id = $1"];
  const params: unknown[] = [user?.tenant_id ?? null];
  if (activeOnly) { conditions.push("is_active = true"); }

  const result = await query(
    `SELECT id, key, name, description, flag_type, is_active, default_value,
       rollout_percentage, variants, target_segments, excluded_tenant_ids,
       starts_at, ends_at, total_evaluations, true_evaluations, false_evaluations,
       created_at, updated_at
     FROM public.feature_flags WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`,
    params,
  );

  return c.json({ flags: result.data?.rows ?? [] });
});

// ========== Create ==========

featureFlagRoute.post("/", jwtAuth, tenantContext, requirePermission("feature_flags:write"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<CreateFeatureFlagInput>();
  const parsed = createFeatureFlagSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;

  const result = await query<{ id: string }>(
    `INSERT INTO public.feature_flags (tenant_id, key, name, description, flag_type, is_active,
       default_value, rollout_percentage, variants, target_segments, excluded_tenant_ids,
       starts_at, ends_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
    [
      user?.tenant_id ?? null, data.key, data.name, data.description ?? null,
      data.flag_type, data.is_active, JSON.stringify(data.default_value),
      data.rollout_percentage, JSON.stringify(data.variants), JSON.stringify(data.target_segments),
      JSON.stringify(data.excluded_tenant_ids),
      data.starts_at ?? null, data.ends_at ?? null, user.sub,
    ],
  );

  if (result.error || !result.data?.rows[0]) {
    return c.json({ error: { code: "CREATE_ERROR", message: "Erro ao criar feature flag" } }, 500);
  }

  await query(
    "SELECT public.write_audit_log($1, NULL, 'feature_flag.create', 'feature_flag', $2, $3, NULL, NULL)",
    [user.sub, result.data.rows[0].id, JSON.stringify({ key: data.key, name: data.name, type: data.flag_type })],
  );

  return c.json({ id: result.data.rows[0].id }, 201);
});

// ========== Update ==========

featureFlagRoute.put("/:id", jwtAuth, tenantContext, requirePermission("feature_flags:write"), async (c) => {
  const flagId = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json<UpdateFeatureFlagInput>();
  const parsed = updateFeatureFlagSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;
  const updateFields: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  const fieldMap: Record<string, string> = {
    name: "name", description: "description", flag_type: "flag_type",
    is_active: "is_active", rollout_percentage: "rollout_percentage",
    starts_at: "starts_at", ends_at: "ends_at",
  };

  for (const [key, dbField] of Object.entries(fieldMap)) {
    if (data[key as keyof typeof data] !== undefined) {
      updateFields.push(`${dbField} = $${paramIdx++}`);
      params.push(data[key as keyof typeof data]);
    }
  }

  if (data.default_value !== undefined) {
    updateFields.push(`default_value = $${paramIdx++}`);
    params.push(JSON.stringify(data.default_value));
  }

  if (data.variants !== undefined) {
    updateFields.push(`variants = $${paramIdx++}`);
    params.push(JSON.stringify(data.variants));
  }

  if (data.target_segments !== undefined) {
    updateFields.push(`target_segments = $${paramIdx++}`);
    params.push(JSON.stringify(data.target_segments));
  }

  if (data.excluded_tenant_ids !== undefined) {
    updateFields.push(`excluded_tenant_ids = $${paramIdx++}`);
    params.push(JSON.stringify(data.excluded_tenant_ids));
  }

  if (updateFields.length === 0) {
    return c.json({ id: flagId });
  }

  params.push(flagId);

  await query(
    `UPDATE public.feature_flags SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND (tenant_id IS NULL OR tenant_id = $${paramIdx++})`,
    [...params, user?.tenant_id ?? null],
  );

  return c.json({ id: flagId });
});

// ========== Delete ==========

featureFlagRoute.delete("/:id", jwtAuth, tenantContext, requirePermission("feature_flags:write"), async (c) => {
  const flagId = c.req.param("id");
  const user = c.get("user");

  await query(
    "DELETE FROM public.feature_flags WHERE id = $1 AND (tenant_id IS NULL OR tenant_id = $2)",
    [flagId, user?.tenant_id ?? null],
  );

  return c.json({ deleted: true });
});

// ========== Evaluate ==========

featureFlagRoute.post("/evaluate", jwtAuth, tenantContext, async (c) => {
  const user = c.get("user");
  const body = await c.req.json<EvaluateFlagInput>();
  const parsed = evaluateFlagSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;
  const userId = data.user_id ?? user.sub;
  const tenantId = user?.tenant_id ?? null;

  // Busca flag (global ou do tenant)
  const flagResult = await query(
    "SELECT * FROM public.feature_flags WHERE key = $1 AND is_active = true AND (tenant_id IS NULL OR tenant_id = $2) ORDER BY tenant_id NULLS LAST LIMIT 1",
    [data.key, tenantId],
  );

  if (!flagResult.data?.rows[0]) {
    return c.json({ key: data.key, value: false, reason: "not_found" });
  }

  const flag = flagResult.data.rows[0] as {
    id: string; key: string; flag_type: string; is_active: boolean; default_value: unknown;
    rollout_percentage: number; variants: Array<{ key: string; value: unknown; weight: number }>;
    excluded_tenant_ids: string[]; starts_at: string | null; ends_at: string | null;
    target_segments: string[];
  };

  // Verifica periodo de validade
  const now = new Date();
  if (flag.starts_at && new Date(flag.starts_at) > now) {
    return c.json({ key: data.key, value: flag.default_value, reason: "not_started" });
  }
  if (flag.ends_at && new Date(flag.ends_at) < now) {
    return c.json({ key: data.key, value: flag.default_value, reason: "ended" });
  }

  // Verifica exclusao de tenant
  if (Array.isArray(flag.excluded_tenant_ids) && tenantId && flag.excluded_tenant_ids.includes(tenantId)) {
    return c.json({ key: data.key, value: flag.default_value, reason: "excluded_tenant" });
  }

  // Verifica override
  const overrideResult = await query(
    "SELECT value FROM public.feature_flag_overrides WHERE flag_id = $1 AND target_type = 'user' AND target_id = $2 LIMIT 1",
    [flag.id, userId],
  );

  if (overrideResult.data?.rows[0]) {
    const overrideValue = overrideResult.data.rows[0].value;
    // Atualiza contadores
    await query(
      "UPDATE public.feature_flags SET total_evaluations = total_evaluations + 1, true_evaluations = true_evaluations + $1, false_evaluations = false_evaluations + $2 WHERE id = $3",
      [overrideValue === true ? 1 : 0, overrideValue === false ? 1 : 0, flag.id],
    );
    // Registra evento
    await query(
      "INSERT INTO public.feature_flag_events (tenant_id, flag_id, flag_key, user_id, evaluated_value, context) VALUES ($1, $2, $3, $4, $5, $6)",
      [tenantId, flag.id, flag.key, userId, JSON.stringify(overrideValue), JSON.stringify(data.context)],
    );
    return c.json({ key: data.key, value: overrideValue, reason: "override" });
  }

  // Avaliacao por tipo
  let value: unknown = flag.default_value;
  let reason = "default";

  if (flag.flag_type === "boolean") {
    if (flag.rollout_percentage >= 100) {
      value = flag.default_value;
      reason = "full_rollout";
    } else if (flag.rollout_percentage <= 0) {
      value = false;
      reason = "zero_rollout";
    } else {
      value = evaluatePercentage(flag.key, userId, flag.rollout_percentage);
      reason = "percentage_rollout";
    }
  } else if (flag.flag_type === "percentage") {
    value = evaluatePercentage(flag.key, userId, flag.rollout_percentage);
    reason = "percentage";
  } else if (flag.flag_type === "variant") {
    if (Array.isArray(flag.variants) && flag.variants.length > 0) {
      const variant = pickVariant(flag.key, userId, flag.variants);
      value = variant.value;
      reason = `variant:${variant.key}`;
    } else {
      value = flag.default_value;
      reason = "no_variants";
    }
  } else if (flag.flag_type === "kill_switch") {
    value = flag.is_active ? flag.default_value : false;
    reason = flag.is_active ? "active" : "killed";
  }

  // Atualiza contadores
  await query(
    "UPDATE public.feature_flags SET total_evaluations = total_evaluations + 1, true_evaluations = true_evaluations + $1, false_evaluations = false_evaluations + $2 WHERE id = $3",
    [value === true ? 1 : 0, value === false ? 1 : 0, flag.id],
  );

  // Registra evento
  await query(
    "INSERT INTO public.feature_flag_events (tenant_id, flag_id, flag_key, user_id, evaluated_value, context) VALUES ($1, $2, $3, $4, $5, $6)",
    [tenantId, flag.id, flag.key, userId, JSON.stringify(value), JSON.stringify(data.context)],
  );

  return c.json({ key: data.key, value, reason });
});

// ========== Overrides ==========

featureFlagRoute.get("/:id/overrides", jwtAuth, tenantContext, requirePermission("feature_flags:read"), async (c) => {
  const flagId = c.req.param("id");
  const user = c.get("user");

  const result = await query(
    "SELECT * FROM public.feature_flag_overrides WHERE flag_id = $1 AND tenant_id = $2 ORDER BY created_at DESC",
    [flagId, user?.tenant_id ?? null],
  );

  return c.json({ overrides: result.data?.rows ?? [] });
});

featureFlagRoute.post("/overrides", jwtAuth, tenantContext, requirePermission("feature_flags:write"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<CreateOverrideInput>();
  const parsed = createOverrideSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;

  const result = await query<{ id: string }>(
    `INSERT INTO public.feature_flag_overrides (tenant_id, flag_id, target_type, target_id, value, reason, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (flag_id, target_type, target_id) DO UPDATE SET value = $5, reason = $6, created_at = timezone('utc'::text, now())
     RETURNING id`,
    [user?.tenant_id ?? null, data.flag_id, data.target_type, data.target_id,
     JSON.stringify(data.value), data.reason ?? null, user.sub],
  );

  return c.json({ id: result.data?.rows[0]?.id }, 201);
});

featureFlagRoute.delete("/overrides/:overrideId", jwtAuth, tenantContext, requirePermission("feature_flags:write"), async (c) => {
  const overrideId = c.req.param("overrideId");
  const user = c.get("user");

  await query(
    "DELETE FROM public.feature_flag_overrides WHERE id = $1 AND tenant_id = $2",
    [overrideId, user?.tenant_id ?? null],
  );

  return c.json({ deleted: true });
});

// ========== Events ==========

featureFlagRoute.get("/:id/events", jwtAuth, tenantContext, requirePermission("feature_flags:read"), async (c) => {
  const flagId = c.req.param("id");
  const user = c.get("user");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);

  const result = await query(
    `SELECT * FROM public.feature_flag_events WHERE flag_id = $1 AND tenant_id = $2
     ORDER BY created_at DESC LIMIT $3`,
    [flagId, user?.tenant_id ?? null, limit],
  );

  return c.json({ events: result.data?.rows ?? [] });
});

// ========== Stats ==========

featureFlagRoute.get("/stats/overview", jwtAuth, tenantContext, requirePermission("feature_flags:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  const overviewResult = await query(
    `SELECT
       COUNT(*) as total_flags,
       COUNT(*) FILTER (WHERE is_active = true) as active_flags,
       COUNT(*) FILTER (WHERE flag_type = 'boolean') as boolean_flags,
       COUNT(*) FILTER (WHERE flag_type = 'percentage') as percentage_flags,
       COUNT(*) FILTER (WHERE flag_type = 'variant') as variant_flags,
       COUNT(*) FILTER (WHERE flag_type = 'kill_switch') as kill_switches,
       SUM(total_evaluations) as total_evaluations,
       SUM(true_evaluations) as true_evaluations,
       SUM(false_evaluations) as false_evaluations
     FROM public.feature_flags WHERE tenant_id IS NULL OR tenant_id = $1`,
    [tenantId],
  );

  const topFlags = await query(
    `SELECT id, key, name, flag_type, is_active, rollout_percentage,
       total_evaluations, true_evaluations, false_evaluations
     FROM public.feature_flags WHERE tenant_id IS NULL OR tenant_id = $1
     ORDER BY total_evaluations DESC LIMIT 5`,
    [tenantId],
  );

  const recentEvents = await query(
    `SELECT e.id, e.flag_key, e.evaluated_value, e.created_at, e.user_id,
       f.name as flag_name
     FROM public.feature_flag_events e
     LEFT JOIN public.feature_flags f ON e.flag_id = f.id
     WHERE e.tenant_id = $1
     ORDER BY e.created_at DESC LIMIT 10`,
    [tenantId],
  );

  const overrideCount = await query(
    "SELECT COUNT(*) as count FROM public.feature_flag_overrides WHERE tenant_id = $1",
    [tenantId],
  );

  return c.json({
    overview: overviewResult.data?.rows[0] ?? { total_flags: "0", active_flags: "0", boolean_flags: "0", percentage_flags: "0", variant_flags: "0", kill_switches: "0", total_evaluations: "0", true_evaluations: "0", false_evaluations: "0" },
    top_flags: topFlags.data?.rows ?? [],
    recent_events: recentEvents.data?.rows ?? [],
    overrides_count: overrideCount.data?.rows[0]?.count ?? "0",
  });
});
