// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import {
  createAssetSchema,
  updateAssetSchema,
  createLicenseSchema,
  updateLicenseSchema,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { safeJsonBody } from "../lib/safe-json.js";
import { writeAuditLog } from "../lib/audit.js";
import "../types.js";

export const assetRoute = new Hono();

// GET /api/v1/assets — lista ativos com filtros
assetRoute.get("/", requirePermission("assets:read"), async (c) => {
  const user = c.get("user");
  const status = c.req.query("status");
  const assetType = c.req.query("type");
  const category = c.req.query("category");
  const criticality = c.req.query("criticality");
  const search = c.req.query("search");
  const parsedLimit = Number.parseInt(c.req.query("limit") ?? "100", 10);
  const limit = Math.min(Number.isNaN(parsedLimit) ? 100 : parsedLimit, 500);

  const conditions: string[] = ["tenant_id = $1"];
  const params: unknown[] = [user?.tenant_id ?? null];
  let paramIdx = 2;

  if (status) {
    conditions.push(`status = $${paramIdx++}`);
    params.push(status);
  }
  if (assetType) {
    conditions.push(`asset_type = $${paramIdx++}`);
    params.push(assetType);
  }
  if (category) {
    conditions.push(`category = $${paramIdx++}`);
    params.push(category);
  }
  if (criticality) {
    conditions.push(`criticality = $${paramIdx++}`);
    params.push(criticality);
  }
  if (search) {
    conditions.push(
      `(name ILIKE $${paramIdx} OR asset_tag ILIKE $${paramIdx} OR hostname ILIKE $${paramIdx} OR ip_address ILIKE $${paramIdx} OR serial_number ILIKE $${paramIdx})`,
    );
    params.push(`%${search}%`);
    paramIdx++;
  }

  params.push(limit);

  try {
    const result = await query(
      `SELECT * FROM public.assets WHERE ${conditions.join(" AND ")} ORDER BY name LIMIT $${paramIdx++}`,
      params,
    );

    if (result.error) {
      logger.error("Erro ao listar assets", {
        tenantId: user?.tenant_id,
        error: result.error.message,
      });
      return c.json(
        { error: { code: "QUERY_ERROR", message: "Erro ao buscar ativos" } },
        500,
      );
    }

    return c.json({ assets: result.data?.rows ?? [] });
  } catch (error) {
    logger.error("Erro inesperado ao listar assets", {
      tenantId: user?.tenant_id,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

// GET /api/v1/assets/stats — estatisticas de assets (paralelizado com Promise.all)
assetRoute.get(
  "/stats",
  httpCache(30),
  requirePermission("assets:read"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const startedAt = Date.now();

    try {
      // Paraleliza 6 queries independentes (antes eram seriais)
      const [
        statusResult,
        typeResult,
        criticalityResult,
        warrantyResult,
        licenseResult,
        totalResult,
      ] = await Promise.all([
        query(
          `SELECT status, COUNT(*) as count
           FROM public.assets WHERE tenant_id = $1 GROUP BY status ORDER BY count DESC`,
          [tenantId],
        ),
        query(
          `SELECT asset_type, COUNT(*) as count
           FROM public.assets WHERE tenant_id = $1 GROUP BY asset_type ORDER BY count DESC`,
          [tenantId],
        ),
        query(
          `SELECT criticality, COUNT(*) as count
           FROM public.assets WHERE tenant_id = $1 AND status = 'active' GROUP BY criticality ORDER BY
           CASE criticality WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END`,
          [tenantId],
        ),
        query(
          `SELECT
             COUNT(*) FILTER (WHERE warranty_expiry IS NOT NULL AND warranty_expiry < CURRENT_DATE) as expired,
             COUNT(*) FILTER (WHERE warranty_expiry IS NOT NULL AND warranty_expiry <= CURRENT_DATE + INTERVAL '30 days' AND warranty_expiry >= CURRENT_DATE) as expiring_soon,
             COUNT(*) FILTER (WHERE warranty_expiry IS NOT NULL AND warranty_expiry > CURRENT_DATE + INTERVAL '30 days') as valid,
             COUNT(*) FILTER (WHERE warranty_expiry IS NULL) as no_warranty
           FROM public.assets WHERE tenant_id = $1 AND status = 'active'`,
          [tenantId],
        ),
        query(
          `SELECT
             COUNT(*) as total,
             COUNT(*) FILTER (WHERE expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE) as expired,
             COUNT(*) FILTER (WHERE expiry_date IS NOT NULL AND expiry_date <= CURRENT_DATE + INTERVAL '30 days' AND expiry_date >= CURRENT_DATE) as expiring_soon,
             COALESCE(SUM(cost), 0) as total_cost
           FROM public.asset_licenses WHERE tenant_id = $1 AND is_active = true`,
          [tenantId],
        ),
        query(
          "SELECT COUNT(*) as total FROM public.assets WHERE tenant_id = $1",
          [tenantId],
        ),
      ]);

      logger.info("Assets stats consultado", {
        tenantId,
        durationMs: Date.now() - startedAt,
      });

      return c.json({
        total: totalResult.data?.rows[0]?.total ?? "0",
        by_status: statusResult.data?.rows ?? [],
        by_type: typeResult.data?.rows ?? [],
        by_criticality: criticalityResult.data?.rows ?? [],
        warranty: warrantyResult.data?.rows[0] ?? {
          expired: "0",
          expiring_soon: "0",
          valid: "0",
          no_warranty: "0",
        },
        licenses: licenseResult.data?.rows[0] ?? {
          total: "0",
          expired: "0",
          expiring_soon: "0",
          total_cost: "0",
        },
      });
    } catch (error) {
      logger.error("Erro no assets stats", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: {
            code: "STATS_ERROR",
            message: "Erro ao buscar estatísticas",
          },
        },
        500,
      );
    }
  },
);

// GET /api/v1/assets/:id — detalhe com licencas e historico (paralelizado)
assetRoute.get("/:id", requirePermission("assets:read"), async (c) => {
  const assetId = c.req.param("id");
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  try {
    // Busca o asset primeiro para verificar posse (IDOR protection)
    const assetResult = await query(
      "SELECT * FROM public.assets WHERE id = $1 AND tenant_id = $2",
      [assetId, tenantId],
    );

    if (assetResult.error || !assetResult.data?.rows[0]) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Ativo não encontrado" } },
        404,
      );
    }

    // Paraleliza 3 queries relacionadas (licenses, changes, children)
    const [licensesResult, changesResult, childrenResult] = await Promise.all([
      query(
        "SELECT * FROM public.asset_licenses WHERE asset_id = $1 AND tenant_id = $2 ORDER BY software_name",
        [assetId, tenantId],
      ),
      query(
        // IDOR protection: filtra changes por tenant_id via JOIN com assets
        "SELECT ac.* FROM public.asset_changes ac INNER JOIN public.assets a ON ac.asset_id = a.id WHERE ac.asset_id = $1 AND a.tenant_id = $2 ORDER BY ac.created_at DESC LIMIT 20",
        [assetId, tenantId],
      ),
      query(
        "SELECT id, asset_tag, name, asset_type, status FROM public.assets WHERE parent_asset_id = $1 AND tenant_id = $2",
        [assetId, tenantId],
      ),
    ]);

    return c.json({
      asset: assetResult.data.rows[0],
      licenses: licensesResult.data?.rows ?? [],
      changes: changesResult.data?.rows ?? [],
      children: childrenResult.data?.rows ?? [],
    });
  } catch (error) {
    logger.error("Erro ao buscar detalhe do asset", {
      assetId,
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro ao carregar ativo" } },
      500,
    );
  }
});

// POST /api/v1/assets — cria ativo
assetRoute.post(
  "/",
  rateLimitWrite,
  requirePermission("assets:write"),
  async (c) => {
    const user = c.get("user");
    const userId = user?.sub ?? null;
    const tenantId = user?.tenant_id ?? null;

    try {
      const parsedBody = await safeJsonBody(c);
      if (!parsedBody.success) return parsedBody.response;
      const parsed = createAssetSchema.safeParse(parsedBody.data);
      if (!parsed.success) {
        return c.json(
          { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
          400,
        );
      }

      const data = parsed.data;
      const result = await query<{ id: string }>(
        `INSERT INTO public.assets (tenant_id, asset_tag, name, asset_type, category, status, criticality,
         hostname, ip_address, mac_address, serial_number, manufacturer, model, os_type, os_version,
         location, rack, rack_position, purchase_date, purchase_cost, warranty_expiry, vendor,
         assigned_to, department, notes, tags, custom_fields, parent_asset_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
         $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)
         RETURNING id`,
        [
          tenantId,
          data.asset_tag,
          data.name,
          data.asset_type,
          data.category ?? null,
          data.status,
          data.criticality,
          data.hostname ?? null,
          data.ip_address ?? null,
          data.mac_address ?? null,
          data.serial_number ?? null,
          data.manufacturer ?? null,
          data.model ?? null,
          data.os_type ?? null,
          data.os_version ?? null,
          data.location ?? null,
          data.rack ?? null,
          data.rack_position ?? null,
          data.purchase_date ?? null,
          data.purchase_cost ?? null,
          data.warranty_expiry ?? null,
          data.vendor ?? null,
          data.assigned_to ?? null,
          data.department ?? null,
          data.notes ?? null,
          JSON.stringify(data.tags ?? []),
          JSON.stringify(data.custom_fields ?? {}),
          data.parent_asset_id ?? null,
          userId,
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        logger.error("Erro ao criar asset", {
          tenantId,
          error: result.error?.message,
        });
        return c.json(
          { error: { code: "CREATE_ERROR", message: "Erro ao criar ativo" } },
          500,
        );
      }

      const assetId = result.data.rows[0].id;

      if (userId) {
        await query(
          "SELECT public.log_asset_change($1, 'created', NULL, NULL, NULL, $2)",
          [assetId, userId],
        );
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "asset.create",
            entityType: "asset",
            entityId: assetId,
            newData: {
              asset_tag: data.asset_tag,
              name: data.name,
              type: data.asset_type,
            },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Asset criado", { assetId, tenantId });

      return c.json({ id: assetId }, 201);
    } catch (error) {
      logger.error("Erro inesperado ao criar asset", {
        tenantId: user?.tenant_id,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar ativo" } },
        500,
      );
    }
  },
);

// PUT /api/v1/assets/:id — atualiza ativo
assetRoute.put(
  "/:id",
  rateLimitWrite,
  requirePermission("assets:write"),
  async (c) => {
    const assetId = c.req.param("id");
    const user = c.get("user");
    const userId = user?.sub ?? null;
    const tenantId = user?.tenant_id ?? null;

    try {
      const parsedBody = await safeJsonBody(c);
      if (!parsedBody.success) return parsedBody.response;
      const parsed = updateAssetSchema.safeParse(parsedBody.data);
      if (!parsed.success) {
        return c.json(
          { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
          400,
        );
      }

      const data = parsed.data;
      const updateFields: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      const fieldMap: Record<string, string> = {
        asset_tag: "asset_tag",
        name: "name",
        asset_type: "asset_type",
        category: "category",
        status: "status",
        criticality: "criticality",
        hostname: "hostname",
        ip_address: "ip_address",
        mac_address: "mac_address",
        serial_number: "serial_number",
        manufacturer: "manufacturer",
        model: "model",
        os_type: "os_type",
        os_version: "os_version",
        location: "location",
        rack: "rack",
        rack_position: "rack_position",
        purchase_date: "purchase_date",
        purchase_cost: "purchase_cost",
        warranty_expiry: "warranty_expiry",
        vendor: "vendor",
        assigned_to: "assigned_to",
        department: "department",
        notes: "notes",
        parent_asset_id: "parent_asset_id",
      };

      for (const [key, dbField] of Object.entries(fieldMap)) {
        if (data[key as keyof typeof data] !== undefined) {
          updateFields.push(`${dbField} = $${paramIdx++}`);
          params.push(data[key as keyof typeof data]);
        }
      }

      if (data.tags !== undefined) {
        updateFields.push(`tags = $${paramIdx++}`);
        params.push(JSON.stringify(data.tags));
      }
      if (data.custom_fields !== undefined) {
        updateFields.push(`custom_fields = $${paramIdx++}`);
        params.push(JSON.stringify(data.custom_fields));
      }

      if (updateFields.length === 0) {
        return c.json({ id: assetId });
      }

      params.push(assetId, tenantId);

      await query(
        `UPDATE public.assets SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
        params,
      );

      // Registra mudanca de status se aplicavel
      if (data.status && userId) {
        await query(
          "SELECT public.log_asset_change($1, 'status_changed', 'status', NULL, $2, $3)",
          [assetId, data.status, userId],
        );
      }

      if (userId) {
        await query(
          "SELECT public.log_asset_change($1, 'updated', NULL, NULL, NULL, $2)",
          [assetId, userId],
        );
      }

      return c.json({ id: assetId });
    } catch (error) {
      logger.error("Erro ao atualizar asset", {
        assetId,
        tenantId: user?.tenant_id,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao atualizar ativo" } },
        500,
      );
    }
  },
);

// DELETE /api/v1/assets/:id — remove ativo
assetRoute.delete(
  "/:id",
  rateLimitWrite,
  requirePermission("assets:write"),
  async (c) => {
    const assetId = c.req.param("id");
    const user = c.get("user");
    const userId = user?.sub ?? null;
    const tenantId = user?.tenant_id ?? null;

    try {
      // Verifica se o asset existe e pertence ao tenant antes de deletar
      const checkResult = await query(
        "SELECT id FROM public.assets WHERE id = $1 AND tenant_id = $2",
        [assetId, tenantId],
      );

      if (!checkResult.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Ativo não encontrado" } },
          404,
        );
      }

      await query(
        "DELETE FROM public.assets WHERE id = $1 AND tenant_id = $2",
        [assetId, tenantId],
      );

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "asset.delete",
            entityType: "asset",
            entityId: assetId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Asset deletado", { assetId, tenantId });

      return c.json({ deleted: true });
    } catch (error) {
      logger.error("Erro ao deletar asset", {
        assetId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "DELETE_ERROR", message: "Erro ao excluir ativo" } },
        500,
      );
    }
  },
);

// ========== Licenses ==========

assetRoute.get("/:id/licenses", requirePermission("assets:read"), async (c) => {
  const assetId = c.req.param("id");
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  try {
    const result = await query(
      "SELECT * FROM public.asset_licenses WHERE asset_id = $1 AND tenant_id = $2 ORDER BY software_name",
      [assetId, tenantId],
    );

    return c.json({ licenses: result.data?.rows ?? [] });
  } catch (error) {
    logger.error("Erro ao listar licencas do asset", {
      assetId,
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

assetRoute.post(
  "/:id/licenses",
  rateLimitWrite,
  requirePermission("assets:write"),
  async (c) => {
    const assetId = c.req.param("id");
    const user = c.get("user");
    const userId = user?.sub ?? null;
    const tenantId = user?.tenant_id ?? null;

    try {
      const parsedBody = await safeJsonBody(c);
      if (!parsedBody.success) return parsedBody.response;
      const parsed = createLicenseSchema.safeParse(parsedBody.data);
      if (!parsed.success) {
        return c.json(
          { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
          400,
        );
      }

      // Verifica se o asset pertence ao tenant antes de adicionar licenca (IDOR protection)
      const assetCheck = await query(
        "SELECT id FROM public.assets WHERE id = $1 AND tenant_id = $2",
        [assetId, tenantId],
      );

      if (!assetCheck.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Ativo não encontrado" } },
          404,
        );
      }

      const data = parsed.data;
      const result = await query<{ id: string }>(
        `INSERT INTO public.asset_licenses (tenant_id, asset_id, license_key, software_name, vendor,
         license_type, seats_total, seats_used, purchase_date, expiry_date, renewal_date, cost, is_active, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id`,
        [
          tenantId,
          assetId,
          data.license_key ?? null,
          data.software_name,
          data.vendor ?? null,
          data.license_type,
          data.seats_total,
          data.seats_used,
          data.purchase_date ?? null,
          data.expiry_date ?? null,
          data.renewal_date ?? null,
          data.cost ?? null,
          data.is_active,
          data.notes ?? null,
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          { error: { code: "CREATE_ERROR", message: "Erro ao criar licença" } },
          500,
        );
      }

      if (userId) {
        await query(
          "SELECT public.log_asset_change($1, 'license_added', 'license', NULL, $2, $3)",
          [assetId, data.software_name, userId],
        );
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "asset.license.add",
            entityType: "asset_license",
            entityId: result.data.rows[0].id,
            newData: { asset_id: assetId, software: data.software_name },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      return c.json({ id: result.data.rows[0].id }, 201);
    } catch (error) {
      logger.error("Erro ao criar licenca", {
        assetId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar licença" } },
        500,
      );
    }
  },
);

assetRoute.put(
  "/:id/licenses/:licenseId",
  rateLimitWrite,
  requirePermission("assets:write"),
  async (c) => {
    const licenseId = c.req.param("licenseId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const parsedBody = await safeJsonBody(c);
      if (!parsedBody.success) return parsedBody.response;
      const parsed = updateLicenseSchema.safeParse(parsedBody.data);
      if (!parsed.success) {
        return c.json(
          { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
          400,
        );
      }

      const data = parsed.data;
      const updateFields: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      const fieldMap: Record<string, string> = {
        license_key: "license_key",
        software_name: "software_name",
        vendor: "vendor",
        license_type: "license_type",
        seats_total: "seats_total",
        seats_used: "seats_used",
        purchase_date: "purchase_date",
        expiry_date: "expiry_date",
        renewal_date: "renewal_date",
        cost: "cost",
        is_active: "is_active",
        notes: "notes",
      };

      for (const [key, dbField] of Object.entries(fieldMap)) {
        if (data[key as keyof typeof data] !== undefined) {
          updateFields.push(`${dbField} = $${paramIdx++}`);
          params.push(data[key as keyof typeof data]);
        }
      }

      if (updateFields.length === 0) {
        return c.json({ id: licenseId });
      }

      params.push(licenseId, tenantId);

      await query(
        `UPDATE public.asset_licenses SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
        params,
      );

      return c.json({ id: licenseId });
    } catch (error) {
      logger.error("Erro ao atualizar licenca", {
        licenseId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "UPDATE_ERROR", message: "Erro ao atualizar licença" },
        },
        500,
      );
    }
  },
);

assetRoute.delete(
  "/:id/licenses/:licenseId",
  rateLimitWrite,
  requirePermission("assets:write"),
  async (c) => {
    const licenseId = c.req.param("licenseId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        "DELETE FROM public.asset_licenses WHERE id = $1 AND tenant_id = $2 RETURNING id",
        [licenseId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Licença não encontrada" } },
          404,
        );
      }

      return c.json({ deleted: true });
    } catch (error) {
      logger.error("Erro ao deletar licenca", {
        licenseId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "DELETE_ERROR", message: "Erro ao excluir licença" } },
        500,
      );
    }
  },
);
