// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import argon2 from "argon2";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import {
  createTenantUserSchema,
  createCustomRoleSchema,
  updateUserRoleSchema,
  updateUserStatusSchema,
  resetUserPasswordSchema,
  updateUserDetailsSchema,
  type CreateTenantUserInput,
  type CreateCustomRoleInput,
  type UpdateUserRoleInput,
  type UpdateUserStatusInput,
  type ResetUserPasswordInput,
  type UpdateUserDetailsInput,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { safeJsonBody } from "../lib/safe-json.js";
import { writeAuditLog } from "../lib/audit.js";
import "../types.js";

export const usersRoute = new Hono();

// GET /api/v1/users — lista usuários do tenant atual
usersRoute.get(
  "/",
  requirePermission("tenant:users:read"),
  httpCache(15),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query<{
        id: string;
        email: string;
        full_name: string | null;
        is_active: boolean;
        role: string;
        scope: string;
        created_at: string;
      }>(
        `SELECT u.id, u.email, u.full_name, u.is_active, tu.role,
           CASE WHEN tu.role LIKE 'global:%' THEN 'global' ELSE 'tenant' END AS scope,
           tu.created_at
         FROM public.tenant_users tu
         JOIN public.users u ON u.id = tu.user_id
         WHERE tu.tenant_id = $1
         ORDER BY u.email`,
        [tenantId],
      );

      if (result.error) {
        return c.json(
          {
            error: { code: "QUERY_ERROR", message: "Erro ao buscar usuários" },
          },
          500,
        );
      }

      return c.json({ users: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar usuários do tenant", {
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

// GET /api/v1/users/all — lista todos os usuários (apenas JL staff com scope=global)
usersRoute.get(
  "/all",
  requirePermission("global:users:read"),
  httpCache(15),
  async (c) => {
    const user = c.get("user");

    if (user?.scope !== "global") {
      return c.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Acesso restrito a usuários JL",
          },
        },
        403,
      );
    }

    try {
      const result = await query<{
        id: string;
        email: string;
        full_name: string | null;
        is_active: boolean;
        tenant_id: string;
        tenant_name: string;
        tenant_type: string;
        parent_tenant_name: string | null;
        role: string;
        scope: string;
        must_change_password: boolean;
        last_login_at: string | null;
      }>(
        `SELECT u.id, u.email, u.full_name, u.is_active, tu.tenant_id,
           t.name as tenant_name, t.tenant_type,
           pt.name as parent_tenant_name,
           tu.role,
           CASE WHEN tu.role LIKE 'global:%' THEN 'global' ELSE 'tenant' END AS scope,
           u.must_change_password, u.last_login_at
         FROM public.tenant_users tu
         JOIN public.users u ON u.id = tu.user_id
         JOIN public.tenants t ON t.id = tu.tenant_id
         LEFT JOIN public.tenants pt ON t.parent_tenant_id = pt.id
         ORDER BY
           CASE t.tenant_type WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END,
           t.name, u.email`,
      );

      if (result.error) {
        return c.json(
          {
            error: { code: "QUERY_ERROR", message: "Erro ao buscar usuários" },
          },
          500,
        );
      }

      return c.json({ users: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar todos usuários", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// POST /api/v1/users — cria novo usuário no tenant atual
usersRoute.post(
  "/",
  rateLimitWrite,
  requirePermission("tenant:users:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = createTenantUserSchema.safeParse(parsedBody.data);
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

    const { email, password, full_name, role, scope } =
      parsed.data as CreateTenantUserInput;

    try {
      // Verifica se email já existe
      const existing = await query<{ id: string }>(
        "SELECT id FROM public.users WHERE email = $1",
        [email],
      );

      let userId: string;

      if (existing.data?.rows[0]) {
        userId = existing.data.rows[0].id;

        // Verifica se já está no tenant
        const alreadyInTenant = await query(
          "SELECT 1 FROM public.tenant_users WHERE user_id = $1 AND tenant_id = $2",
          [userId, tenantId],
        );

        if (alreadyInTenant.data?.rows.length) {
          return c.json(
            {
              error: {
                code: "USER_ALREADY_IN_TENANT",
                message: "Usuário já pertence a este tenant",
              },
            },
            409,
          );
        }
      } else {
        // Cria novo usuário
        const passwordHash = await argon2.hash(password);
        const newUser = await query<{ id: string }>(
          "INSERT INTO public.users (email, password_hash, full_name, is_active) VALUES ($1, $2, $3, true) RETURNING id",
          [email, passwordHash, full_name ?? null],
        );

        if (newUser.error || !newUser.data?.rows[0]) {
          return c.json(
            {
              error: { code: "CREATE_ERROR", message: "Erro ao criar usuário" },
            },
            500,
          );
        }

        userId = newUser.data.rows[0].id;
      }

      // Atribui role no tenant
      const assignResult = await query(
        "INSERT INTO public.tenant_users (user_id, tenant_id, role, scope) VALUES ($1, $2, $3, $4)",
        [userId, tenantId, role, scope],
      );

      if (assignResult.error) {
        return c.json(
          {
            error: {
              code: "ASSIGN_ERROR",
              message: "Erro ao atribuir role ao usuário",
            },
          },
          500,
        );
      }

      // Auditoria
      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "user.create",
            entityType: "user",
            entityId: userId,
            newData: { email, role, scope },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Usuário criado", { userId, email, tenantId });

      return c.json(
        { id: userId, email, full_name: full_name ?? null, role, scope },
        201,
      );
    } catch (error) {
      logger.error("Erro ao criar usuário", {
        email,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar usuário" } },
        500,
      );
    }
  },
);

// PUT /api/v1/users/:userId/role — atualiza role do usuário (admin global pode especificar tenant_id)
usersRoute.put(
  "/:userId/role",
  rateLimitWrite,
  requirePermission("tenant:users:write"),
  async (c) => {
    const userId = c.req.param("userId");
    const user = c.get("user");

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = updateUserRoleSchema.safeParse(parsedBody.data);
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

    const { role, scope, tenant_id } = parsed.data as UpdateUserRoleInput;
    const targetTenantId = tenant_id ?? user?.tenant_id ?? null;

    try {
      const result = await query(
        "UPDATE public.tenant_users SET role = $1, scope = COALESCE($2, scope), updated_at = now() WHERE user_id = $3 AND tenant_id = $4",
        [role, scope ?? null, userId, targetTenantId],
      );

      if (result.error) {
        return c.json(
          {
            error: { code: "UPDATE_ERROR", message: "Erro ao atualizar role" },
          },
          500,
        );
      }

      if (result.data?.rowCount === 0) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Usuário não encontrado neste tenant",
            },
          },
          404,
        );
      }

      // Auditoria
      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId: targetTenantId,
            action: "user.role.update",
            entityType: "user",
            entityId: userId,
            newData: { role, scope },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Role atualizada", {
        userId,
        role,
        tenantId: targetTenantId,
      });

      return c.json({ updated: true });
    } catch (error) {
      logger.error("Erro ao atualizar role", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao atualizar role" } },
        500,
      );
    }
  },
);

// PUT /api/v1/users/:userId/status — ativa/desativa usuário (admin global pode especificar tenant_id)
usersRoute.put(
  "/:userId/status",
  rateLimitWrite,
  requirePermission("tenant:users:write"),
  async (c) => {
    const userId = c.req.param("userId");
    const user = c.get("user");

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = updateUserStatusSchema.safeParse(parsedBody.data);
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

    const { is_active, tenant_id } = parsed.data as UpdateUserStatusInput;
    const targetTenantId = tenant_id ?? user?.tenant_id ?? null;

    try {
      const result = await query(
        "UPDATE public.users SET is_active = $1 WHERE id = $2 AND id IN (SELECT user_id FROM public.tenant_users WHERE tenant_id = $3)",
        [is_active, userId, targetTenantId],
      );

      if (result.error) {
        return c.json(
          {
            error: {
              code: "UPDATE_ERROR",
              message: "Erro ao atualizar status",
            },
          },
          500,
        );
      }

      if (result.data?.rowCount === 0) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Usuário não encontrado neste tenant",
            },
          },
          404,
        );
      }

      // Auditoria
      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId: targetTenantId,
            action: "user.status.update",
            entityType: "user",
            entityId: userId,
            newData: { is_active },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Status atualizado", {
        userId,
        is_active,
        tenantId: targetTenantId,
      });

      return c.json({ updated: true });
    } catch (error) {
      logger.error("Erro ao atualizar status", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "UPDATE_ERROR", message: "Erro ao atualizar status" },
        },
        500,
      );
    }
  },
);

// DELETE /api/v1/users/:userId — remove usuário do tenant (admin global pode especificar tenant_id)
usersRoute.delete(
  "/:userId",
  rateLimitWrite,
  requirePermission("tenant:users:delete"),
  async (c) => {
    const userId = c.req.param("userId");
    const user = c.get("user");
    const url = new URL(c.req.url);
    const targetTenantId =
      url.searchParams.get("tenant_id") ?? user?.tenant_id ?? null;

    // Não permite remover a si mesmo
    if (userId === user?.sub) {
      return c.json(
        {
          error: {
            code: "SELF_DELETE",
            message: "Não é possível remover a si mesmo",
          },
        },
        400,
      );
    }

    try {
      const result = await query(
        "DELETE FROM public.tenant_users WHERE user_id = $1 AND tenant_id = $2",
        [userId, targetTenantId],
      );

      if (result.error) {
        return c.json(
          {
            error: { code: "DELETE_ERROR", message: "Erro ao remover usuário" },
          },
          500,
        );
      }

      if (result.data?.rowCount === 0) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Usuário não encontrado neste tenant",
            },
          },
          404,
        );
      }

      // Auditoria
      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId: targetTenantId,
            action: "user.delete",
            entityType: "user",
            entityId: userId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Usuário removido do tenant", {
        userId,
        tenantId: targetTenantId,
      });

      return c.json({ deleted: true });
    } catch (error) {
      logger.error("Erro ao remover usuário", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "DELETE_ERROR", message: "Erro ao remover usuário" } },
        500,
      );
    }
  },
);

// PUT /api/v1/users/:userId/password — admin reseta senha de qualquer usuario
usersRoute.put(
  "/:userId/password",
  rateLimitWrite,
  requirePermission("global:users:write"),
  async (c) => {
    const userId = c.req.param("userId");
    const user = c.get("user");

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = resetUserPasswordSchema.safeParse(parsedBody.data);
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

    const { password, must_change_password } =
      parsed.data as ResetUserPasswordInput;
    const tenantId = user?.tenant_id ?? null;

    try {
      const passwordHash = await argon2.hash(password);
      const result = await query(
        "UPDATE public.users SET password_hash = $1, must_change_password = $2 WHERE id = $3",
        [passwordHash, must_change_password ?? true, userId],
      );

      if (result.error) {
        return c.json(
          {
            error: { code: "UPDATE_ERROR", message: "Erro ao atualizar senha" },
          },
          500,
        );
      }

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Usuário não encontrado" } },
          404,
        );
      }

      // Auditoria
      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "user.password.reset",
            entityType: "user",
            entityId: userId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Senha resetada por admin", { userId });

      return c.json({ updated: true });
    } catch (error) {
      logger.error("Erro ao resetar senha", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "UPDATE_ERROR", message: "Erro ao atualizar senha" } },
        500,
      );
    }
  },
);

// PUT /api/v1/users/:userId/details — admin edita detalhes do usuario (full_name, email)
usersRoute.put(
  "/:userId/details",
  rateLimitWrite,
  requirePermission("global:users:write"),
  async (c) => {
    const userId = c.req.param("userId");
    const user = c.get("user");

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = updateUserDetailsSchema.safeParse(parsedBody.data);
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

    const body = parsed.data as UpdateUserDetailsInput;
    const tenantId = user?.tenant_id ?? null;

    const updates: string[] = [];
    const params: (string | null)[] = [];
    let paramIdx = 1;

    if (body.full_name !== undefined) {
      updates.push(`full_name = $${paramIdx++}`);
      params.push(body.full_name || null);
    }
    if (body.email !== undefined) {
      updates.push(`email = $${paramIdx++}`);
      params.push(body.email);
    }

    if (updates.length === 0) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Nada para atualizar" } },
        400,
      );
    }

    try {
      params.push(userId);
      const result = await query(
        `UPDATE public.users SET ${updates.join(", ")} WHERE id = $${paramIdx++}`,
        params,
      );

      if (result.error) {
        return c.json(
          {
            error: {
              code: "UPDATE_ERROR",
              message: "Erro ao atualizar usuário",
            },
          },
          500,
        );
      }

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Usuário não encontrado" } },
          404,
        );
      }

      // Auditoria
      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "user.details.update",
            entityType: "user",
            entityId: userId,
            newData: body,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Detalhes atualizados", { userId });

      return c.json({ updated: true });
    } catch (error) {
      logger.error("Erro ao atualizar detalhes", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "UPDATE_ERROR", message: "Erro ao atualizar usuário" },
        },
        500,
      );
    }
  },
);

// GET /api/v1/users/roles — lista roles disponíveis (sistema + custom do tenant)
usersRoute.get(
  "/roles",
  requirePermission("tenant:users:read"),
  httpCache(60),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Paraleliza 2 queries (antes seriais)
      const [systemRoles, customRoles] = await Promise.all([
        query<{
          id: string;
          key: string;
          description: string | null;
          is_system: boolean;
        }>(
          "SELECT id, key, description, is_system FROM public.roles ORDER BY key",
        ),
        query<{
          id: string;
          key: string;
          description: string | null;
          is_active: boolean;
        }>(
          "SELECT id, key, description, is_active FROM public.tenant_custom_roles WHERE tenant_id = $1 ORDER BY key",
          [tenantId],
        ),
      ]);

      return c.json({
        system_roles: systemRoles.data?.rows ?? [],
        custom_roles: customRoles.data?.rows ?? [],
      });
    } catch (error) {
      logger.error("Erro ao listar roles", {
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

// POST /api/v1/users/custom-roles — cria role customizada no tenant
usersRoute.post(
  "/custom-roles",
  rateLimitWrite,
  requirePermission("tenant:settings:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = createCustomRoleSchema.safeParse(parsedBody.data);
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

    const { key, description, permissions } =
      parsed.data as CreateCustomRoleInput;

    try {
      // Verifica se role key já existe no tenant
      const existing = await query<{ id: string }>(
        "SELECT id FROM public.tenant_custom_roles WHERE tenant_id = $1 AND key = $2",
        [tenantId, key],
      );
      if (existing.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "ROLE_ALREADY_EXISTS",
              message: `Role '${key}' já existe neste tenant`,
            },
          },
          409,
        );
      }

      // Cria role customizada
      const roleResult = await query<{ id: string }>(
        "INSERT INTO public.tenant_custom_roles (tenant_id, key, description) VALUES ($1, $2, $3) RETURNING id",
        [tenantId, key, description ?? null],
      );

      if (roleResult.error || !roleResult.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "CREATE_ERROR",
              message: "Erro ao criar role customizada",
            },
          },
          500,
        );
      }

      const roleId = roleResult.data.rows[0].id;

      // Atribui permissões
      if (permissions.length > 0) {
        const placeholders = permissions
          .map((_, i) => `($1, $${i + 2})`)
          .join(", ");
        await query(
          `INSERT INTO public.tenant_custom_role_permissions (role_id, permission_id) VALUES ${placeholders}`,
          [roleId, ...permissions],
        );
      }

      // Auditoria
      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "custom_role.create",
            entityType: "role",
            entityId: roleId,
            newData: { key, permissions },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Role customizada criada", { roleId, key, tenantId });

      return c.json({ id: roleId, key, description: description ?? null }, 201);
    } catch (error) {
      logger.error("Erro ao criar role customizada", {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: {
            code: "CREATE_ERROR",
            message: "Erro ao criar role customizada",
          },
        },
        500,
      );
    }
  },
);
