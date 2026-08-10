// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import argon2 from "argon2";
import { query } from "@repo/db";
import { z } from "zod";
import { logger } from "@repo/logger";
import { encryptTokenParts, BlindedZabbixClient } from "@repo/zabbix";
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
import { safeJsonBody } from "../lib/safe-json.js";
import { safeRows, safeCount } from "../lib/query-helpers.js";
import { writeAuditLog } from "../lib/audit.js";
import { requirePermission } from "../middleware/require-permission.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import "../types.js";

export const adminRoute = new Hono();

// GET /api/v1/admin — overview do modulo
adminRoute.get(
  "/",
  requirePermission("admin:tenants:read"),
  httpCache(30),
  async (c) => {
    try {
      const tenantsResult = await query(
        "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'active') as active FROM public.tenants",
      );

      if (tenantsResult.error) {
        logger.error("Erro ao buscar overview admin", {
          error: tenantsResult.error.message,
        });
        return c.json(
          {
            error: { code: "QUERY_ERROR", message: "Erro ao buscar overview" },
          },
          500,
        );
      }

      return c.json({
        overview: {
          tenants: tenantsResult.data?.rows[0] ?? { total: "0", active: "0" },
        },
        endpoints: ["/tenants", "/tenants/:id", "/tenants/:id/users", "/stats"],
      });
    } catch (error) {
      logger.error("Erro inesperado no overview admin", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// jwtAuth e tenantContext sao aplicados globalmente em index.ts para /api/v1/admin
// Nao duplicar aqui — admin opera em tabelas public (globais), nao em schemas de tenant

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
  tenant_type: z.enum(["owner", "manager", "client"]).default("client"),
  parent_tenant_id: z.string().uuid().optional(),
});

const updateTenantSchema = z.object({
  name: z.string().max(255).optional(),
  cnpj: z.string().max(18).nullable().optional(),
  contract_end_date: z.string().datetime().nullable().optional(),
  status: z.enum(["active", "inactive", "suspended"]).optional(),
  zabbix_host_group_id: z.string().min(1).optional(),
  zabbix_api_url: z.string().url().optional(),
  zabbix_api_token: z.string().min(1).optional(),
  tenant_type: z.enum(["owner", "manager", "client"]).optional(),
});

// ========== List Tenants ==========

adminRoute.get(
  "/tenants",
  requirePermission("admin:tenants:read"),
  httpCache(30),
  async (c) => {
    try {
      const result = await query(
        `SELECT t.*, tr.cluster_id, tr.cluster_host, tr.schema_name, tr.status as route_status,
         (SELECT COUNT(*) FROM public.tenant_users tu WHERE tu.tenant_id = t.id) as user_count,
         (SELECT COUNT(*) FROM public.tenants sub WHERE sub.parent_tenant_id = t.id) as managed_count,
         pt.name as parent_tenant_name
       FROM public.tenants t
       LEFT JOIN public.tenant_routes tr ON t.id = tr.tenant_id
       LEFT JOIN public.tenants pt ON t.parent_tenant_id = pt.id
       ORDER BY
         CASE t.tenant_type WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END,
         t.created_at DESC`,
      );

      if (result.error) {
        logger.error("Erro ao listar tenants", {
          error: result.error.message,
        });
        return c.json(
          { error: { code: "QUERY_ERROR", message: "Erro ao buscar tenants" } },
          500,
        );
      }

      return c.json({ tenants: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro inesperado ao listar tenants", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// ========== Get Single Tenant ==========

adminRoute.get(
  "/tenants/:tenantId",
  requirePermission("admin:tenants:read"),
  async (c) => {
    const tenantId = c.req.param("tenantId");

    try {
      const tenantResult = await query(
        `SELECT t.*, tr.cluster_id, tr.cluster_host, tr.cluster_database_name, tr.cluster_port,
         tr.schema_name, tr.is_enterprise, tr.zabbix_host_group_id, tr.zabbix_api_url, tr.status as route_status
       FROM public.tenants t
       LEFT JOIN public.tenant_routes tr ON t.id = tr.tenant_id
       WHERE t.id = $1`,
        [tenantId],
      );

      if (tenantResult.error || !tenantResult.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Tenant não encontrado" } },
          404,
        );
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
    } catch (error) {
      logger.error("Erro ao buscar detalhe do tenant", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "INTERNAL_ERROR", message: "Erro ao carregar tenant" },
        },
        500,
      );
    }
  },
);

// ========== Create Tenant ==========

adminRoute.post(
  "/tenants",
  rateLimitWrite,
  requirePermission("admin:tenants:write"),
  async (c) => {
    const user = c.get("user");
    const userId = user?.sub ?? null;

    try {
      const parsedBody = await safeJsonBody(c);
      if (!parsedBody.success) return parsedBody.response;
      const parsed = createTenantSchema.safeParse(parsedBody.data);
      if (!parsed.success) {
        return c.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Dados inválidos",
              details: parsed.error.flatten(),
            },
          },
          400,
        );
      }

      const data = parsed.data;

      // Define parent_tenant_id: se informado usa o valor, senao usa o tenant_id do admin logado
      const parentTenantId = data.parent_tenant_id ?? user?.tenant_id ?? null;

      // Cria tenant
      const tenantResult = await query(
        `INSERT INTO public.tenants (name, cnpj, contract_end_date, status, tenant_type, parent_tenant_id)
       VALUES ($1, $2, $3, 'active', $4, $5) RETURNING id`,
        [
          data.name,
          data.cnpj ?? null,
          data.contract_end_date ?? null,
          data.tenant_type,
          parentTenantId,
        ],
      );

      const tenantId = tenantResult.data?.rows[0]?.id as string;
      if (!tenantId) {
        logger.error("Falha ao criar tenant", { name: data.name });
        return c.json(
          {
            error: { code: "CREATE_FAILED", message: "Falha ao criar tenant" },
          },
          500,
        );
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
        [
          tenantId,
          data.cluster_id,
          data.cluster_host,
          data.cluster_database_name,
          data.cluster_port,
          schemaName,
          data.zabbix_host_group_id,
          data.zabbix_api_url,
          tokenParts.encrypted,
          tokenParts.iv,
          tokenParts.tag,
        ],
      );

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId: null,
            action: "admin.tenant.create",
            entityType: "tenants",
            entityId: tenantId,
            newData: { id: tenantId, name: data.name },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Tenant criado", {
        tenantId,
        schemaName,
        tenantType: data.tenant_type,
      });

      return c.json({ id: tenantId, schema: schemaName, created: true });
    } catch (error) {
      logger.error("Erro inesperado ao criar tenant", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar tenant" } },
        500,
      );
    }
  },
);

// ========== Update Tenant ==========

adminRoute.put(
  "/tenants/:tenantId",
  rateLimitWrite,
  requirePermission("admin:tenants:write"),
  async (c) => {
    const tenantId = c.req.param("tenantId");
    const user = c.get("user");
    const userId = user?.sub ?? null;

    try {
      const parsedBody = await safeJsonBody(c);
      if (!parsedBody.success) return parsedBody.response;
      const parsed = updateTenantSchema.safeParse(parsedBody.data);
      if (!parsed.success) {
        return c.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Dados inválidos",
              details: parsed.error.flatten(),
            },
          },
          400,
        );
      }

      const data = parsed.data;

      const updateFields: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (data.name !== undefined) {
        updateFields.push(`name = $${paramIdx++}`);
        params.push(data.name);
      }
      if (data.cnpj !== undefined) {
        updateFields.push(`cnpj = $${paramIdx++}`);
        params.push(data.cnpj);
      }
      if (data.contract_end_date !== undefined) {
        updateFields.push(`contract_end_date = $${paramIdx++}`);
        params.push(data.contract_end_date);
      }
      if (data.status !== undefined) {
        updateFields.push(`status = $${paramIdx++}`);
        params.push(data.status);
      }
      if (data.tenant_type !== undefined) {
        updateFields.push(`tenant_type = $${paramIdx++}`);
        params.push(data.tenant_type);
      }

      if (updateFields.length > 0) {
        params.push(tenantId);
        await query(
          `UPDATE public.tenants SET ${updateFields.join(", ")} WHERE id = $${paramIdx++}`,
          params,
        );
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

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId: null,
            action: "admin.tenant.update",
            entityType: "tenants",
            entityId: tenantId,
            newData: data,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Tenant atualizado", { tenantId });

      return c.json({ updated: true });
    } catch (error) {
      logger.error("Erro ao atualizar tenant", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "UPDATE_ERROR", message: "Erro ao atualizar tenant" },
        },
        500,
      );
    }
  },
);

// ========== Suspend / Activate Tenant ==========

adminRoute.post(
  "/tenants/:tenantId/suspend",
  rateLimitWrite,
  requirePermission("admin:tenants:write"),
  async (c) => {
    const tenantId = c.req.param("tenantId");
    const user = c.get("user");
    const userId = user?.sub ?? null;

    try {
      const result = await query(
        "UPDATE public.tenants SET status = 'suspended' WHERE id = $1 RETURNING id",
        [tenantId],
      );
      if (result.error || !result.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Tenant não encontrado" } },
          404,
        );
      }
      await query(
        "UPDATE public.tenant_routes SET status = 'inactive' WHERE tenant_id = $1",
        [tenantId],
      );

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId: null,
            action: "admin.tenant.suspend",
            entityType: "tenants",
            entityId: tenantId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Tenant suspenso", { tenantId });

      return c.json({ suspended: true });
    } catch (error) {
      logger.error("Erro ao suspender tenant", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "SUSPEND_ERROR", message: "Erro ao suspender tenant" },
        },
        500,
      );
    }
  },
);

// ========== Delete Tenant ==========

adminRoute.delete(
  "/tenants/:tenantId",
  rateLimitWrite,
  requirePermission("admin:tenants:write"),
  async (c) => {
    const tenantId = c.req.param("tenantId");
    const user = c.get("user");
    const userId = user?.sub ?? null;

    try {
      // Busca schema_name antes de remover
      const routeResult = await query<{ schema_name: string }>(
        "SELECT schema_name FROM public.tenant_routes WHERE tenant_id = $1",
        [tenantId],
      );

      const schemaName = routeResult.data?.rows[0]?.schema_name;

      // Verifica se o tenant existe
      const existsResult = await query(
        "DELETE FROM public.tenants WHERE id = $1 RETURNING id",
        [tenantId],
      );
      if (existsResult.error || !existsResult.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Tenant não encontrado" } },
          404,
        );
      }

      // Remove associações de usuários (cascade deve fazer, mas garantimos)
      await query("DELETE FROM public.tenant_users WHERE tenant_id = $1", [
        tenantId,
      ]);

      // Remove rota do tenant (cascade deve fazer, mas garantimos)
      await query("DELETE FROM public.tenant_routes WHERE tenant_id = $1", [
        tenantId,
      ]);

      // Dropa o schema do tenant se existir
      if (schemaName) {
        const slug = schemaName.replace("tenant_", "");
        await query("SELECT public.drop_tenant_schema($1)", [slug]);
      }

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId: null,
            action: "admin.tenant.delete",
            entityType: "tenants",
            entityId: tenantId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Tenant deletado", { tenantId, schemaName });

      return c.json({ deleted: true });
    } catch (error) {
      logger.error("Erro ao deletar tenant", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "DELETE_ERROR", message: "Erro ao excluir tenant" } },
        500,
      );
    }
  },
);

adminRoute.post(
  "/tenants/:tenantId/activate",
  rateLimitWrite,
  requirePermission("admin:tenants:write"),
  async (c) => {
    const tenantId = c.req.param("tenantId");
    const user = c.get("user");
    const userId = user?.sub ?? null;

    try {
      const result = await query(
        "UPDATE public.tenants SET status = 'active' WHERE id = $1 RETURNING id",
        [tenantId],
      );
      if (result.error || !result.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Tenant não encontrado" } },
          404,
        );
      }
      await query(
        "UPDATE public.tenant_routes SET status = 'active' WHERE tenant_id = $1",
        [tenantId],
      );

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId: null,
            action: "admin.tenant.activate",
            entityType: "tenants",
            entityId: tenantId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Tenant ativado", { tenantId });

      return c.json({ activated: true });
    } catch (error) {
      logger.error("Erro ao ativar tenant", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "ACTIVATE_ERROR", message: "Erro ao ativar tenant" } },
        500,
      );
    }
  },
);

// ========== Assign User to Tenant ==========

const assignUserSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum([
    "global:admin",
    "jl:superadmin",
    "jl:engineer",
    "jl:technician",
    "jl:manager",
    "jl:finance",
    "jl:viewer",
    "tenant:admin",
    "tenant:operator",
    "tenant:viewer",
  ]),
});

adminRoute.post(
  "/tenants/:tenantId/users",
  rateLimitWrite,
  requirePermission("admin:tenants:write"),
  async (c) => {
    const tenantId = c.req.param("tenantId");
    const user = c.get("user");
    const adminUserId = user?.sub ?? null;

    try {
      const parsedBody = await safeJsonBody(c);
      if (!parsedBody.success) return parsedBody.response;
      const parsed = assignUserSchema.safeParse(parsedBody.data);
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

      const { user_id: userId, role } = parsed.data;

      await query(
        `INSERT INTO public.tenant_users (user_id, tenant_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = $3`,
        [userId, tenantId, role],
      );

      if (adminUserId) {
        try {
          await writeAuditLog({
            userId: adminUserId,
            tenantId: null,
            action: "admin.tenant.assign_user",
            entityType: "tenant_users",
            newData: { tenant_id: tenantId, user_id: userId, role },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      return c.json({ assigned: true });
    } catch (error) {
      logger.error("Erro ao associar usuario ao tenant", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "ASSIGN_ERROR", message: "Erro ao associar usuário" },
        },
        500,
      );
    }
  },
);

adminRoute.delete(
  "/tenants/:tenantId/users/:userId",
  rateLimitWrite,
  requirePermission("admin:tenants:write"),
  async (c) => {
    const tenantId = c.req.param("tenantId");
    const userId = c.req.param("userId");
    const user = c.get("user");
    const adminUserId = user?.sub ?? null;

    try {
      const result = await query(
        "DELETE FROM public.tenant_users WHERE user_id = $1 AND tenant_id = $2 RETURNING user_id",
        [userId, tenantId],
      );
      if (result.error || !result.data?.rows[0]) {
        return c.json(
          {
            error: { code: "NOT_FOUND", message: "Associação não encontrada" },
          },
          404,
        );
      }

      if (adminUserId) {
        try {
          await writeAuditLog({
            userId: adminUserId,
            tenantId: null,
            action: "admin.tenant.remove_user",
            entityType: "tenant_users",
            entityId: JSON.stringify({ tenant_id: tenantId, user_id: userId }),
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      return c.json({ removed: true });
    } catch (error) {
      logger.error("Erro ao remover usuario do tenant", {
        tenantId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "REMOVE_ERROR", message: "Erro ao remover usuário" } },
        500,
      );
    }
  },
);

// ========== Global Stats ==========

adminRoute.get(
  "/stats",
  requirePermission("admin:tenants:read"),
  httpCache(30),
  async (c) => {
    try {
      // Paraleliza todas as queries de stats (antes 12 seriais)
      const [
        totalTenantsResult,
        activeTenantsResult,
        suspendedTenantsResult,
        totalUsersResult,
        activeUsersResult,
        totalTenantUsersResult,
        totalRoutesResult,
        byStatusResult,
        byTypeResult,
        clientsByParentResult,
        recentResult,
        byRoleResult,
      ] = await Promise.all([
        query("SELECT COUNT(*) as count FROM public.tenants"),
        query(
          "SELECT COUNT(*) as count FROM public.tenants WHERE status = 'active'",
        ),
        query(
          "SELECT COUNT(*) as count FROM public.tenants WHERE status = 'suspended'",
        ),
        query("SELECT COUNT(*) as count FROM public.users"),
        query(
          "SELECT COUNT(*) as count FROM public.users WHERE is_active = true",
        ),
        query("SELECT COUNT(*) as count FROM public.tenant_users"),
        query(
          "SELECT COUNT(*) as count FROM public.tenant_routes WHERE status = 'active'",
        ),
        query(
          "SELECT status, COUNT(*) as count FROM public.tenants GROUP BY status",
        ),
        query(
          "SELECT tenant_type, COUNT(*) as count FROM public.tenants GROUP BY tenant_type",
        ),
        query(
          `SELECT pt.tenant_type as parent_type, COUNT(*) as count
           FROM public.tenants t
           JOIN public.tenants pt ON t.parent_tenant_id = pt.id
           WHERE t.tenant_type = 'client'
           GROUP BY pt.tenant_type`,
        ),
        query(
          `SELECT id, name, status, tenant_type, created_at FROM public.tenants ORDER BY created_at DESC LIMIT 10`,
        ),
        query(
          "SELECT role, COUNT(*) as count FROM public.tenant_users GROUP BY role",
        ),
      ]);

      return c.json({
        total_tenants: safeCount(totalTenantsResult),
        active_tenants: safeCount(activeTenantsResult),
        suspended_tenants: safeCount(suspendedTenantsResult),
        total_users: safeCount(totalUsersResult),
        active_users: safeCount(activeUsersResult),
        total_tenant_users: safeCount(totalTenantUsersResult),
        total_routes: safeCount(totalRoutesResult),
        by_status: safeRows(byStatusResult),
        by_type: safeRows(byTypeResult),
        clients_by_parent: safeRows(clientsByParentResult),
        by_role: safeRows(byRoleResult),
        recent: safeRows(recentResult),
      });
    } catch (error) {
      logger.error("Erro no stats admin", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro ao buscar stats" } },
        500,
      );
    }
  },
);

// ========== CRM: Criar Usuário do Cliente com Senha Provisória ==========

adminRoute.post(
  "/tenants/:tenantId/users/create",
  rateLimitWrite,
  requirePermission("admin:tenants:write"),
  async (c) => {
    const tenantId = c.req.param("tenantId");
    const adminUser = c.get("user");
    const adminUserId = adminUser?.sub ?? null;

    try {
      const parsedBody = await safeJsonBody(c);
      if (!parsedBody.success) return parsedBody.response;
      const parsed = createClientUserSchema.safeParse(parsedBody.data);
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
          return c.json(
            {
              error: {
                code: "USER_ALREADY_ASSIGNED",
                message: "Usuário já está associado a este cliente",
              },
            },
            409,
          );
        }
      } else {
        // Cria novo usuário com senha provisória hasheada
        const passwordHash = await argon2.hash(
          data.provisional_password ?? data.password ?? "",
        );

        const newUserResult = await query<{ id: string }>(
          `INSERT INTO public.users (email, password_hash, full_name, phone, is_active, must_change_password)
         VALUES ($1, $2, $3, $4, true, $5) RETURNING id`,
          [
            data.email,
            passwordHash,
            data.full_name,
            data.phone ?? null,
            data.must_change_password,
          ],
        );

        userId = newUserResult.data?.rows[0]?.id as string;
        if (!userId) {
          return c.json(
            {
              error: {
                code: "CREATE_FAILED",
                message: "Falha ao criar usuário",
              },
            },
            500,
          );
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
      if (adminUserId) {
        try {
          await writeAuditLog({
            userId: adminUserId,
            tenantId: null,
            action: "admin.client_user.create",
            entityType: "users",
            newData: {
              tenant_id: tenantId,
              user_id: userId,
              email: data.email,
              role: data.role,
              must_change_password: data.must_change_password,
            },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Usuario cliente criado", {
        tenantId,
        userId,
        email: data.email,
      });

      return c.json({
        created: true,
        user_id: userId,
        email: data.email,
        full_name: data.full_name,
        role: data.role,
        must_change_password: data.must_change_password,
      });
    } catch (error) {
      logger.error("Erro ao criar usuario cliente", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar usuário" } },
        500,
      );
    }
  },
);

// ========== CRM: Listar Usuários do Tenant com must_change_password ==========

adminRoute.get(
  "/tenants/:tenantId/users",
  requirePermission("admin:tenants:read"),
  httpCache(30),
  async (c) => {
    const tenantId = c.req.param("tenantId");

    try {
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
    } catch (error) {
      logger.error("Erro ao listar usuarios do tenant", {
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

// ========== CRM: Contatos de Clientes ==========

adminRoute.get(
  "/tenants/:tenantId/contacts",
  requirePermission("admin:tenants:read"),
  httpCache(30),
  async (c) => {
    const tenantId = c.req.param("tenantId");
    try {
      const result = await query(
        `SELECT * FROM public.client_contacts WHERE tenant_id = $1 ORDER BY is_primary DESC, name ASC`,
        [tenantId],
      );
      return c.json({ contacts: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar contacts", {
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

adminRoute.post(
  "/tenants/:tenantId/contacts",
  rateLimitWrite,
  requirePermission("admin:tenants:write"),
  async (c) => {
    const tenantId = c.req.param("tenantId");
    const adminUser = c.get("user");
    const adminUserId = adminUser?.sub ?? null;

    try {
      const parsedBody = await safeJsonBody(c);
      if (!parsedBody.success) return parsedBody.response;
      const parsed = createClientContactSchema.safeParse({
        ...parsedBody.data,
        tenant_id: tenantId,
      });
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

      const data = parsed.data as CreateClientContactInput;

      // Se is_primary, desmarca outros primários
      if (data.is_primary) {
        await query(
          "UPDATE public.client_contacts SET is_primary = false WHERE tenant_id = $1",
          [tenantId],
        );
      }

      const result = await query<{ id: string }>(
        `INSERT INTO public.client_contacts (tenant_id, name, email, phone, role, department, is_primary, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
          tenantId,
          data.name,
          data.email,
          data.phone ?? null,
          data.role ?? null,
          data.department ?? null,
          data.is_primary,
          data.notes ?? null,
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          { error: { code: "CREATE_ERROR", message: "Erro ao criar contato" } },
          500,
        );
      }

      if (adminUserId) {
        try {
          await writeAuditLog({
            userId: adminUserId,
            tenantId: null,
            action: "admin.contact.create",
            entityType: "client_contacts",
            entityId: result.data.rows[0].id,
            newData: { tenant_id: tenantId, name: data.name },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      return c.json({ id: result.data.rows[0].id, created: true }, 201);
    } catch (error) {
      logger.error("Erro ao criar contact", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar contato" } },
        500,
      );
    }
  },
);

adminRoute.put(
  "/tenants/:tenantId/contacts/:contactId",
  rateLimitWrite,
  requirePermission("admin:tenants:write"),
  async (c) => {
    const tenantId = c.req.param("tenantId");
    const contactId = c.req.param("contactId");
    const adminUser = c.get("user");
    const adminUserId = adminUser?.sub ?? null;

    try {
      const parsedBody = await safeJsonBody(c);
      if (!parsedBody.success) return parsedBody.response;
      const parsed = updateClientContactSchema.safeParse(parsedBody.data);
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

      const data = parsed.data as UpdateClientContactInput;

      // Se is_primary, desmarca outros primários
      if (data.is_primary) {
        await query(
          "UPDATE public.client_contacts SET is_primary = false WHERE tenant_id = $1",
          [tenantId],
        );
      }

      const updateFields: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (data.name !== undefined) {
        updateFields.push(`name = $${paramIdx++}`);
        params.push(data.name);
      }
      if (data.email !== undefined) {
        updateFields.push(`email = $${paramIdx++}`);
        params.push(data.email);
      }
      if (data.phone !== undefined) {
        updateFields.push(`phone = $${paramIdx++}`);
        params.push(data.phone);
      }
      if (data.role !== undefined) {
        updateFields.push(`role = $${paramIdx++}`);
        params.push(data.role);
      }
      if (data.department !== undefined) {
        updateFields.push(`department = $${paramIdx++}`);
        params.push(data.department);
      }
      if (data.is_primary !== undefined) {
        updateFields.push(`is_primary = $${paramIdx++}`);
        params.push(data.is_primary);
      }
      if (data.is_active !== undefined) {
        updateFields.push(`is_active = $${paramIdx++}`);
        params.push(data.is_active);
      }
      if (data.notes !== undefined) {
        updateFields.push(`notes = $${paramIdx++}`);
        params.push(data.notes);
      }

      if (updateFields.length > 0) {
        params.push(contactId, tenantId);
        const result = await query(
          `UPDATE public.client_contacts SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++} RETURNING id`,
          params,
        );
        if (result.error || !result.data?.rows[0]) {
          return c.json(
            { error: { code: "NOT_FOUND", message: "Contato não encontrado" } },
            404,
          );
        }
      }

      if (adminUserId) {
        try {
          await writeAuditLog({
            userId: adminUserId,
            tenantId: null,
            action: "admin.contact.update",
            entityType: "client_contacts",
            entityId: contactId,
            newData: data,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      return c.json({ updated: true });
    } catch (error) {
      logger.error("Erro ao atualizar contact", {
        contactId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "UPDATE_ERROR", message: "Erro ao atualizar contato" },
        },
        500,
      );
    }
  },
);

adminRoute.delete(
  "/tenants/:tenantId/contacts/:contactId",
  rateLimitWrite,
  requirePermission("admin:tenants:write"),
  async (c) => {
    const tenantId = c.req.param("tenantId");
    const contactId = c.req.param("contactId");
    const adminUser = c.get("user");
    const adminUserId = adminUser?.sub ?? null;

    try {
      const result = await query(
        "DELETE FROM public.client_contacts WHERE id = $1 AND tenant_id = $2 RETURNING id",
        [contactId, tenantId],
      );
      if (result.error || !result.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Contato não encontrado" } },
          404,
        );
      }

      if (adminUserId) {
        try {
          await writeAuditLog({
            userId: adminUserId,
            tenantId: null,
            action: "admin.contact.delete",
            entityType: "client_contacts",
            entityId: contactId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      return c.json({ deleted: true });
    } catch (error) {
      logger.error("Erro ao deletar contact", {
        contactId,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "DELETE_ERROR", message: "Erro ao excluir contato" } },
        500,
      );
    }
  },
);

// ========== CRM: Dados Comerciais do Cliente ==========

adminRoute.get(
  "/tenants/:tenantId/company",
  requirePermission("admin:tenants:read"),
  async (c) => {
    const tenantId = c.req.param("tenantId");
    try {
      const result = await query(
        `SELECT cc.*, t.name as tenant_name, t.status as tenant_status, t.contract_end_date
       FROM public.client_companies cc
       RIGHT JOIN public.tenants t ON cc.tenant_id = t.id
       WHERE t.id = $1`,
        [tenantId],
      );
      return c.json({ company: result.data?.rows[0] ?? null });
    } catch (error) {
      logger.error("Erro ao buscar company", {
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

adminRoute.put(
  "/tenants/:tenantId/company",
  rateLimitWrite,
  requirePermission("admin:tenants:write"),
  async (c) => {
    const tenantId = c.req.param("tenantId");
    const adminUser = c.get("user");
    const adminUserId = adminUser?.sub ?? null;

    try {
      const parsedBody = await safeJsonBody(c);
      if (!parsedBody.success) return parsedBody.response;
      const parsed = upsertClientCompanySchema.safeParse(parsedBody.data);
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

      const data = parsed.data as UpsertClientCompanyInput;

      // Filtra apenas campos definidos (não undefined)
      const definedEntries = Object.entries(data).filter(
        ([, v]) => v !== undefined,
      );
      const definedKeys = definedEntries.map(([k]) => k);
      const definedValues = definedEntries.map(([, v]) => v);

      if (definedKeys.length > 0) {
        const placeholders = definedKeys.map((_, i) => `$${i + 2}`).join(", ");
        const updateSet = definedKeys
          .map((k, i) => `${k} = $${i + 2}`)
          .join(", ");

        await query(
          `INSERT INTO public.client_companies (tenant_id, ${definedKeys.join(", ")})
         VALUES ($1, ${placeholders})
         ON CONFLICT (tenant_id) DO UPDATE SET ${updateSet}`,
          [tenantId, ...definedValues],
        );
      }

      if (adminUserId) {
        try {
          await writeAuditLog({
            userId: adminUserId,
            tenantId: null,
            action: "admin.company.update",
            entityType: "client_companies",
            entityId: tenantId,
            newData: data,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Company upserted", { tenantId });

      return c.json({ upserted: true });
    } catch (error) {
      logger.error("Erro ao upsert company", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPSERT_ERROR", message: "Erro ao salvar empresa" } },
        500,
      );
    }
  },
);

// ========== CRM: Listar Todos os Clientes com Dados Comerciais ==========

adminRoute.get(
  "/clients",
  requirePermission("admin:tenants:read"),
  httpCache(30),
  async (c) => {
    try {
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
    } catch (error) {
      logger.error("Erro ao listar clients", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// ========== Onboarding v2: Teste de Conexao Zabbix, Host Groups e Preview ==========

const zabbixTestSchema = z.object({
  zabbix_api_url: z.string().url(),
  zabbix_api_token: z.string().min(1),
});

// POST /api/v1/admin/zabbix/test-connection — testa conexao com Zabbix antes de criar tenant
adminRoute.post(
  "/zabbix/test-connection",
  rateLimitWrite,
  requirePermission("admin:tenants:write"),
  async (c) => {
    try {
      const bodyResult = await safeJsonBody(c);
      if (!bodyResult.success) return bodyResult.response;
      const parsed = zabbixTestSchema.safeParse(bodyResult.data);
      if (!parsed.success) {
        return c.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "URL e Token são obrigatórios",
            },
          },
          400,
        );
      }

      const client = new BlindedZabbixClient({
        apiUrl: parsed.data.zabbix_api_url,
        apiToken: parsed.data.zabbix_api_token,
        timeout: 10_000,
      });

      const version = await client.getApiVersion();

      return c.json({
        success: true,
        api_version: version,
        message: `Conexão bem-sucedida — Zabbix API ${version}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      return c.json(
        { error: { code: "ZABBIX_CONNECTION_FAILED", message } },
        502,
      );
    }
  },
);

// POST /api/v1/admin/zabbix/host-groups — lista host groups disponiveis
adminRoute.post(
  "/zabbix/host-groups",
  rateLimitWrite,
  requirePermission("admin:tenants:write"),
  async (c) => {
    try {
      const bodyResult = await safeJsonBody(c);
      if (!bodyResult.success) return bodyResult.response;
      const parsed = zabbixTestSchema.safeParse(bodyResult.data);
      if (!parsed.success) {
        return c.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "URL e Token são obrigatórios",
            },
          },
          400,
        );
      }

      const client = new BlindedZabbixClient({
        apiUrl: parsed.data.zabbix_api_url,
        apiToken: parsed.data.zabbix_api_token,
        timeout: 15_000,
      });

      const hostGroups = await client.getHostGroups();

      return c.json({
        host_groups: hostGroups.map((g) => ({
          groupid: g.groupid,
          name: g.name,
        })),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      return c.json(
        { error: { code: "ZABBIX_CONNECTION_FAILED", message } },
        502,
      );
    }
  },
);

// POST /api/v1/admin/zabbix/preview-hosts — preview de hosts em um host group
const zabbixPreviewSchema = z.object({
  zabbix_api_url: z.string().url(),
  zabbix_api_token: z.string().min(1),
  host_group_id: z.string().min(1),
});

adminRoute.post(
  "/zabbix/preview-hosts",
  rateLimitWrite,
  requirePermission("admin:tenants:write"),
  async (c) => {
    try {
      const bodyResult = await safeJsonBody(c);
      if (!bodyResult.success) return bodyResult.response;
      const parsed = zabbixPreviewSchema.safeParse(bodyResult.data);
      if (!parsed.success) {
        return c.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "URL, Token e Host Group ID são obrigatórios",
            },
          },
          400,
        );
      }

      const client = new BlindedZabbixClient({
        apiUrl: parsed.data.zabbix_api_url,
        apiToken: parsed.data.zabbix_api_token,
        timeout: 15_000,
      });

      const hosts = await client.getDevices(parsed.data.host_group_id);

      return c.json({
        host_count: hosts.length,
        hosts: hosts.map((h) => ({
          hostid: h.hostid,
          host: h.host,
          name: h.name,
          status: h.status,
        })),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      return c.json(
        { error: { code: "ZABBIX_CONNECTION_FAILED", message } },
        502,
      );
    }
  },
);
