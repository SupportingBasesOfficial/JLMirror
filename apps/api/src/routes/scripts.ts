import { Hono } from "hono";
import { query } from "@repo/db";
import {
  createScriptSchema,
  updateScriptSchema,
  executeScriptSchema,
  type CreateScriptInput,
  type UpdateScriptInput,
  type ExecuteScriptInput,
} from "@repo/shared-validation";
import { jwtAuth } from "../middleware/jwt-auth.js";
import { tenantContext } from "../middleware/tenant-context.js";
import { requirePermission } from "../middleware/require-permission.js";
import { parsePaginationParams, buildPaginatedResponse } from "../lib/pagination.js";
import "../types.js";

export const scriptsRoute = new Hono();

// GET /api/v1/scripts — lista scripts do tenant com paginação
scriptsRoute.get("/", jwtAuth, tenantContext, requirePermission("scripts:read"), async (c) => {
  const user = c.get("user");
  const activeOnly = c.req.query("active") === "true";
  const pagination = parsePaginationParams({
    page: c.req.query("page"),
    limit: c.req.query("limit"),
    sort: c.req.query("sort"),
    order: c.req.query("order"),
  });

  const conditions: string[] = ["tenant_id = $1"];
  const params: unknown[] = [user?.tenant_id ?? null];
  let paramIdx = 2;

  if (activeOnly) {
    conditions.push("is_active = true");
  }

  const whereClause = conditions.join(" AND ");

  const countResult = await query(`SELECT COUNT(*)::int as total FROM public.scripts WHERE ${whereClause}`, params);
  const total = countResult.data?.rows[0]?.total ?? 0;

  params.push(pagination.limit, pagination.offset);
  const result = await query(
    `SELECT id, name, description, language, version, timeout_seconds, requires_approval,
             max_concurrent_executions, allowed_hosts, tags, is_active, created_by, created_at, updated_at
             FROM public.scripts WHERE ${whereClause}
             ORDER BY ${pagination.sort} ${pagination.order.toUpperCase()}
             LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    params,
  );

  if (result.error) {
    return c.json({ error: { code: "QUERY_ERROR", message: "Erro ao buscar scripts" } }, 500);
  }

  return c.json(buildPaginatedResponse(result.data?.rows ?? [], total, pagination));
});

// GET /api/v1/scripts/:id — detalhe de um script
scriptsRoute.get("/:id", jwtAuth, tenantContext, requirePermission("scripts:read"), async (c) => {
  const scriptId = c.req.param("id");
  const user = c.get("user");

  const result = await query(
    `SELECT * FROM public.scripts WHERE id = $1 AND tenant_id = $2`,
    [scriptId, user?.tenant_id ?? null],
  );

  if (result.error || !result.data?.rows[0]) {
    return c.json({ error: { code: "NOT_FOUND", message: "Script não encontrado" } }, 404);
  }

  // Busca versões
  const versionsResult = await query(
    "SELECT id, version, change_summary, changed_by, created_at FROM public.script_versions WHERE script_id = $1 ORDER BY version DESC",
    [scriptId],
  );

  return c.json({
    script: result.data.rows[0],
    versions: versionsResult.data?.rows ?? [],
  });
});

// POST /api/v1/scripts — cria novo script
scriptsRoute.post("/", jwtAuth, tenantContext, requirePermission("scripts:write"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<CreateScriptInput>();
  const parsed = createScriptSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;
  const result = await query<{ id: string }>(
    `INSERT INTO public.scripts (tenant_id, name, description, language, content, timeout_seconds, requires_approval, max_concurrent_executions, allowed_hosts, tags, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
     RETURNING id`,
    [
      user?.tenant_id ?? null, data.name, data.description ?? null, data.language,
      data.content, data.timeout_seconds, data.requires_approval, data.max_concurrent_executions,
      data.allowed_hosts, data.tags, user.sub,
    ],
  );

  if (result.error || !result.data?.rows[0]) {
    return c.json({ error: { code: "CREATE_ERROR", message: "Erro ao criar script" } }, 500);
  }

  const scriptId = result.data.rows[0].id;

  // Registra versão inicial
  await query(
    "INSERT INTO public.script_versions (script_id, version, content, changed_by, change_summary) VALUES ($1, 1, $2, $3, 'Versão inicial')",
    [scriptId, data.content, user.sub],
  );

  // Auditoria
  await query(
    "SELECT public.write_audit_log($1, NULL, 'script.create', 'script', $2, $3, NULL, NULL)",
    [user.sub, scriptId, JSON.stringify({ name: data.name, language: data.language })],
  );

  return c.json({ id: scriptId }, 201);
});

// PUT /api/v1/scripts/:id — atualiza script (cria nova versão se content mudou)
scriptsRoute.put("/:id", jwtAuth, tenantContext, requirePermission("scripts:write"), async (c) => {
  const scriptId = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json<UpdateScriptInput>();
  const parsed = updateScriptSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;

  // Busca versão atual
  const currentResult = await query<{ version: number; content: string }>(
    "SELECT version, content FROM public.scripts WHERE id = $1 AND tenant_id = $2",
    [scriptId, user?.tenant_id ?? null],
  );

  if (currentResult.error || !currentResult.data?.rows[0]) {
    return c.json({ error: { code: "NOT_FOUND", message: "Script não encontrado" } }, 404);
  }

  const current = currentResult.data.rows[0];
  const newVersion = data.content && data.content !== current.content ? current.version + 1 : current.version;

  // Atualiza script
  const updateFields: string[] = [];
  const updateParams: unknown[] = [];
  let paramIdx = 1;

  if (data.name !== undefined) { updateFields.push(`name = $${paramIdx++}`); updateParams.push(data.name); }
  if (data.description !== undefined) { updateFields.push(`description = $${paramIdx++}`); updateParams.push(data.description); }
  if (data.language !== undefined) { updateFields.push(`language = $${paramIdx++}`); updateParams.push(data.language); }
  if (data.content !== undefined) { updateFields.push(`content = $${paramIdx++}`); updateParams.push(data.content); }
  if (data.timeout_seconds !== undefined) { updateFields.push(`timeout_seconds = $${paramIdx++}`); updateParams.push(data.timeout_seconds); }
  if (data.requires_approval !== undefined) { updateFields.push(`requires_approval = $${paramIdx++}`); updateParams.push(data.requires_approval); }
  if (data.max_concurrent_executions !== undefined) { updateFields.push(`max_concurrent_executions = $${paramIdx++}`); updateParams.push(data.max_concurrent_executions); }
  if (data.allowed_hosts !== undefined) { updateFields.push(`allowed_hosts = $${paramIdx++}`); updateParams.push(data.allowed_hosts); }
  if (data.tags !== undefined) { updateFields.push(`tags = $${paramIdx++}`); updateParams.push(data.tags); }
  if (data.is_active !== undefined) { updateFields.push(`is_active = $${paramIdx++}`); updateParams.push(data.is_active); }

  updateFields.push(`version = $${paramIdx++}`);
  updateParams.push(newVersion);
  updateFields.push(`updated_by = $${paramIdx++}`);
  updateParams.push(user.sub);

  updateParams.push(scriptId, user?.tenant_id ?? null);

  await query(
    `UPDATE public.scripts SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
    updateParams,
  );

  // Se content mudou, registra nova versão
  if (data.content && data.content !== current.content) {
    await query(
      "INSERT INTO public.script_versions (script_id, version, content, changed_by, change_summary) VALUES ($1, $2, $3, $4, $5)",
      [scriptId, newVersion, data.content, user.sub, data.description ?? "Atualização de conteúdo"],
    );
  }

  // Auditoria
  await query(
    "SELECT public.write_audit_log($1, NULL, 'script.update', 'script', $2, $3, NULL, NULL)",
    [user.sub, scriptId, JSON.stringify({ version: newVersion })],
  );

  return c.json({ id: scriptId, version: newVersion });
});

// DELETE /api/v1/scripts/:id — desativa script (soft delete)
scriptsRoute.delete("/:id", jwtAuth, tenantContext, requirePermission("scripts:write"), async (c) => {
  const scriptId = c.req.param("id");
  const user = c.get("user");

  await query(
    "UPDATE public.scripts SET is_active = false, updated_by = $3 WHERE id = $1 AND tenant_id = $2",
    [scriptId, user?.tenant_id ?? null, user.sub],
  );

  await query(
    "SELECT public.write_audit_log($1, NULL, 'script.deactivate', 'script', $2, NULL, NULL, NULL)",
    [user.sub, scriptId],
  );

  return c.json({ deactivated: true });
});

// POST /api/v1/scripts/:id/execute — inicia execução (com approval se necessário)
scriptsRoute.post("/:id/execute", jwtAuth, tenantContext, requirePermission("scripts:execute"), async (c) => {
  const scriptId = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json<ExecuteScriptInput>();
  const parsed = executeScriptSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const result = await query<{ id: string; status: string; requires_approval: boolean }>(
    "SELECT * FROM public.create_script_execution($1, $2, $3, $4)",
    [scriptId, parsed.data.target_host, user.sub, user?.tenant_id ?? null],
  );

  if (result.error) {
    return c.json({ error: { code: "EXECUTION_ERROR", message: result.error.message } }, 400);
  }

  const execution = result.data?.rows[0];
  if (!execution) {
    return c.json({ error: { code: "EXECUTION_ERROR", message: "Erro ao criar execução" } }, 500);
  }

  // Auditoria
  await query(
    "SELECT public.write_audit_log($1, NULL, 'script.execute', 'script', $2, $3, NULL, NULL)",
    [user.sub, scriptId, JSON.stringify({ execution_id: execution.id, target_host: parsed.data.target_host })],
  );

  return c.json({
    execution_id: execution.id,
    status: execution.status,
    requires_approval: execution.requires_approval,
    message: execution.requires_approval
      ? "Execução criada. Aguardando aprovação."
      : "Execução aprovada automaticamente. Pronta para execução.",
  }, 201);
});

// GET /api/v1/scripts/:id/executions — histórico de execuções de um script
scriptsRoute.get("/:id/executions", jwtAuth, tenantContext, requirePermission("scripts:read"), async (c) => {
  const scriptId = c.req.param("id");
  const user = c.get("user");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  const result = await query(
    `SELECT id, script_id, version, status, target_host, initiated_by, approved_by, approved_at,
            started_at, completed_at, exit_code, duration_ms, created_at
     FROM public.script_executions
     WHERE script_id = $1 AND tenant_id = $2
     ORDER BY created_at DESC
     LIMIT $3 OFFSET $4`,
    [scriptId, user?.tenant_id ?? null, limit, offset],
  );

  return c.json({
    executions: result.data?.rows ?? [],
    limit,
    offset,
  });
});
