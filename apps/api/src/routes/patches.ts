// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { z } from "zod";
import { logger } from "@repo/logger";
import { requirePermission } from "../middleware/require-permission.js";
import { httpCache } from "../middleware/http-cache.js";
import { safeJsonBody } from "../lib/safe-json.js";
import { writeAuditLog } from "../lib/audit.js";
import "../types.js";

export const patchRoute = new Hono();

// GET /api/v1/patches — overview do modulo
patchRoute.get("/", requirePermission("patches:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  try {
    const patchesResult = await query(
      "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'pending') as pending FROM public.patches WHERE tenant_id = $1",
      [tenantId],
    );

    return c.json({
      overview: {
        patches: patchesResult.data?.rows[0] ?? { total: "0", pending: "0" },
      },
      endpoints: ["/scans", "/deployments", "/deployments/:id"],
    });
  } catch (error) {
    logger.error("Erro ao buscar overview de patches", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

const severitySchema = z.enum(["critical", "high", "medium", "low"]);
const categorySchema = z.enum(["security", "feature", "bugfix", "driver"]);

const createPatchSchema = z.object({
  device_id: z.string().uuid().optional(),
  device_hostname: z.string().max(255).optional(),
  kb_article: z.string().max(100).optional(),
  patch_name: z.string().min(1).max(500),
  vendor: z.string().min(1).max(100),
  product: z.string().min(1).max(200),
  version: z.string().max(100).optional(),
  severity: severitySchema,
  category: categorySchema.default("security"),
  description: z.string().optional(),
  release_date: z.string().datetime().optional(),
  requires_reboot: z.boolean().default(false),
  size_bytes: z.number().int().positive().optional(),
  scan_id: z.string().uuid().optional(),
});

const createDeploymentSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  patch_ids: z.array(z.string().uuid()).min(1),
  target_device_ids: z.array(z.string().uuid()).min(1),
  scheduled_at: z.string().datetime().optional(),
});

// GET /api/v1/patches — lista patches com filtros
patchRoute.get(
  "/",
  requirePermission("assets:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const status = c.req.query("status");
      const severity = c.req.query("severity");
      const deviceId = c.req.query("device_id");
      const limit = Math.min(
        Number.parseInt(c.req.query("limit") ?? "100", 10) || 100,
        500,
      );

      const conditions: string[] = ["tenant_id = $1"];
      const params: unknown[] = [tenantId];
      let paramIdx = 2;

      if (status) {
        conditions.push(`status = $${paramIdx++}`);
        params.push(status);
      }
      if (severity) {
        conditions.push(`severity = $${paramIdx++}`);
        params.push(severity);
      }
      if (deviceId) {
        conditions.push(`device_id = $${paramIdx++}`);
        params.push(deviceId);
      }
      params.push(limit);

      const result = await query(
        `SELECT * FROM public.patches WHERE ${conditions.join(" AND ")} ORDER BY
         CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
         created_at DESC
       LIMIT $${paramIdx++}`,
        params,
      );

      return c.json({ patches: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar patches", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// POST /api/v1/patches — registra um patch
patchRoute.post("/", requirePermission("assets:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;
  const userId = user?.sub ?? null;

  try {
    const bodyResult = await safeJsonBody(c);
    if (!bodyResult.success) return bodyResult.response;
    const parsed = createPatchSchema.safeParse(bodyResult.data);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Dados inválidos",
          },
        },
        400,
      );
    }

    const data = parsed.data;
    const result = await query<{ id: string }>(
      `INSERT INTO public.patches (tenant_id, device_id, device_hostname, kb_article, patch_name, vendor, product, version, severity, category, description, release_date, requires_reboot, size_bytes, scan_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
      [
        tenantId,
        data.device_id ?? null,
        data.device_hostname ?? null,
        data.kb_article ?? null,
        data.patch_name,
        data.vendor,
        data.product,
        data.version ?? null,
        data.severity,
        data.category,
        data.description ?? null,
        data.release_date ?? null,
        data.requires_reboot,
        data.size_bytes ?? null,
        data.scan_id ?? null,
      ],
    );

    if (result.error || !result.data?.rows[0]) {
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao registrar patch" } },
        500,
      );
    }

    if (userId) {
      try {
        await writeAuditLog({
          userId,
          tenantId,
          action: "patch.register",
          entityType: "patches",
          newData: {
            id: result.data.rows[0].id,
            name: data.patch_name,
            severity: data.severity,
          },
        });
      } catch {
        // Audit log falhou — nao bloqueia
      }
    }

    return c.json({ id: result.data.rows[0].id }, 201);
  } catch (error) {
    logger.error("Erro ao registrar patch", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

// PATCH /api/v1/patches/:id/approve — aprova um patch para instalação
patchRoute.post(
  "/:id/approve",
  requirePermission("assets:write"),
  async (c) => {
    const patchId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;

    try {
      const result = await query(
        "UPDATE public.patches SET status = 'approved', approved_by = $1, approved_at = timezone('utc'::text, now()) WHERE id = $2 AND tenant_id = $3 AND status IN ('available', 'rejected') RETURNING patch_name",
        [userId, patchId, tenantId],
      );

      if (!result.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message:
                "Patch não encontrado ou não está disponível para aprovação",
            },
          },
          404,
        );
      }

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "patch.approve",
            entityType: "patches",
            entityId: patchId,
            newData: { patch_name: result.data.rows[0].patch_name },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      return c.json({ approved: true });
    } catch (error) {
      logger.error("Erro ao aprovar patch", {
        patchId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// POST /api/v1/patches/:id/reject — rejeita um patch
patchRoute.post("/:id/reject", requirePermission("assets:write"), async (c) => {
  const patchId = c.req.param("id");
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;
  const userId = user?.sub ?? null;

  try {
    const body = await c.req
      .json<{ reason?: string }>()
      .catch(() => ({ reason: undefined }));

    await query(
      "UPDATE public.patches SET status = 'rejected' WHERE id = $1 AND tenant_id = $2 AND status = 'available'",
      [patchId, tenantId],
    );

    if (userId) {
      try {
        await writeAuditLog({
          userId,
          tenantId,
          action: "patch.reject",
          entityType: "patches",
          entityId: patchId,
          newData: { reason: body.reason ?? "Rejeitado manualmente" },
        });
      } catch {
        // Audit log falhou — nao bloqueia
      }
    }

    return c.json({ rejected: true });
  } catch (error) {
    logger.error("Erro ao rejeitar patch", {
      patchId,
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

// POST /api/v1/patches/:id/install — marca patch como instalado
patchRoute.post(
  "/:id/install",
  requirePermission("assets:write"),
  async (c) => {
    const patchId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;

    try {
      const result = await query(
        "UPDATE public.patches SET status = 'installed', installed_date = timezone('utc'::text, now()), installed_by = $1 WHERE id = $2 AND tenant_id = $3 AND status IN ('approved', 'installing', 'failed') RETURNING patch_name",
        [userId, patchId, tenantId],
      );

      if (!result.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Patch não encontrado ou não está aprovado",
            },
          },
          404,
        );
      }

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "patch.install",
            entityType: "patches",
            entityId: patchId,
            newData: { patch_name: result.data.rows[0].patch_name },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      return c.json({ installed: true });
    } catch (error) {
      logger.error("Erro ao instalar patch", {
        patchId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// GET /api/v1/patches/summary — resumo de patches por severidade e status
patchRoute.get(
  "/summary",
  requirePermission("assets:read"),
  httpCache(60),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE severity = 'critical') as critical,
         COUNT(*) FILTER (WHERE severity = 'high') as high,
         COUNT(*) FILTER (WHERE severity = 'medium') as medium,
         COUNT(*) FILTER (WHERE severity = 'low') as low,
         COUNT(*) FILTER (WHERE status = 'available') as available,
         COUNT(*) FILTER (WHERE status = 'approved') as approved,
         COUNT(*) FILTER (WHERE status = 'installed') as installed,
         COUNT(*) FILTER (WHERE status = 'failed') as failed,
         COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
         COUNT(*) FILTER (WHERE requires_reboot = true) as requires_reboot
       FROM public.patches WHERE tenant_id = $1`,
        [tenantId],
      );

      const recentScans = await query(
        "SELECT * FROM public.patch_scans WHERE tenant_id = $1 ORDER BY scan_date DESC LIMIT 5",
        [tenantId],
      );

      return c.json({
        summary: result.data?.rows[0] ?? {
          total: "0",
          critical: "0",
          high: "0",
          medium: "0",
          low: "0",
          available: "0",
          approved: "0",
          installed: "0",
          failed: "0",
          rejected: "0",
          requires_reboot: "0",
        },
        recent_scans: recentScans.data?.rows ?? [],
      });
    } catch (error) {
      logger.error("Erro ao buscar summary de patches", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// GET /api/v1/patches/deployments — lista jobs de deployment
patchRoute.get("/deployments", requirePermission("assets:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  try {
    const status = c.req.query("status");

    const conditions: string[] = ["tenant_id = $1"];
    const params: unknown[] = [tenantId];
    let paramIdx = 2;

    if (status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(status);
    }

    const result = await query(
      `SELECT * FROM public.patch_deployment_jobs WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`,
      params,
    );

    return c.json({ deployments: result.data?.rows ?? [] });
  } catch (error) {
    logger.error("Erro ao listar deployments", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

// POST /api/v1/patches/deployments — cria job de deployment
patchRoute.post(
  "/deployments",
  requirePermission("assets:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;

    try {
      const bodyResult = await safeJsonBody(c);
      if (!bodyResult.success) return bodyResult.response;
      const parsed = createDeploymentSchema.safeParse(bodyResult.data);
      if (!parsed.success) {
        return c.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: parsed.error.issues[0]?.message ?? "Dados inválidos",
            },
          },
          400,
        );
      }

      const data = parsed.data;

      // Verifica se todos os patches têm requires_reboot
      const rebootResult = await query(
        "SELECT COUNT(*) as count FROM public.patches WHERE id = ANY($1::uuid[]) AND requires_reboot = true",
        [data.patch_ids],
      );
      const requiresReboot =
        (Number.parseInt(
          (rebootResult.data?.rows[0]?.count as string) ?? "0",
          10,
        ) || 0) > 0;

      const result = await query<{ id: string }>(
        `INSERT INTO public.patch_deployment_jobs (tenant_id, name, description, patch_ids, target_device_ids, total_patches, total_devices, requires_reboot, scheduled_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [
          tenantId,
          data.name,
          data.description ?? null,
          data.patch_ids,
          data.target_device_ids,
          data.patch_ids.length,
          data.target_device_ids.length,
          requiresReboot,
          data.scheduled_at ?? null,
          userId,
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "CREATE_ERROR",
              message: "Erro ao criar deployment",
            },
          },
          500,
        );
      }

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "patch.deployment.create",
            entityType: "patch_deployment_jobs",
            newData: {
              id: result.data.rows[0].id,
              name: data.name,
              patches: data.patch_ids.length,
              devices: data.target_device_ids.length,
            },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      return c.json({ id: result.data.rows[0].id }, 201);
    } catch (error) {
      logger.error("Erro ao criar deployment", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// POST /api/v1/patches/deployments/:id/approve — aprova e inicia deployment
patchRoute.post(
  "/deployments/:id/approve",
  requirePermission("assets:write"),
  async (c) => {
    const deploymentId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;

    try {
      const result = await query<{
        name: string;
        patch_ids: string[];
        target_device_ids: string[];
      }>(
        "SELECT name, patch_ids, target_device_ids FROM public.patch_deployment_jobs WHERE id = $1 AND tenant_id = $2 AND status = 'pending'",
        [deploymentId, tenantId],
      );

      if (!result.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Deployment não encontrado ou não está pendente",
            },
          },
          404,
        );
      }

      const deployment = result.data.rows[0];

      await query(
        "UPDATE public.patch_deployment_jobs SET status = 'running', started_at = timezone('utc'::text, now()), approved_by = $1, approved_at = timezone('utc'::text, now()) WHERE id = $2",
        [userId, deploymentId],
      );

      // Marca patches como installing (batch update)
      await query(
        "UPDATE public.patches SET status = 'installing' WHERE id = ANY($1::uuid[]) AND tenant_id = $2",
        [deployment.patch_ids, tenantId],
      );

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "patch.deployment.approve",
            entityType: "patch_deployment_jobs",
            entityId: deploymentId,
            newData: { name: deployment.name },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      return c.json({ approved: true, status: "running" });
    } catch (error) {
      logger.error("Erro ao aprovar deployment", {
        deploymentId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// POST /api/v1/patches/deployments/:id/complete — marca deployment como completo
patchRoute.post(
  "/deployments/:id/complete",
  requirePermission("assets:write"),
  async (c) => {
    const deploymentId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;

    try {
      const body = await c.req
        .json<{ successful: number; failed: number }>()
        .catch(() => ({ successful: 0, failed: 0 }));

      await query(
        "UPDATE public.patch_deployment_jobs SET status = 'completed', completed_at = timezone('utc'::text, now()), successful_installs = $1, failed_installs = $2 WHERE id = $3 AND tenant_id = $4 AND status = 'running'",
        [body.successful, body.failed, deploymentId, tenantId],
      );

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "patch.deployment.complete",
            entityType: "patch_deployment_jobs",
            entityId: deploymentId,
            newData: { successful: body.successful, failed: body.failed },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      return c.json({ completed: true });
    } catch (error) {
      logger.error("Erro ao completar deployment", {
        deploymentId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// POST /api/v1/patches/scans — registra um scan de patches
patchRoute.post("/scans", requirePermission("assets:write"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;
  const userId = user?.sub ?? null;

  try {
    const body = await c.req
      .json<{
        total_devices: number;
        scanned_devices: number;
        total_patches: number;
        critical_patches: number;
        high_patches: number;
        medium_patches: number;
        low_patches: number;
      }>()
      .catch(() => ({
        total_devices: 0,
        scanned_devices: 0,
        total_patches: 0,
        critical_patches: 0,
        high_patches: 0,
        medium_patches: 0,
        low_patches: 0,
      }));

    const result = await query<{ id: string }>(
      `INSERT INTO public.patch_scans (tenant_id, total_devices, scanned_devices, total_patches, critical_patches, high_patches, medium_patches, low_patches, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        tenantId,
        body.total_devices ?? 0,
        body.scanned_devices ?? 0,
        body.total_patches ?? 0,
        body.critical_patches ?? 0,
        body.high_patches ?? 0,
        body.medium_patches ?? 0,
        body.low_patches ?? 0,
        userId,
      ],
    );

    return c.json({ id: result.data?.rows[0]?.id }, 201);
  } catch (error) {
    logger.error("Erro ao registrar scan", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});
