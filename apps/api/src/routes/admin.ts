// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import argon2 from "argon2";
import { query } from "@repo/db";
import { z } from "zod";
import { encryptTokenParts } from "@repo/zabbix";
import { invalidateZabbixConfigCache } from "./zabbix.js";
import {
  createClientUserSchema,
  createClientContactSchema,
  updateClientContactSchema,
  upsertClientCompanySchema,
  type CreateClientUserInput,
  type CreateClientContactInput,
  type UpdateClientContactInput,
  type UpsertClientCompanyInput,
} from "@repo/shared-validation";
import { jwtAuth } from "../middleware/jwt-auth.js";
import { safeJsonBody } from "../lib/safe-json.js";
import { tenantContext } from "../middleware/tenant-context.js";
import { requirePermission } from "../middleware/require-permission.js";
import "../types.js";

export const adminRoute = new Hono();

adminRoute.use("/*", jwtAuth);
adminRoute.use("/*", tenantContext);

function safeRows(result: { data?: { rows?: Array<Record<string, unknown>> } | null }): Array<Record<string, unknown>> {
  return result.data?.rows ?? [];
}

function safeCount(result: { data?: { rows?: Array<Record<string, unknown>> } | null }): number {
  const row = result.data?.rows?.[0];
  return row ? parseInt((row.count as string) ?? "0", 10) : 0;
}

const createTenantSchema = z.object({
  name: z.string().min(1).max(255),
  cnpj: z.string().max(18).optional(),
  contract_end_date: z.string().datetime().optional(),
  cluster_id: z.string().min(1).max(50),
  cluster_host: z.string().min(1).max(255),
  cluster_database_name: z.string().min(1).max(63),
  cluster_port: z.number().int().min(1).max(65535).default(5432),
  zabbix_host_group_id: z.string().min(1),
  zabbix_api_url: z.string().url(),
  zabbix_api_token: z.string().min(1),
});

const updateTenantSchema = z.object({
  name: z.string().max(255).optional(),
  cnpj: z.string().max(18).nullable().optional(),
  contract_end_date: z.string().datetime().nullable().optional(),
  status: z.enum(["active", "inactive", "suspended"]).optional(),
  zabbix_host_group_id: z.string().min(1).optional(),
  zabbix_api_url: z.string().url().optional(),
  zabbix_api_token: z.string().min(1).optional(),
});

// ========== List Tenants ==========

adminRoute.get("/tenants", requirePermission("admin:tenants:read"), async (c) => {
  const result = await query(
    `SELECT t.*, tr.cluster_id, tr.cluster_host, tr.schema_name, tr.status as route_status,
       (SELECT COUNT(*) FROM public.tenant_users tu WHERE tu.tenant_id = t.id) as user_count
     FROM public.tenants t
     LEFT JOIN public.tenant_routes tr ON t.id = tr.tenant_id
     ORDER BY t.created_at DESC`,
  );

  return c.json({ tenants: result.data?.rows ?? [] });
});

// ========== Get Single Tenant ==========

adminRoute.get("/tenants/:tenantId", requirePermission("admin:tenants:read"), async (c) => {
  const tenantId = c.req.param("tenantId");

  const tenantResult = await query(
    `SELECT t.*, tr.cluster_id, tr.cluster_host, tr.cluster_database_name, tr.cluster_port,
       tr.schema_name, tr.is_enterprise, tr.zabbix_host_group_id, tr.zabbix_api_url, tr.status as route_status
     FROM public.tenants t
     LEFT JOIN public.tenant_routes tr ON t.id = tr.tenant_id
     WHERE t.id = $1`,
    [tenantId],
  );

  if (!tenantResult.data?.rows[0]) {
    return c.json({ error: { code: "NOT_FOUND", message: "Tenant não encontrado" } }, 404);
  }

  const usersResult = await query(
    `SELECT tu.user_id, tu.role, u.email, u.full_name, u.is_active
     FROM public.tenant_users tu
     JOIN public.users u ON tu.user_id = u.id
     WHERE tu.tenant_id = $1`,
    [tenantId],
  );

  return c.json({
    tenant: tenantResult.data.rows[0],
    users: usersResult.data?.rows ?? [],
  });
});

// ========== Create Tenant ==========

adminRoute.post("/tenants", requirePermission("admin:tenants:write"), async (c) => {
  const parsedBody = await safeJsonBody(c);
  if (!parsedBody.success) return parsedBody.response;
  const parsed = createTenantSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;
  const user = c.get("user");

  // Cria tenant
  const tenantResult = await query(
    `INSERT INTO public.tenants (name, cnpj, contract_end_date, status)
     VALUES ($1, $2, $3, 'active') RETURNING id`,
    [data.name, data.cnpj ?? null, data.contract_end_date ?? null],
  );

  const tenantId = tenantResult.data?.rows[0]?.id as string;
  if (!tenantId) {
    return c.json({ error: { code: "CREATE_FAILED", message: "Falha ao criar tenant" } }, 500);
  }

  // Gera slug para schema (8 hex chars do UUID)
  const schemaSlug = tenantId.replace(/-/g, "").substring(0, 8);
  const schemaName = `tenant_${schemaSlug}`;

  // Cria schema do tenant via função de onboarding
  await query("SELECT public.onboard_tenant_schema($1)", [schemaSlug]);

  // Criptografa token Zabbix antes de armazenar
  const tokenParts = encryptTokenParts(data.zabbix_api_token);

  // Cria tenant_route
  await query(
    `INSERT INTO public.tenant_routes
     (tenant_id, cluster_id, cluster_host, cluster_database_name, cluster_port,
      schema_name, is_enterprise, zabbix_host_group_id, zabbix_api_url,
      zabbix_encrypted_token, zabbix_token_iv, zabbix_token_tag, status)
     VALUES ($1, $2, $3, $4, $5, $6, false, $7, $8, $9, $10, $11, 'active')`,
    [tenantId, data.cluster_id, data.cluster_host, data.cluster_database_name, data.cluster_port,
     schemaName, data.zabbix_host_group_id, data.zabbix_api_url,
     tokenParts.encrypted, tokenParts.iv, tokenParts.tag],
  );

  await query(
    "SELECT public.write_audit_log($1, NULL, 'admin.tenant.create', 'tenants', NULL, $2, NULL, NULL)",
    [user.sub, JSON.stringify({ id: tenantId, name: data.name })],
  );

  return c.json({ id: tenantId, schema: schemaName, created: true });
});

// ========== Update Tenant ==========

adminRoute.put("/tenants/:tenantId", requirePermission("admin:tenants:write"), async (c) => {
  const tenantId = c.req.param("tenantId");
  const user = c.get("user");
  const parsedBody = await safeJsonBody(c);
  if (!parsedBody.success) return parsedBody.response;
  const parsed = updateTenantSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;
  const updateFields: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (data.name !== undefined) { updateFields.push(`name = $${paramIdx++}`); params.push(data.name); }
  if (data.cnpj !== undefined) { updateFields.push(`cnpj = $${paramIdx++}`); params.push(data.cnpj); }
  if (data.contract_end_date !== undefined) { updateFields.push(`contract_end_date = $${paramIdx++}`); params.push(data.contract_end_date); }
  if (data.status !== undefined) { updateFields.push(`status = $${paramIdx++}`); params.push(data.status); }

  if (updateFields.length > 0) {
    params.push(tenantId);
    await query(`UPDATE public.tenants SET ${updateFields.join(", ")} WHERE id = $${paramIdx++}`, params);
  }

  // Atualiza campos Zabbix em tenant_routes
  const routeUpdateFields: string[] = [];
  const routeParams: unknown[] = [];
  let routeParamIdx = 1;

  if (data.zabbix_host_group_id !== undefined) {
    routeUpdateFields.push(`zabbix_host_group_id = $${routeParamIdx++}`);
    routeParams.push(data.zabbix_host_group_id);
  }
  if (data.zabbix_api_url !== undefined) {
    routeUpdateFields.push(`zabbix_api_url = $${routeParamIdx++}`);
    routeParams.push(data.zabbix_api_url);
  }
  if (data.zabbix_api_token !== undefined) {
    const tokenParts = encryptTokenParts(data.zabbix_api_token);
    routeUpdateFields.push(`zabbix_encrypted_token = $${routeParamIdx++}`);
    routeParams.push(tokenParts.encrypted);
    routeUpdateFields.push(`zabbix_token_iv = $${routeParamIdx++}`);
    routeParams.push(tokenParts.iv);
    routeUpdateFields.push(`zabbix_token_tag = $${routeParamIdx++}`);
    routeParams.push(tokenParts.tag);
  }

  if (routeUpdateFields.length > 0) {
    routeParams.push(tenantId);
    await query(
      `UPDATE public.tenant_routes SET ${routeUpdateFields.join(", ")} WHERE tenant_id = $${routeParamIdx++}`,
      routeParams,
    );
    // Invalida cache de config Zabbix para que proximas requests usem os novos valores
    await invalidateZabbixConfigCache(tenantId);
  }

  await query(
    "SELECT public.write_audit_log($1, NULL, 'admin.tenant.update', 'tenants', $2, $3, NULL, NULL)",
    [user.sub, tenantId, JSON.stringify(data)],
  );

  return c.json({ updated: true });
});

// ========== Suspend / Activate Tenant ==========

adminRoute.post("/tenants/:tenantId/suspend", requirePermission("admin:tenants:write"), async (c) => {
  const tenantId = c.req.param("tenantId");
  const user = c.get("user");

  await query("UPDATE public.tenants SET status = 'suspended' WHERE id = $1", [tenantId]);
  await query("UPDATE public.tenant_routes SET status = 'inactive' WHERE tenant_id = $1", [tenantId]);

  await query(
    "SELECT public.write_audit_log($1, NULL, 'admin.tenant.suspend', 'tenants', $2, NULL, NULL, NULL)",
    [user.sub, tenantId],
  );

  return c.json({ suspended: true });
});

adminRoute.post("/tenants/:tenantId/activate", requirePermission("admin:tenants:write"), async (c) => {
  const tenantId = c.req.param("tenantId");
  const user = c.get("user");

  await query("UPDATE public.tenants SET status = 'active' WHERE id = $1", [tenantId]);
  await query("UPDATE public.tenant_routes SET status = 'active' WHERE tenant_id = $1", [tenantId]);

  await query(
    "SELECT public.write_audit_log($1, NULL, 'admin.tenant.activate', 'tenants', $2, NULL, NULL, NULL)",
    [user.sub, tenantId],
  );

  return c.json({ activated: true });
});

// ========== Assign User to Tenant ==========

adminRoute.post("/tenants/:tenantId/users", requirePermission("admin:tenants:write"), async (c) => {
  const tenantId = c.req.param("tenantId");
  const user = c.get("user");
  const body = await c.req.json<{ user_id: string; role: string }>();

  if (!body.user_id || !body.role) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "user_id e role são obrigatórios" } }, 400);
  }

  const validRoles = ["global:admin", "jl:superadmin", "jl:engineer", "jl:technician", "jl:manager", "jl:finance", "jl:viewer", "tenant:admin", "tenant:operator", "tenant:viewer"];
  if (!validRoles.includes(body.role)) {
    return c.json({ error: { code: "INVALID_ROLE", message: "Role inválido" } }, 400);
  }

  await query(
    `INSERT INTO public.tenant_users (user_id, tenant_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = $3`,
    [body.user_id, tenantId, body.role],
  );

  await query(
    "SELECT public.write_audit_log($1, NULL, 'admin.tenant.assign_user', 'tenant_users', NULL, $2, NULL, NULL)",
    [user.sub, JSON.stringify({ tenant_id: tenantId, user_id: body.user_id, role: body.role })],
  );

  return c.json({ assigned: true });
});

adminRoute.delete("/tenants/:tenantId/users/:userId", requirePermission("admin:tenants:write"), async (c) => {
  const tenantId = c.req.param("tenantId");
  const userId = c.req.param("userId");
  const user = c.get("user");

  await query(
    "DELETE FROM public.tenant_users WHERE user_id = $1 AND tenant_id = $2",
    [userId, tenantId],
  );

  await query(
    "SELECT public.write_audit_log($1, NULL, 'admin.tenant.remove_user', 'tenant_users', $2, NULL, NULL, NULL)",
    [user.sub, JSON.stringify({ tenant_id: tenantId, user_id: userId })],
  );

  return c.json({ removed: true });
});

// ========== Global Stats ==========

adminRoute.get("/stats/overview", requirePermission("admin:tenants:read"), async (c) => {
  const totalTenants = safeCount(await query("SELECT COUNT(*) as count FROM public.tenants"));
  const activeTenants = safeCount(await query("SELECT COUNT(*) as count FROM public.tenants WHERE status = 'active'"));
  const suspendedTenants = safeCount(await query("SELECT COUNT(*) as count FROM public.tenants WHERE status = 'suspended'"));
  const totalUsers = safeCount(await query("SELECT COUNT(*) as count FROM public.users"));
  const activeUsers = safeCount(await query("SELECT COUNT(*) as count FROM public.users WHERE is_active = true"));
  const totalTenantUsers = safeCount(await query("SELECT COUNT(*) as count FROM public.tenant_users"));
  const totalRoutes = safeCount(await query("SELECT COUNT(*) as count FROM public.tenant_routes WHERE status = 'active'"));

  // Tenants by status
  const byStatus = safeRows(await query(
    "SELECT status, COUNT(*) as count FROM public.tenants GROUP BY status",
  ));

  // Recent tenants
  const recent = safeRows(await query(
    `SELECT id, name, status, created_at FROM public.tenants ORDER BY created_at DESC LIMIT 10`,
  ));

  // Users by role
  const byRole = safeRows(await query(
    "SELECT role, COUNT(*) as count FROM public.tenant_users GROUP BY role",
  ));

  return c.json({
    total_tenants: totalTenants,
    active_tenants: activeTenants,
    suspended_tenants: suspendedTenants,
    total_users: totalUsers,
    active_users: activeUsers,
    total_tenant_users: totalTenantUsers,
    total_routes: totalRoutes,
    by_status: byStatus,
    by_role: byRole,
    recent,
  });
});

// ========== CRM: Criar Usuário do Cliente com Senha Provisória ==========

adminRoute.post("/tenants/:tenantId/users/create", requirePermission("admin:tenants:write"), async (c) => {
  const tenantId = c.req.param("tenantId");
  const adminUser = c.get("user");
  const parsedBody = await safeJsonBody(c);
  if (!parsedBody.success) return parsedBody.response;
  const parsed = createClientUserSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos" } }, 400);
  }

  const data = parsed.data as CreateClientUserInput;

  // Verifica se email já existe
  const existingUser = await query<{ id: string }>(
    "SELECT id FROM public.users WHERE email = $1",
    [data.email],
  );

  let userId: string;

  if (existingUser.data?.rows[0]) {
    // Usuário já existe — apenas associa ao tenant se não estiver associado
    userId = existingUser.data.rows[0].id;

    const alreadyAssigned = await query<{ user_id: string }>(
      "SELECT user_id FROM public.tenant_users WHERE user_id = $1 AND tenant_id = $2",
      [userId, tenantId],
    );

    if (alreadyAssigned.data?.rows[0]) {
      return c.json({ error: { code: "USER_ALREADY_ASSIGNED", message: "Usuário já está associado a este cliente" } }, 409);
    }
  } else {
    // Cria novo usuário com senha provisória hasheada
    const passwordHash = await argon2.hash(data.provisional_password);

    const newUserResult = await query<{ id: string }>(
      `INSERT INTO public.users (email, password_hash, full_name, phone, is_active, must_change_password)
       VALUES ($1, $2, $3, $4, true, $5) RETURNING id`,
      [data.email, passwordHash, data.full_name, data.phone ?? null, data.must_change_password],
    );

    userId = newUserResult.data?.rows[0]?.id as string;
    if (!userId) {
      return c.json({ error: { code: "CREATE_FAILED", message: "Falha ao criar usuário" } }, 500);
    }
  }

  // Associa usuário ao tenant com role
  await query(
    `INSERT INTO public.tenant_users (user_id, tenant_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = $3`,
    [userId, tenantId, data.role],
  );

  // Log de auditoria
  await query(
    "SELECT public.write_audit_log($1, NULL, 'admin.client_user.create', 'users', NULL, $2, NULL, NULL)",
    [adminUser.sub, JSON.stringify({ tenant_id: tenantId, user_id: userId, email: data.email, role: data.role, must_change_password: data.must_change_password })],
  );

  return c.json({
    created: true,
    user_id: userId,
    email: data.email,
    full_name: data.full_name,
    role: data.role,
    must_change_password: data.must_change_password,
  });
});

// ========== CRM: Listar Usuários do Tenant com must_change_password ==========

adminRoute.get("/tenants/:tenantId/users", requirePermission("admin:tenants:read"), async (c) => {
  const tenantId = c.req.param("tenantId");

  const result = await query(
    `SELECT tu.user_id, tu.role, tu.created_at as assigned_at,
       u.email, u.full_name, u.phone, u.is_active, u.must_change_password, u.last_login_at
     FROM public.tenant_users tu
     JOIN public.users u ON tu.user_id = u.id
     WHERE tu.tenant_id = $1
     ORDER BY tu.created_at DESC`,
    [tenantId],
  );

  return c.json({ users: result.data?.rows ?? [] });
});

// ========== CRM: Contatos de Clientes ==========

adminRoute.get("/tenants/:tenantId/contacts", requirePermission("admin:tenants:read"), async (c) => {
  const tenantId = c.req.param("tenantId");
  const result = await query(
    `SELECT * FROM public.client_contacts WHERE tenant_id = $1 ORDER BY is_primary DESC, name ASC`,
    [tenantId],
  );
  return c.json({ contacts: result.data?.rows ?? [] });
});

adminRoute.post("/tenants/:tenantId/contacts", requirePermission("admin:tenants:write"), async (c) => {
  const tenantId = c.req.param("tenantId");
  const adminUser = c.get("user");
  const parsedBody = await safeJsonBody(c);
  if (!parsedBody.success) return parsedBody.response;
  const parsed = createClientContactSchema.safeParse({ ...parsedBody.data, tenant_id: tenantId });
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos" } }, 400);
  }

  const data = parsed.data as CreateClientContactInput;

  // Se is_primary, desmarca outros primários
  if (data.is_primary) {
    await query("UPDATE public.client_contacts SET is_primary = false WHERE tenant_id = $1", [tenantId]);
  }

  const result = await query<{ id: string }>(
    `INSERT INTO public.client_contacts (tenant_id, name, email, phone, role, department, is_primary, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [tenantId, data.name, data.email, data.phone ?? null, data.role ?? null, data.department ?? null, data.is_primary, data.notes ?? null],
  );

  await query(
    "SELECT public.write_audit_log($1, NULL, 'admin.contact.create', 'client_contacts', NULL, $2, NULL, NULL)",
    [adminUser.sub, JSON.stringify({ tenant_id: tenantId, contact_id: result.data?.rows[0]?.id, name: data.name })],
  );

  return c.json({ id: result.data?.rows[0]?.id, created: true }, 201);
});

adminRoute.put("/tenants/:tenantId/contacts/:contactId", requirePermission("admin:tenants:write"), async (c) => {
  const tenantId = c.req.param("tenantId");
  const contactId = c.req.param("contactId");
  const adminUser = c.get("user");
  const parsedBody = await safeJsonBody(c);
  if (!parsedBody.success) return parsedBody.response;
  const parsed = updateClientContactSchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos" } }, 400);
  }

  const data = parsed.data as UpdateClientContactInput;

  // Se is_primary, desmarca outros primários
  if (data.is_primary) {
    await query("UPDATE public.client_contacts SET is_primary = false WHERE tenant_id = $1", [tenantId]);
  }

  const updateFields: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (data.name !== undefined) { updateFields.push(`name = $${paramIdx++}`); params.push(data.name); }
  if (data.email !== undefined) { updateFields.push(`email = $${paramIdx++}`); params.push(data.email); }
  if (data.phone !== undefined) { updateFields.push(`phone = $${paramIdx++}`); params.push(data.phone); }
  if (data.role !== undefined) { updateFields.push(`role = $${paramIdx++}`); params.push(data.role); }
  if (data.department !== undefined) { updateFields.push(`department = $${paramIdx++}`); params.push(data.department); }
  if (data.is_primary !== undefined) { updateFields.push(`is_primary = $${paramIdx++}`); params.push(data.is_primary); }
  if (data.is_active !== undefined) { updateFields.push(`is_active = $${paramIdx++}`); params.push(data.is_active); }
  if (data.notes !== undefined) { updateFields.push(`notes = $${paramIdx++}`); params.push(data.notes); }

  if (updateFields.length > 0) {
    params.push(contactId, tenantId);
    await query(
      `UPDATE public.client_contacts SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
      params,
    );
  }

  await query(
    "SELECT public.write_audit_log($1, NULL, 'admin.contact.update', 'client_contacts', $2, $3, NULL, NULL)",
    [adminUser.sub, contactId, JSON.stringify(data)],
  );

  return c.json({ updated: true });
});

adminRoute.delete("/tenants/:tenantId/contacts/:contactId", requirePermission("admin:tenants:write"), async (c) => {
  const tenantId = c.req.param("tenantId");
  const contactId = c.req.param("contactId");
  const adminUser = c.get("user");

  await query("DELETE FROM public.client_contacts WHERE id = $1 AND tenant_id = $2", [contactId, tenantId]);

  await query(
    "SELECT public.write_audit_log($1, NULL, 'admin.contact.delete', 'client_contacts', $2, NULL, NULL, NULL)",
    [adminUser.sub, contactId],
  );

  return c.json({ deleted: true });
});

// ========== CRM: Dados Comerciais do Cliente ==========

adminRoute.get("/tenants/:tenantId/company", requirePermission("admin:tenants:read"), async (c) => {
  const tenantId = c.req.param("tenantId");
  const result = await query(
    `SELECT cc.*, t.name as tenant_name, t.status as tenant_status, t.contract_end_date
     FROM public.client_companies cc
     RIGHT JOIN public.tenants t ON cc.tenant_id = t.id
     WHERE t.id = $1`,
    [tenantId],
  );
  return c.json({ company: result.data?.rows[0] ?? null });
});

adminRoute.put("/tenants/:tenantId/company", requirePermission("admin:tenants:write"), async (c) => {
  const tenantId = c.req.param("tenantId");
  const adminUser = c.get("user");
  const parsedBody = await safeJsonBody(c);
  if (!parsedBody.success) return parsedBody.response;
  const parsed = upsertClientCompanySchema.safeParse(parsedBody.data);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos" } }, 400);
  }

  const data = parsed.data as UpsertClientCompanyInput;

  const updateFields: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      updateFields.push(`${key} = $${paramIdx++}`);
      params.push(value);
    }
  }

  if (updateFields.length > 0) {
    params.push(tenantId);
    await query(
      `INSERT INTO public.client_companies (tenant_id, ${Object.keys(data).join(", ")})
       VALUES ($${paramIdx++}, ${Object.keys(data).map((_, i) => `$${i + 1}`).join(", ")})
       ON CONFLICT (tenant_id) DO UPDATE SET ${updateFields.join(", ")}`,
      [tenantId, ...Object.values(data).filter((v) => v !== undefined)],
    );
  }

  await query(
    "SELECT public.write_audit_log($1, NULL, 'admin.company.update', 'client_companies', $2, $3, NULL, NULL)",
    [adminUser.sub, tenantId, JSON.stringify(data)],
  );

  return c.json({ upserted: true });
});

// ========== CRM: Listar Todos os Clientes com Dados Comerciais ==========

adminRoute.get("/clients", requirePermission("admin:tenants:read"), async (c) => {
  const result = await query(
    `SELECT t.id, t.name, t.status, t.contract_end_date, t.created_at,
       cc.legal_name, cc.cnpj, cc.contract_value, cc.billing_cycle, cc.plan_tier,
       cc.address_city, cc.address_state,
       (SELECT COUNT(*) FROM public.tenant_users tu WHERE tu.tenant_id = t.id) as user_count,
       (SELECT COUNT(*) FROM public.client_contacts ctc WHERE ctc.tenant_id = t.id AND ctc.is_active = true) as contact_count
     FROM public.tenants t
     LEFT JOIN public.client_companies cc ON t.id = cc.tenant_id
     ORDER BY t.created_at DESC`,
  );

  return c.json({ clients: result.data?.rows ?? [] });
});
