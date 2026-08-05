// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { z } from "zod";
import crypto from "node:crypto";
import { requirePermission } from "../middleware/require-permission.js";
import { safeRows, safeFirstRow } from "../lib/query-helpers.js";
import "../types.js";

export const tvRoute = new Hono();

// GET /api/v1/tv — overview do modulo
tvRoute.get("/", requirePermission("tv:manage"), async (c) => {
  return c.json({
    overview: "TV — Painéis para TV/monitores",
    endpoints: ["/tokens", "/tokens/:id", "/data"],
  });
});

// ========== Gestao de Tokens (auth required) ==========

const createTvTokenSchema = z.object({
  label: z.string().min(1).max(100),
  rotation_interval_seconds: z.number().int().min(5).max(300).default(30),
  panels: z
    .array(z.enum(["devices", "alerts", "sla"]))
    .min(1)
    .default(["devices", "alerts", "sla"]),
});

// POST /api/v1/tv/tokens — cria novo token de TV
tvRoute.post("/tokens", requirePermission("tv:tokens:manage"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const parsed = createTvTokenSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
      400,
    );
  }

  const data = parsed.data;
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const result = await query<{ id: string }>(
    `INSERT INTO public.tv_tokens (tenant_id, token_hash, label, rotation_interval_seconds, panels, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      user.tenant_id,
      tokenHash,
      data.label,
      data.rotation_interval_seconds,
      data.panels,
      user.sub,
    ],
  );

  const id = safeFirstRow(result)?.id;
  return c.json({ id, token: rawToken, created: true });
});

// GET /api/v1/tv/tokens — lista tokens de TV do tenant
tvRoute.get("/tokens", requirePermission("tv:tokens:read"), async (c) => {
  const user = c.get("user");
  const result = await query(
    `SELECT id, label, is_active, rotation_interval_seconds, panels, created_at, last_used_at, revoked_at
     FROM public.tv_tokens WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [user.tenant_id],
  );
  return c.json({ tokens: safeRows(result) });
});

// DELETE /api/v1/tv/tokens/:tokenId — revoga token
tvRoute.delete(
  "/tokens/:tokenId",
  requirePermission("tv:tokens:manage"),
  async (c) => {
    const user = c.get("user");
    const tokenId = c.req.param("tokenId");

    await query(
      `UPDATE public.tv_tokens SET is_active = false, revoked_at = timezone('utc'::text, now())
     WHERE id = $1 AND tenant_id = $2`,
      [tokenId, user.tenant_id],
    );

    return c.json({ revoked: true });
  },
);

// ========== Endpoints Publicos (token-based, no user auth) ==========

// Middleware: valida TV token via Bearer header
function tvTokenAuth() {
  return async (c: import("hono").Context, next: import("hono").Next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Token de TV necessário" } },
        401,
      );
    }
    const rawToken = authHeader.slice(7);
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const result = await query<{
      id: string;
      tenant_id: string;
      is_active: boolean;
      rotation_interval_seconds: number;
      panels: string[];
    }>(
      `SELECT id, tenant_id, is_active, rotation_interval_seconds, panels
       FROM public.tv_tokens WHERE token_hash = $1 AND is_active = true AND revoked_at IS NULL`,
      [tokenHash],
    );

    const token = safeFirstRow<{
      id: string;
      tenant_id: string;
      is_active: boolean;
      rotation_interval_seconds: number;
      panels: string[];
    }>(result);
    if (!token) {
      return c.json(
        {
          error: {
            code: "INVALID_TOKEN",
            message: "Token inválido ou revogado",
          },
        },
        401,
      );
    }

    // Atualiza last_used_at
    await query(
      "UPDATE public.tv_tokens SET last_used_at = timezone('utc'::text, now()) WHERE id = $1",
      [token.id],
    );

    c.set("tvToken", token);
    await next();
  };
}

// GET /api/v1/tv/data — retorna dados para o modo TV (devices, alerts, sla)
tvRoute.get("/data", tvTokenAuth(), async (c) => {
  const tvToken = c.get("tvToken") as {
    tenant_id: string;
    rotation_interval_seconds: number;
    panels: string[];
  };
  const tenantId = tvToken.tenant_id;
  const panels = tvToken.panels;

  const response: Record<string, unknown> = {
    rotation_interval_seconds: tvToken.rotation_interval_seconds,
    panels,
  };

  // Painel: Devices — resumo de dispositivos
  if (panels.includes("devices")) {
    const devicesResult = await query(
      `SELECT status, COUNT(*) as count FROM public.devices WHERE tenant_id = $1 GROUP BY status`,
      [tenantId],
    );
    const deviceStats = safeRows(devicesResult);
    const total = deviceStats.reduce(
      (sum, r) => sum + parseInt(String(r.count), 10),
      0,
    );
    const active = deviceStats.find((r) => r.status === "active")?.count ?? "0";
    const inactive =
      deviceStats.find((r) => r.status === "inactive")?.count ?? "0";

    // Ultimos dispositivos atualizados
    const recentResult = await query(
      `SELECT hostname, ip, type, status, last_seen_at
       FROM public.devices WHERE tenant_id = $1
       ORDER BY last_seen_at DESC NULLS LAST LIMIT 10`,
      [tenantId],
    );

    response.devices = {
      total,
      active: parseInt(String(active), 10),
      inactive: parseInt(String(inactive), 10),
      recent: safeRows(recentResult),
    };
  }

  // Painel: Alerts — alertas ativos
  if (panels.includes("alerts")) {
    const alertsResult = await query(
      `SELECT id, title, severity, status, created_at
       FROM public.service_incidents
       WHERE tenant_id = $1 AND status NOT IN ('resolved')
       ORDER BY severity DESC, created_at DESC LIMIT 20`,
      [tenantId],
    );

    const statsResult = await query(
      `SELECT severity, COUNT(*) as count FROM public.service_incidents
       WHERE tenant_id = $1 AND status NOT IN ('resolved')
       GROUP BY severity`,
      [tenantId],
    );

    response.alerts = {
      active_count: safeRows(alertsResult).length,
      alerts: safeRows(alertsResult),
      by_severity: safeRows(statsResult),
    };
  }

  // Painel: SLA — metricas de SLA
  if (panels.includes("sla")) {
    const slaResult = await query(
      `SELECT id, name, target_percentage, current_percentage, status
       FROM public.sla_metrics
       WHERE tenant_id = $1 ORDER BY priority ASC LIMIT 10`,
      [tenantId],
    );

    const servicesResult = await query(
      `SELECT status, COUNT(*) as count FROM public.services
       WHERE tenant_id = $1 AND is_active = true GROUP BY status`,
      [tenantId],
    );

    const serviceStats = safeRows(servicesResult);
    const operational =
      serviceStats.find((r) => r.status === "operational")?.count ?? "0";
    const degraded =
      serviceStats.find((r) => r.status === "degraded")?.count ?? "0";
    const down = serviceStats.find((r) => r.status === "down")?.count ?? "0";

    response.sla = {
      metrics: safeRows(slaResult),
      services: {
        operational: parseInt(String(operational), 10),
        degraded: parseInt(String(degraded), 10),
        down: parseInt(String(down), 10),
      },
    };
  }

  return c.json(response);
});
