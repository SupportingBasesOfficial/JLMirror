// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import {
  createRoleSchema,
  assignRolePermissionsSchema,
  type CreateRoleInput,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { safeJsonBody } from "../lib/safe-json.js";
import { writeAuditLog } from "../lib/audit.js";
import "../types.js";

export const rbacRoute = new Hono();

// GET /api/v1/rbac — overview do modulo
rbacRoute.get(
  "/",
  requirePermission("tenant:settings:read"),
  httpCache(60),
  async (c) => {
    return c.json({
      overview: "RBAC — Role-Based Access Control",
      endpoints: [
        "/permissions",
        "/roles",
        "/roles/:id/permissions",
        "/me/permissions",
      ],
    });
  },
);

// GET /api/v1/rbac/permissions — lista todas as permissões
rbacRoute.get(
  "/permissions",
  requirePermission("tenant:settings:read"),
  httpCache(60),
  async (c) => {
    try {
      const result = await query(
        "SELECT id, key, description, category, created_at FROM public.permissions ORDER BY category, key",
      );

      if (result.error) {
        return c.json(
          {
            error: {
              code: "QUERY_ERROR",
              message: "Erro ao buscar permissões",
            },
          },
          500,
        );
      }

      return c.json({ permissions: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar permissions", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// GET /api/v1/rbac/roles — lista todas as roles
rbacRoute.get(
  "/roles",
  requirePermission("tenant:settings:read"),
  httpCache(60),
  async (c) => {
    try {
      const result = await query(
        "SELECT id, key, description, is_system, created_at FROM public.roles ORDER BY key",
      );

      if (result.error) {
        return c.json(
          { error: { code: "QUERY_ERROR", message: "Erro ao buscar roles" } },
          500,
        );
      }

      return c.json({ roles: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar roles", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// GET /api/v1/rbac/roles/:id/permissions — permissões de uma role
rbacRoute.get(
  "/roles/:id/permissions",
  requirePermission("tenant:settings:read"),
  httpCache(30),
  async (c) => {
    const roleId = c.req.param("id");

    try {
      const result = await query(
        `SELECT p.id, p.key, p.description, p.category
         FROM public.role_permissions rp
         JOIN public.permissions p ON p.id = rp.permission_id
         WHERE rp.role_id = $1
         ORDER BY p.category, p.key`,
        [roleId],
      );

      if (result.error) {
        return c.json(
          {
            error: {
              code: "QUERY_ERROR",
              message: "Erro ao buscar permissões da role",
            },
          },
          500,
        );
      }

      return c.json({ permissions: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao buscar permissions da role", {
        roleId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// POST /api/v1/rbac/roles — cria nova role customizada
rbacRoute.post(
  "/roles",
  requirePermission("tenant:settings:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = createRoleSchema.safeParse(parsedBody.data);
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

    const { key, description, permissions, name } =
      parsed.data as CreateRoleInput;
    const roleKey = key ?? name;

    try {
      // Verifica se a role ja existe
      const existing = await query<{ id: string }>(
        "SELECT id FROM public.roles WHERE key = $1 LIMIT 1",
        [roleKey],
      );

      if (existing.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "CONFLICT",
              message: "Role com esta chave já existe",
            },
          },
          409,
        );
      }

      // Cria role
      const roleResult = await query<{ id: string }>(
        "INSERT INTO public.roles (key, description, is_system) VALUES ($1, $2, false) RETURNING id",
        [roleKey, description ?? null],
      );

      if (roleResult.error || !roleResult.data?.rows[0]) {
        return c.json(
          { error: { code: "CREATE_ERROR", message: "Erro ao criar role" } },
          500,
        );
      }

      const roleId = roleResult.data.rows[0].id;

      // Atribui permissões
      if (permissions.length > 0) {
        const values = permissions.map((_, i) => `($1, $${i + 2})`).join(", ");
        await query(
          `INSERT INTO public.role_permissions (role_id, permission_id) VALUES ${values}`,
          [roleId, ...permissions],
        );
      }

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "rbac.role.create",
            entityType: "role",
            entityId: roleId,
            newData: { key: roleKey, permissions },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Role criada", { roleId, key: roleKey, tenantId });

      return c.json(
        {
          id: roleId,
          key: roleKey,
          description: description ?? null,
          is_system: false,
        },
        201,
      );
    } catch (error) {
      logger.error("Erro ao criar role", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar" } },
        500,
      );
    }
  },
);

// PUT /api/v1/rbac/roles/:id/permissions — atribui permissões a uma role
rbacRoute.put(
  "/roles/:id/permissions",
  requirePermission("tenant:settings:write"),
  rateLimitWrite,
  async (c) => {
    const roleId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = assignRolePermissionsSchema.safeParse(parsedBody.data);
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

    try {
      // Verifica se a role existe e se nao é system
      const roleCheck = await query<{ is_system: boolean }>(
        "SELECT is_system FROM public.roles WHERE id = $1 LIMIT 1",
        [roleId],
      );

      if (!roleCheck.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Role não encontrada" } },
          404,
        );
      }

      if (roleCheck.data.rows[0].is_system) {
        return c.json(
          {
            error: {
              code: "FORBIDDEN",
              message: "Roles de sistema não podem ser modificadas",
            },
          },
          403,
        );
      }

      // Remove permissões existentes
      await query("DELETE FROM public.role_permissions WHERE role_id = $1", [
        roleId,
      ]);

      // Insere novas
      if (parsed.data.permission_ids.length > 0) {
        const values = parsed.data.permission_ids
          .map((_, i) => `($1, $${i + 2})`)
          .join(", ");
        await query(
          `INSERT INTO public.role_permissions (role_id, permission_id) VALUES ${values}`,
          [roleId, ...parsed.data.permission_ids],
        );
      }

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "rbac.role.permissions.update",
            entityType: "role",
            entityId: roleId,
            newData: { permission_ids: parsed.data.permission_ids },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Role permissions atualizadas", {
        roleId,
        count: parsed.data.permission_ids.length,
        tenantId,
      });

      return c.json({
        role_id: roleId,
        permission_ids: parsed.data.permission_ids,
      });
    } catch (error) {
      logger.error("Erro ao atualizar permissions da role", {
        roleId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao atualizar" } },
        500,
      );
    }
  },
);

// GET /api/v1/rbac/me/permissions — permissões do usuário atual
rbacRoute.get("/me/permissions", httpCache(60), async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Autenticação necessária" } },
      401,
    );
  }

  const userId = user?.sub ?? null;
  if (!userId) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Usuário inválido" } },
      401,
    );
  }

  try {
    const result = await query<{ permission_key: string }>(
      "SELECT * FROM public.get_user_permissions($1)",
      [userId],
    );

    return c.json({
      permissions: result.data?.rows.map((r) => r.permission_key) ?? [],
      roles: user.roles ?? [],
    });
  } catch (error) {
    logger.error("Erro ao buscar permissoes do usuario", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});
