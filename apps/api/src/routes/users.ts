import { Hono } from "hono";
import argon2 from "argon2";
import { query } from "@repo/db";
import { jwtAuth } from "../middleware/jwt-auth.js";
import { tenantContext } from "../middleware/tenant-context.js";
import { requirePermission } from "../middleware/require-permission.js";
import "../types.js";

export const usersRoute = new Hono();

// GET /api/v1/users — lista usuários do tenant atual
usersRoute.get("/", jwtAuth, tenantContext, requirePermission("tenant:users:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  const result = await query<{
    id: string;
    email: string;
    full_name: string | null;
    is_active: boolean;
    role: string;
    scope: string;
    created_at: string;
  }>(
    `SELECT u.id, u.email, u.full_name, u.is_active, tu.role, tu.scope, tu.created_at
     FROM public.tenant_users tu
     JOIN public.users u ON u.id = tu.user_id
     WHERE tu.tenant_id = $1
     ORDER BY u.email`,
    [tenantId],
  );

  if (result.error) {
    return c.json(
      { error: { code: "QUERY_ERROR", message: "Erro ao buscar usuários" } },
      500,
    );
  }

  return c.json({ users: result.data?.rows ?? [] });
});

// GET /api/v1/users/all — lista todos os usuários (apenas JL staff com scope=global)
usersRoute.get("/all", jwtAuth, tenantContext, async (c) => {
  const user = c.get("user");

  if (user.scope !== "global") {
    return c.json(
      { error: { code: "FORBIDDEN", message: "Acesso restrito a usuários JL" } },
      403,
    );
  }

  const result = await query<{
    id: string;
    email: string;
    full_name: string | null;
    is_active: boolean;
    tenant_id: string;
    role: string;
    scope: string;
  }>(
    `SELECT u.id, u.email, u.full_name, u.is_active, tu.tenant_id, tu.role, tu.scope
     FROM public.tenant_users tu
     JOIN public.users u ON u.id = tu.user_id
     ORDER BY u.email`,
  );

  if (result.error) {
    return c.json(
      { error: { code: "QUERY_ERROR", message: "Erro ao buscar usuários" } },
      500,
    );
  }

  return c.json({ users: result.data?.rows ?? [] });
});

// POST /api/v1/users — cria novo usuário no tenant atual
usersRoute.post("/", jwtAuth, tenantContext, requirePermission("tenant:users:write"), async (c) => {
  const body = await c.req.json<{
    email: string;
    password: string;
    full_name?: string;
    role: string;
    scope?: "global" | "tenant";
  }>();

  const { email, password, full_name, role, scope = "tenant" } = body;

  if (!email || !password || !role) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Email, senha e role são obrigatórios" } },
      400,
    );
  }

  const user = c.get("user");
  const tenantId = user.tenant_id;

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
        { error: { code: "USER_ALREADY_IN_TENANT", message: "Usuário já pertence a este tenant" } },
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
        { error: { code: "CREATE_ERROR", message: "Erro ao criar usuário" } },
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
      { error: { code: "ASSIGN_ERROR", message: "Erro ao atribuir role ao usuário" } },
      500,
    );
  }

  // Auditoria
  await query(
    "SELECT public.write_audit_log($1, $2, 'user.create', 'user', $3, $4, NULL, NULL)",
    [user.sub, tenantId, userId, JSON.stringify({ email, role, scope })],
  );

  return c.json({ id: userId, email, full_name: full_name ?? null, role, scope }, 201);
});

// PUT /api/v1/users/:userId/role — atualiza role do usuário no tenant atual
usersRoute.put("/:userId/role", jwtAuth, tenantContext, requirePermission("tenant:users:write"), async (c) => {
  const userId = c.req.param("userId");
  const body = await c.req.json<{ role: string; scope?: "global" | "tenant" }>();
  const { role, scope } = body;

  if (!role) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Role é obrigatória" } },
      400,
    );
  }

  const user = c.get("user");
  const tenantId = user.tenant_id;

  const result = await query(
    "UPDATE public.tenant_users SET role = $1, scope = COALESCE($2, scope), updated_at = now() WHERE user_id = $3 AND tenant_id = $4",
    [role, scope ?? null, userId, tenantId],
  );

  if (result.error) {
    return c.json(
      { error: { code: "UPDATE_ERROR", message: "Erro ao atualizar role" } },
      500,
    );
  }

  if (result.data?.rowCount === 0) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Usuário não encontrado neste tenant" } },
      404,
    );
  }

  // Auditoria
  await query(
    "SELECT public.write_audit_log($1, $2, 'user.role.update', 'user', $3, $4, NULL, NULL)",
    [user.sub, tenantId, userId, JSON.stringify({ role, scope })],
  );

  return c.json({ updated: true });
});

// PUT /api/v1/users/:userId/status — ativa/desativa usuário
usersRoute.put("/:userId/status", jwtAuth, tenantContext, requirePermission("tenant:users:write"), async (c) => {
  const userId = c.req.param("userId");
  const body = await c.req.json<{ is_active: boolean }>();
  const { is_active } = body;

  const user = c.get("user");
  const tenantId = user.tenant_id;

  const result = await query(
    "UPDATE public.users SET is_active = $1 WHERE id = $2",
    [is_active, userId],
  );

  if (result.error) {
    return c.json(
      { error: { code: "UPDATE_ERROR", message: "Erro ao atualizar status" } },
      500,
    );
  }

  // Auditoria
  await query(
    "SELECT public.write_audit_log($1, $2, 'user.status.update', 'user', $3, $4, NULL, NULL)",
    [user.sub, tenantId, userId, JSON.stringify({ is_active })],
  );

  return c.json({ updated: true });
});

// DELETE /api/v1/users/:userId — remove usuário do tenant atual
usersRoute.delete("/:userId", jwtAuth, tenantContext, requirePermission("tenant:users:delete"), async (c) => {
  const userId = c.req.param("userId");
  const user = c.get("user");
  const tenantId = user.tenant_id;

  // Não permite remover a si mesmo
  if (userId === user.sub) {
    return c.json(
      { error: { code: "SELF_DELETE", message: "Não é possível remover a si mesmo" } },
      400,
    );
  }

  const result = await query(
    "DELETE FROM public.tenant_users WHERE user_id = $1 AND tenant_id = $2",
    [userId, tenantId],
  );

  if (result.error) {
    return c.json(
      { error: { code: "DELETE_ERROR", message: "Erro ao remover usuário" } },
      500,
    );
  }

  if (result.data?.rowCount === 0) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Usuário não encontrado neste tenant" } },
      404,
    );
  }

  // Auditoria
  await query(
    "SELECT public.write_audit_log($1, $2, 'user.delete', 'user', $3, NULL, NULL, NULL)",
    [user.sub, tenantId, userId],
  );

  return c.json({ deleted: true });
});

// GET /api/v1/users/roles — lista roles disponíveis (sistema + custom do tenant)
usersRoute.get("/roles", jwtAuth, tenantContext, async (c) => {
  const user = c.get("user");
  const tenantId = user.tenant_id;

  // Roles do sistema (globais)
  const systemRoles = await query<{
    id: string;
    key: string;
    description: string | null;
    is_system: boolean;
  }>(
    "SELECT id, key, description, is_system FROM public.roles ORDER BY key",
  );

  // Roles customizadas do tenant
  const customRoles = await query<{
    id: string;
    key: string;
    description: string | null;
    is_active: boolean;
  }>(
    "SELECT id, key, description, is_active FROM public.tenant_custom_roles WHERE tenant_id = $1 ORDER BY key",
    [tenantId],
  );

  return c.json({
    system_roles: systemRoles.data?.rows ?? [],
    custom_roles: customRoles.data?.rows ?? [],
  });
});

// POST /api/v1/users/custom-roles — cria role customizada no tenant
usersRoute.post("/custom-roles", jwtAuth, tenantContext, requirePermission("tenant:settings:write"), async (c) => {
  const body = await c.req.json<{ key: string; description?: string; permissions: string[] }>();
  const { key, description, permissions } = body;

  if (!key) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Key é obrigatória" } },
      400,
    );
  }

  const user = c.get("user");
  const tenantId = user.tenant_id;

  // Cria role customizada
  const roleResult = await query<{ id: string }>(
    "INSERT INTO public.tenant_custom_roles (tenant_id, key, description) VALUES ($1, $2, $3) RETURNING id",
    [tenantId, key, description ?? null],
  );

  if (roleResult.error || !roleResult.data?.rows[0]) {
    return c.json(
      { error: { code: "CREATE_ERROR", message: "Erro ao criar role customizada" } },
      500,
    );
  }

  const roleId = roleResult.data.rows[0].id;

  // Atribui permissões
  if (permissions.length > 0) {
    const placeholders = permissions.map((_, i) => `($1, $${i + 2})`).join(", ");
    await query(
      `INSERT INTO public.tenant_custom_role_permissions (role_id, permission_id) VALUES ${placeholders}`,
      [roleId, ...permissions],
    );
  }

  // Auditoria
  await query(
    "SELECT public.write_audit_log($1, $2, 'custom_role.create', 'role', $3, $4, NULL, NULL)",
    [user.sub, tenantId, roleId, JSON.stringify({ key, permissions })],
  );

  return c.json({ id: roleId, key, description: description ?? null }, 201);
});
