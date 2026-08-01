// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { createHash } from "node:crypto";
import { jwtAuth } from "../middleware/jwt-auth.js";
import { tenantContext } from "../middleware/tenant-context.js";
import { requirePermission } from "../middleware/require-permission.js";
import "../types.js";

export const driftRoute = new Hono();

driftRoute.use("/*", jwtAuth);
driftRoute.use("/*", tenantContext);

// ========== Baselines ==========

// GET /api/v1/drift/baselines — lista baselines
driftRoute.get("/baselines", requirePermission("drift:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const result = await query(
    `SELECT b.*, d.hostname as device_hostname, d.ip as device_ip,
       (SELECT COUNT(*) FROM public.config_drift_events e WHERE e.baseline_id = b.id AND e.status = 'open') as open_drifts
     FROM public.config_baselines b
     JOIN public.devices d ON b.device_id = d.id
     WHERE b.tenant_id = $1
     ORDER BY b.created_at DESC`,
    [tenantId],
  );

  return c.json({ baselines: result.data?.rows ?? [] });
});

// POST /api/v1/drift/baselines — captura baseline de um dispositivo
driftRoute.post("/baselines", requirePermission("drift:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const body = await c.req.json();

  const { device_id, name, config_snapshot } = body;

  if (!device_id || !name || !config_snapshot) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "device_id, name e config_snapshot são obrigatórios" } }, 400);
  }

  // Valida que o dispositivo pertence ao tenant
  const deviceResult = await query("SELECT id, hostname FROM public.devices WHERE id = $1 AND tenant_id = $2", [device_id, tenantId]);
  if (!deviceResult.data?.rows[0]) {
    return c.json({ error: { code: "DEVICE_NOT_FOUND", message: "Dispositivo não encontrado" } }, 404);
  }

  const configHash = createHash("sha256").update(JSON.stringify(config_snapshot)).digest("hex");

  const result = await query<{ id: string }>(
    `INSERT INTO public.config_baselines (tenant_id, device_id, name, config_snapshot, config_hash, captured_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (device_id, name) DO UPDATE SET
       config_snapshot = EXCLUDED.config_snapshot,
       config_hash = EXCLUDED.config_hash,
       captured_at = timezone('utc'::text, now()),
       captured_by = EXCLUDED.captured_by,
       is_active = true
     RETURNING id`,
    [tenantId, device_id, name, JSON.stringify(config_snapshot), configHash, user.sub],
  );

  await query(
    "SELECT public.write_audit_log($1, NULL, 'drift.baseline.create', 'config_baselines', NULL, $2, NULL, NULL)",
    [user.sub, JSON.stringify({ id: result.data?.rows[0]?.id, device_id, name })],
  );

  return c.json({ id: result.data?.rows[0]?.id, created: true, config_hash: configHash });
});

// DELETE /api/v1/drift/baselines/:id — remove baseline
driftRoute.delete("/baselines/:id", requirePermission("drift:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const baselineId = c.req.param("id");

  await query("DELETE FROM public.config_baselines WHERE id = $1 AND tenant_id = $2", [baselineId, tenantId]);

  await query(
    "SELECT public.write_audit_log($1, NULL, 'drift.baseline.delete', 'config_baselines', $2, NULL, NULL, NULL)",
    [user.sub, baselineId],
  );

  return c.json({ deleted: true });
});

// ========== Drift Events ==========

// GET /api/v1/drift/events — lista eventos de drift
driftRoute.get("/events", requirePermission("drift:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);
  const status = c.req.query("status");
  const deviceId = c.req.query("device_id");

  let sql = `SELECT e.*, d.hostname as device_hostname, b.name as baseline_name
     FROM public.config_drift_events e
     JOIN public.devices d ON e.device_id = d.id
     JOIN public.config_baselines b ON e.baseline_id = b.id
     WHERE e.tenant_id = $1`;
  const params: unknown[] = [tenantId];
  let paramIdx = 2;

  if (status) {
    sql += ` AND e.status = $${paramIdx++}`;
    params.push(status);
  }
  if (deviceId) {
    sql += ` AND e.device_id = $${paramIdx++}`;
    params.push(deviceId);
  }

  sql += ` ORDER BY e.detected_at DESC LIMIT $${paramIdx++}`;
  params.push(limit);

  const result = await query(sql, params);

  return c.json({ events: result.data?.rows ?? [] });
});

// POST /api/v1/drift/scan — escanea um dispositivo contra baseline
driftRoute.post("/scan", requirePermission("drift:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const body = await c.req.json();

  const { device_id, current_config } = body;

  if (!device_id || !current_config) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "device_id e current_config são obrigatórios" } }, 400);
  }

  // Busca baseline ativo
  const baselineResult = await query<{ id: string; config_snapshot: Record<string, unknown>; config_hash: string }>(
    "SELECT id, config_snapshot, config_hash FROM public.config_baselines WHERE device_id = $1 AND tenant_id = $2 AND is_active = true ORDER BY captured_at DESC LIMIT 1",
    [device_id, tenantId],
  );

  const baseline = baselineResult.data?.rows[0];
  if (!baseline) {
    return c.json({ error: { code: "NO_BASELINE", message: "Nenhum baseline ativo encontrado para este dispositivo" } }, 404);
  }

  const baselineConfig = baseline.config_snapshot as Record<string, unknown>;
  const drifts: Array<{ path: string; drift_type: string; old_value: string | null; new_value: string | null; severity: string }> = [];

  // Compara chaves
  const allKeys = new Set([...Object.keys(baselineConfig), ...Object.keys(current_config)]);

  for (const key of allKeys) {
    const inBaseline = key in baselineConfig;
    const inCurrent = key in current_config;
    const oldVal = inBaseline ? JSON.stringify(baselineConfig[key]) : null;
    const newVal = inCurrent ? JSON.stringify(current_config[key]) : null;

    if (!inBaseline && inCurrent) {
      drifts.push({ path: key, drift_type: "added", old_value: null, new_value: newVal, severity: "warning" });
    } else if (inBaseline && !inCurrent) {
      drifts.push({ path: key, drift_type: "removed", old_value: oldVal, new_value: null, severity: "critical" });
    } else if (oldVal !== newVal) {
      drifts.push({ path: key, drift_type: "modified", old_value: oldVal, new_value: newVal, severity: "warning" });
    }
  }

  // Registra drifts no banco
  let inserted = 0;
  for (const drift of drifts) {
    await query(
      `INSERT INTO public.config_drift_events (tenant_id, device_id, baseline_id, drift_type, config_path, old_value, new_value, severity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [tenantId, device_id, baseline.id, drift.drift_type, drift.path, drift.old_value, drift.new_value, drift.severity],
    );
    inserted++;
  }

  await query(
    "SELECT public.write_audit_log($1, NULL, 'drift.scan', 'config_drift_events', NULL, $2, NULL, NULL)",
    [user.sub, JSON.stringify({ device_id, baseline_id: baseline.id, drifts_found: inserted })],
  );

  return c.json({ drifts_found: inserted, drifts });
});

// PUT /api/v1/drift/events/:id/resolve — resolve um drift
driftRoute.put("/events/:id/resolve", requirePermission("drift:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const eventId = c.req.param("id");

  await query(
    "UPDATE public.config_drift_events SET status = 'resolved', resolved_by = $1, resolved_at = timezone('utc'::text, now()) WHERE id = $2 AND tenant_id = $3",
    [user.sub, eventId, tenantId],
  );

  return c.json({ resolved: true });
});

// PUT /api/v1/drift/events/:id/acknowledge — reconhece um drift
driftRoute.put("/events/:id/acknowledge", requirePermission("drift:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;
  const eventId = c.req.param("id");

  await query(
    "UPDATE public.config_drift_events SET status = 'acknowledged' WHERE id = $1 AND tenant_id = $2",
    [eventId, tenantId],
  );

  return c.json({ acknowledged: true });
});

// GET /api/v1/drift/stats — estatisticas
driftRoute.get("/stats", requirePermission("drift:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const totalBaselines = await query("SELECT COUNT(*) as count FROM public.config_baselines WHERE tenant_id = $1 AND is_active = true", [tenantId]);
  const openDrifts = await query("SELECT COUNT(*) as count FROM public.config_drift_events WHERE tenant_id = $1 AND status = 'open'", [tenantId]);
  const criticalDrifts = await query("SELECT COUNT(*) as count FROM public.config_drift_events WHERE tenant_id = $1 AND status = 'open' AND severity = 'critical'", [tenantId]);
  const recentDrifts = await query("SELECT COUNT(*) as count FROM public.config_drift_events WHERE tenant_id = $1 AND detected_at >= timezone('utc'::text, now()) - INTERVAL '24 hours'", [tenantId]);
  const byDevice = await query(
    `SELECT d.hostname, COUNT(*) as drift_count
     FROM public.config_drift_events e
     JOIN public.devices d ON e.device_id = d.id
     WHERE e.tenant_id = $1 AND e.status = 'open'
     GROUP BY d.hostname ORDER BY drift_count DESC LIMIT 10`,
    [tenantId],
  );

  const getCount = (r: { data?: { rows?: Array<Record<string, unknown>> } | null }): number => {
    const row = r.data?.rows?.[0];
    return row ? parseInt((row.count as string) ?? "0", 10) : 0;
  };

  return c.json({
    total_baselines: getCount(totalBaselines),
    open_drifts: getCount(openDrifts),
    critical_drifts: getCount(criticalDrifts),
    recent_drifts_24h: getCount(recentDrifts),
    by_device: byDevice.data?.rows ?? [],
  });
});
