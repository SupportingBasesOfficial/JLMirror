// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import {
  createRoleSchema,
  assignRolePermissionsSchema,
  type CreateRoleInput,
  type AssignRolePermissionsInput,
} from "@repo/shared-validation";
import { jwtAuth } from "../middleware/jwt-auth.js";
import { tenantContext } from "../middleware/tenant-context.js";
import { requirePermission } from "../middleware/require-permission.js";
import "../types.js";

export const rbacRoute = new Hono();

// GET /api/v1/rbac/permissions — lista todas as permissões
rbacRoute.get("/permissions", jwtAuth, tenantContext, async (c) => {
  const result = await query(
    "SELECT id, key, description, category, created_at FROM public.permissions ORDER BY category, key",
  );

  if (result.error) {
    return c.json(
      { error: { code: "QUERY_ERROR", message: "Erro ao buscar permissões" } },
      500,
    );
  }

  return c.json({ permissions: result.data?.rows ?? [] });
});

// GET /api/v1/rbac/roles — lista todas as roles
rbacRoute.get("/roles", jwtAuth, tenantContext, async (c) => {
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
});

// GET /api/v1/rbac/roles/:id/permissions — permissões de uma role
rbacRoute.get("/roles/:id/permissions", jwtAuth, tenantContext, async (c) => {
  const roleId = c.req.param("id");

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
      { error: { code: "QUERY_ERROR", message: "Erro ao buscar permissões da role" } },
      500,
    );
  }

  return c.json({ permissions: result.data?.rows ?? [] });
});

// POST /api/v1/rbac/roles — cria nova role customizada
rbacRoute.post("/roles", jwtAuth, tenantContext, requirePermission("tenant:settings:write"), async (c) => {
  const body = await c.req.json<CreateRoleInput>();
  const parsed = createRoleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
      400,
    );
  }

  const { key, description, permissions } = parsed.data;

  // Cria role
  const roleResult = await query<{ id: string }>(
    "INSERT INTO public.roles (key, description, is_system) VALUES ($1, $2, false) RETURNING id",
    [key, description ?? null],
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

  // Auditoria
  const user = c.get("user");
  await query(
    "SELECT public.write_audit_log($1, NULL, 'rbac.role.create', 'role', $2, $3, NULL, NULL)",
    [user.sub, roleId, JSON.stringify({ key, permissions })],
  );

  return c.json({ id: roleId, key, description: description ?? null, is_system: false }, 201);
});

// PUT /api/v1/rbac/roles/:id/permissions — atribui permissões a uma role
rbacRoute.put("/roles/:id/permissions", jwtAuth, tenantContext, requirePermission("tenant:settings:write"), async (c) => {
  const roleId = c.req.param("id");
  const body = await c.req.json<AssignRolePermissionsInput>();
  const parsed = assignRolePermissionsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
      400,
    );
  }

  // Remove permissões existentes
  await query("DELETE FROM public.role_permissions WHERE role_id = $1", [roleId]);

  // Insere novas
  if (parsed.data.permission_ids.length > 0) {
    const values = parsed.data.permission_ids.map((_, i) => `($1, $${i + 2})`).join(", ");
    await query(
      `INSERT INTO public.role_permissions (role_id, permission_id) VALUES ${values}`,
      [roleId, ...parsed.data.permission_ids],
    );
  }

  // Auditoria
  const user = c.get("user");
  await query(
    "SELECT public.write_audit_log($1, NULL, 'rbac.role.permissions.update', 'role', $2, $3, NULL, NULL)",
    [user.sub, roleId, JSON.stringify({ permission_ids: parsed.data.permission_ids })],
  );

  return c.json({ role_id: roleId, permission_ids: parsed.data.permission_ids });
});

// GET /api/v1/rbac/me/permissions — permissões do usuário atual
rbacRoute.get("/me/permissions", jwtAuth, tenantContext, async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Autenticação necessária" } },
      401,
    );
  }

  const result = await query<{ permission_key: string }>(
    "SELECT * FROM public.get_user_permissions($1)",
    [user.sub],
  );

  return c.json({
    permissions: result.data?.rows.map((r) => r.permission_key) ?? [],
    roles: user.roles,
  });
});
