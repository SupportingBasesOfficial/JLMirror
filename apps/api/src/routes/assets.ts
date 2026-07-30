import { Hono } from "hono";
import { query } from "@repo/db";
import {
  createAssetSchema,
  updateAssetSchema,
  createLicenseSchema,
  updateLicenseSchema,
  type CreateAssetInput,
  type UpdateAssetInput,
  type CreateLicenseInput,
  type UpdateLicenseInput,
} from "@repo/shared-validation";
import { jwtAuth } from "../middleware/jwt-auth.js";
import { tenantContext } from "../middleware/tenant-context.js";
import { requirePermission } from "../middleware/require-permission.js";
import "../types.js";

export const assetRoute = new Hono();

// GET /api/v1/assets — lista ativos com filtros
assetRoute.get("/", jwtAuth, tenantContext, requirePermission("assets:read"), async (c) => {
  const user = c.get("user");
  const status = c.req.query("status");
  const assetType = c.req.query("type");
  const category = c.req.query("category");
  const criticality = c.req.query("criticality");
  const search = c.req.query("search");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "100", 10), 500);

  const conditions: string[] = ["tenant_id = $1"];
  const params: unknown[] = [user?.tenant_id ?? null];
  let paramIdx = 2;

  if (status) { conditions.push(`status = $${paramIdx++}`); params.push(status); }
  if (assetType) { conditions.push(`asset_type = $${paramIdx++}`); params.push(assetType); }
  if (category) { conditions.push(`category = $${paramIdx++}`); params.push(category); }
  if (criticality) { conditions.push(`criticality = $${paramIdx++}`); params.push(criticality); }
  if (search) {
    conditions.push(`(name ILIKE $${paramIdx} OR asset_tag ILIKE $${paramIdx} OR hostname ILIKE $${paramIdx} OR ip_address ILIKE $${paramIdx} OR serial_number ILIKE $${paramIdx})`);
    params.push(`%${search}%`);
    paramIdx++;
  }

  params.push(limit);

  const result = await query(
    `SELECT * FROM public.assets WHERE ${conditions.join(" AND ")} ORDER BY name LIMIT $${paramIdx++}`,
    params,
  );

  if (result.error) {
    return c.json({ error: { code: "QUERY_ERROR", message: "Erro ao buscar ativos" } }, 500);
  }

  return c.json({ assets: result.data?.rows ?? [] });
});

// GET /api/v1/assets/:id — detalhe com licencas e historico
assetRoute.get("/:id", jwtAuth, tenantContext, requirePermission("assets:read"), async (c) => {
  const assetId = c.req.param("id");
  const user = c.get("user");

  const assetResult = await query(
    "SELECT * FROM public.assets WHERE id = $1 AND tenant_id = $2",
    [assetId, user?.tenant_id ?? null],
  );

  if (assetResult.error || !assetResult.data?.rows[0]) {
    return c.json({ error: { code: "NOT_FOUND", message: "Ativo não encontrado" } }, 404);
  }

  const licensesResult = await query(
    "SELECT * FROM public.asset_licenses WHERE asset_id = $1 AND tenant_id = $2 ORDER BY software_name",
    [assetId, user?.tenant_id ?? null],
  );

  const changesResult = await query(
    "SELECT * FROM public.asset_changes WHERE asset_id = $1 ORDER BY created_at DESC LIMIT 20",
    [assetId],
  );

  const childrenResult = await query(
    "SELECT id, asset_tag, name, asset_type, status FROM public.assets WHERE parent_asset_id = $1 AND tenant_id = $2",
    [assetId, user?.tenant_id ?? null],
  );

  return c.json({
    asset: assetResult.data.rows[0],
    licenses: licensesResult.data?.rows ?? [],
    changes: changesResult.data?.rows ?? [],
    children: childrenResult.data?.rows ?? [],
  });
});

// POST /api/v1/assets — cria ativo
assetRoute.post("/", jwtAuth, tenantContext, requirePermission("assets:write"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<CreateAssetInput>();
  const parsed = createAssetSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
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
      user?.tenant_id ?? null, data.asset_tag, data.name, data.asset_type, data.category,
      data.status, data.criticality, data.hostname ?? null, data.ip_address ?? null,
      data.mac_address ?? null, data.serial_number ?? null, data.manufacturer ?? null,
      data.model ?? null, data.os_type ?? null, data.os_version ?? null,
      data.location ?? null, data.rack ?? null, data.rack_position ?? null,
      data.purchase_date ?? null, data.purchase_cost ?? null, data.warranty_expiry ?? null,
      data.vendor ?? null, data.assigned_to ?? null, data.department ?? null,
      data.notes ?? null, JSON.stringify(data.tags), JSON.stringify(data.custom_fields),
      data.parent_asset_id ?? null, user.sub,
    ],
  );

  if (result.error || !result.data?.rows[0]) {
    return c.json({ error: { code: "CREATE_ERROR", message: "Erro ao criar ativo" } }, 500);
  }

  const assetId = result.data.rows[0].id;

  await query("SELECT public.log_asset_change($1, 'created', NULL, NULL, NULL, $2)", [assetId, user.sub]);
  await query(
    "SELECT public.write_audit_log($1, NULL, 'asset.create', 'asset', $2, $3, NULL, NULL)",
    [user.sub, assetId, JSON.stringify({ asset_tag: data.asset_tag, name: data.name, type: data.asset_type })],
  );

  return c.json({ id: assetId }, 201);
});

// PUT /api/v1/assets/:id — atualiza ativo
assetRoute.put("/:id", jwtAuth, tenantContext, requirePermission("assets:write"), async (c) => {
  const assetId = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json<UpdateAssetInput>();
  const parsed = updateAssetSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;
  const updateFields: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  const fieldMap: Record<string, string> = {
    asset_tag: "asset_tag", name: "name", asset_type: "asset_type", category: "category",
    status: "status", criticality: "criticality", hostname: "hostname", ip_address: "ip_address",
    mac_address: "mac_address", serial_number: "serial_number", manufacturer: "manufacturer",
    model: "model", os_type: "os_type", os_version: "os_version", location: "location",
    rack: "rack", rack_position: "rack_position", purchase_date: "purchase_date",
    purchase_cost: "purchase_cost", warranty_expiry: "warranty_expiry", vendor: "vendor",
    assigned_to: "assigned_to", department: "department", notes: "notes",
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

  params.push(assetId, user?.tenant_id ?? null);

  await query(
    `UPDATE public.assets SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
    params,
  );

  // Registra mudanca de status se aplicavel
  if (data.status) {
    await query("SELECT public.log_asset_change($1, 'status_changed', 'status', NULL, $2, $3)", [assetId, data.status, user.sub]);
  }

  await query("SELECT public.log_asset_change($1, 'updated', NULL, NULL, NULL, $2)", [assetId, user.sub]);

  return c.json({ id: assetId });
});

// DELETE /api/v1/assets/:id — remove ativo
assetRoute.delete("/:id", jwtAuth, tenantContext, requirePermission("assets:write"), async (c) => {
  const assetId = c.req.param("id");
  const user = c.get("user");

  await query(
    "DELETE FROM public.assets WHERE id = $1 AND tenant_id = $2",
    [assetId, user?.tenant_id ?? null],
  );

  await query(
    "SELECT public.write_audit_log($1, NULL, 'asset.delete', 'asset', $2, NULL, NULL, NULL)",
    [user.sub, assetId],
  );

  return c.json({ deleted: true });
});

// ========== Licenses ==========

assetRoute.get("/:id/licenses", jwtAuth, tenantContext, requirePermission("assets:read"), async (c) => {
  const assetId = c.req.param("id");
  const user = c.get("user");

  const result = await query(
    "SELECT * FROM public.asset_licenses WHERE asset_id = $1 AND tenant_id = $2 ORDER BY software_name",
    [assetId, user?.tenant_id ?? null],
  );

  return c.json({ licenses: result.data?.rows ?? [] });
});

assetRoute.post("/:id/licenses", jwtAuth, tenantContext, requirePermission("assets:write"), async (c) => {
  const assetId = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json<CreateLicenseInput>();
  const parsed = createLicenseSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;
  const result = await query<{ id: string }>(
    `INSERT INTO public.asset_licenses (tenant_id, asset_id, license_key, software_name, vendor,
     license_type, seats_total, seats_used, purchase_date, expiry_date, renewal_date, cost, is_active, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING id`,
    [
      user?.tenant_id ?? null, assetId, data.license_key ?? null, data.software_name,
      data.vendor ?? null, data.license_type, data.seats_total, data.seats_used,
      data.purchase_date ?? null, data.expiry_date ?? null, data.renewal_date ?? null,
      data.cost ?? null, data.is_active, data.notes ?? null,
    ],
  );

  if (result.error || !result.data?.rows[0]) {
    return c.json({ error: { code: "CREATE_ERROR", message: "Erro ao criar licença" } }, 500);
  }

  await query("SELECT public.log_asset_change($1, 'license_added', 'license', NULL, $2, $3)", [assetId, data.software_name, user.sub]);
  await query(
    "SELECT public.write_audit_log($1, NULL, 'asset.license.add', 'asset_license', $2, $3, NULL, NULL)",
    [user.sub, result.data.rows[0].id, JSON.stringify({ asset_id: assetId, software: data.software_name })],
  );

  return c.json({ id: result.data.rows[0].id }, 201);
});

assetRoute.put("/:id/licenses/:licenseId", jwtAuth, tenantContext, requirePermission("assets:write"), async (c) => {
  const licenseId = c.req.param("licenseId");
  const user = c.get("user");
  const body = await c.req.json<UpdateLicenseInput>();
  const parsed = updateLicenseSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;
  const updateFields: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  const fieldMap: Record<string, string> = {
    license_key: "license_key", software_name: "software_name", vendor: "vendor",
    license_type: "license_type", seats_total: "seats_total", seats_used: "seats_used",
    purchase_date: "purchase_date", expiry_date: "expiry_date", renewal_date: "renewal_date",
    cost: "cost", is_active: "is_active", notes: "notes",
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

  params.push(licenseId, user?.tenant_id ?? null);

  await query(
    `UPDATE public.asset_licenses SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
    params,
  );

  return c.json({ id: licenseId });
});

assetRoute.delete("/:id/licenses/:licenseId", jwtAuth, tenantContext, requirePermission("assets:write"), async (c) => {
  const licenseId = c.req.param("licenseId");
  const assetId = c.req.param("id");
  const user = c.get("user");

  await query(
    "DELETE FROM public.asset_licenses WHERE id = $1 AND tenant_id = $2",
    [licenseId, user?.tenant_id ?? null],
  );

  await query("SELECT public.log_asset_change($1, 'license_removed', 'license', NULL, NULL, $2)", [assetId, user.sub]);

  return c.json({ deleted: true });
});

// ========== Stats ==========

assetRoute.get("/stats/overview", jwtAuth, tenantContext, requirePermission("assets:read"), async (c) => {
  const user = c.get("user");

  const statusResult = await query(
    `SELECT status, COUNT(*) as count
     FROM public.assets WHERE tenant_id = $1 GROUP BY status ORDER BY count DESC`,
    [user?.tenant_id ?? null],
  );

  const typeResult = await query(
    `SELECT asset_type, COUNT(*) as count
     FROM public.assets WHERE tenant_id = $1 GROUP BY asset_type ORDER BY count DESC`,
    [user?.tenant_id ?? null],
  );

  const criticalityResult = await query(
    `SELECT criticality, COUNT(*) as count
     FROM public.assets WHERE tenant_id = $1 AND status = 'active' GROUP BY criticality ORDER BY
     CASE criticality WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END`,
    [user?.tenant_id ?? null],
  );

  const warrantyResult = await query(
    `SELECT
       COUNT(*) FILTER (WHERE warranty_expiry IS NOT NULL AND warranty_expiry < CURRENT_DATE) as expired,
       COUNT(*) FILTER (WHERE warranty_expiry IS NOT NULL AND warranty_expiry <= CURRENT_DATE + INTERVAL '30 days' AND warranty_expiry >= CURRENT_DATE) as expiring_soon,
       COUNT(*) FILTER (WHERE warranty_expiry IS NOT NULL AND warranty_expiry > CURRENT_DATE + INTERVAL '30 days') as valid,
       COUNT(*) FILTER (WHERE warranty_expiry IS NULL) as no_warranty
     FROM public.assets WHERE tenant_id = $1 AND status = 'active'`,
    [user?.tenant_id ?? null],
  );

  const licenseResult = await query(
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE) as expired,
       COUNT(*) FILTER (WHERE expiry_date IS NOT NULL AND expiry_date <= CURRENT_DATE + INTERVAL '30 days' AND expiry_date >= CURRENT_DATE) as expiring_soon,
       COALESCE(SUM(cost), 0) as total_cost
     FROM public.asset_licenses WHERE tenant_id = $1 AND is_active = true`,
    [user?.tenant_id ?? null],
  );

  const totalResult = await query(
    "SELECT COUNT(*) as total FROM public.assets WHERE tenant_id = $1",
    [user?.tenant_id ?? null],
  );

  return c.json({
    total: totalResult.data?.rows[0]?.total ?? "0",
    by_status: statusResult.data?.rows ?? [],
    by_type: typeResult.data?.rows ?? [],
    by_criticality: criticalityResult.data?.rows ?? [],
    warranty: warrantyResult.data?.rows[0] ?? { expired: "0", expiring_soon: "0", valid: "0", no_warranty: "0" },
    licenses: licenseResult.data?.rows[0] ?? { total: "0", expired: "0", expiring_soon: "0", total_cost: "0" },
  });
});
