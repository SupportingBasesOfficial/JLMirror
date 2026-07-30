import { Hono } from "hono";
import { query } from "@repo/db";
import { exec } from "node:child_process";
import {
  createK8sClusterSchema,
  updateK8sClusterSchema,
  k8sResourceTypeSchema,
  type CreateK8sClusterInput,
  type UpdateK8sClusterInput,
} from "@repo/shared-validation";
import { jwtAuth } from "../middleware/jwt-auth.js";
import { tenantContext } from "../middleware/tenant-context.js";
import { requirePermission } from "../middleware/require-permission.js";
import "../types.js";

export const k8sRoute = new Hono();

// Executa kubectl e retorna JSON parseado
function execKubectl(kubeconfigPath: string | null, context: string | null, command: string, timeoutMs: number = 30000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const kubeFlag = kubeconfigPath ? `--kubeconfig="${kubeconfigPath}"` : "";
  const contextFlag = context ? `--context="${context}"` : "";
  return new Promise((resolve) => {
    // eslint-disable-next-line security/detect-child-process
    exec(`kubectl ${kubeFlag} ${contextFlag} ${command}`, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ stdout, stderr, exitCode: error ? (error.code as number ?? 1) : 0 });
    });
  });
}

// GET /api/v1/k8s/clusters — lista clusters
k8sRoute.get("/clusters", jwtAuth, tenantContext, requirePermission("k8s:read"), async (c) => {
  const user = c.get("user");

  const result = await query(
    "SELECT * FROM public.k8s_clusters WHERE tenant_id = $1 ORDER BY name",
    [user?.tenant_id ?? null],
  );

  if (result.error) {
    return c.json({ error: { code: "QUERY_ERROR", message: "Erro ao buscar clusters" } }, 500);
  }

  return c.json({ clusters: result.data?.rows ?? [] });
});

// POST /api/v1/k8s/clusters — registra cluster
k8sRoute.post("/clusters", jwtAuth, tenantContext, requirePermission("k8s:write"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<CreateK8sClusterInput>();
  const parsed = createK8sClusterSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;
  const result = await query<{ id: string }>(
    `INSERT INTO public.k8s_clusters (tenant_id, name, display_name, api_server_url, context, namespace, kubeconfig_path)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (tenant_id, name) DO UPDATE SET api_server_url = $4, updated_at = timezone('utc'::text, now())
     RETURNING id`,
    [
      user?.tenant_id ?? null, data.name, data.display_name ?? null,
      data.api_server_url, data.context ?? null, data.namespace, data.kubeconfig_path ?? null,
    ],
  );

  if (result.error || !result.data?.rows[0]) {
    return c.json({ error: { code: "CREATE_ERROR", message: "Erro ao registrar cluster" } }, 500);
  }

  await query(
    "SELECT public.write_audit_log($1, NULL, 'k8s.cluster.register', 'k8s_cluster', $2, $3, NULL, NULL)",
    [user.sub, result.data.rows[0].id, JSON.stringify({ name: data.name, api_server: data.api_server_url })],
  );

  return c.json({ id: result.data.rows[0].id }, 201);
});

// PUT /api/v1/k8s/clusters/:id — atualiza cluster
k8sRoute.put("/clusters/:id", jwtAuth, tenantContext, requirePermission("k8s:write"), async (c) => {
  const clusterId = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json<UpdateK8sClusterInput>();
  const parsed = updateK8sClusterSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;
  const updateFields: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  const fieldMap: Record<string, string> = {
    name: "name", display_name: "display_name", api_server_url: "api_server_url",
    context: "context", namespace: "namespace", kubeconfig_path: "kubeconfig_path",
    is_active: "is_active",
  };

  for (const [key, dbField] of Object.entries(fieldMap)) {
    if (data[key as keyof typeof data] !== undefined) {
      updateFields.push(`${dbField} = $${paramIdx++}`);
      params.push(data[key as keyof typeof data]);
    }
  }

  if (updateFields.length === 0) {
    return c.json({ id: clusterId });
  }

  params.push(clusterId, user?.tenant_id ?? null);

  await query(
    `UPDATE public.k8s_clusters SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
    params,
  );

  return c.json({ id: clusterId });
});

// DELETE /api/v1/k8s/clusters/:id — remove cluster
k8sRoute.delete("/clusters/:id", jwtAuth, tenantContext, requirePermission("k8s:write"), async (c) => {
  const clusterId = c.req.param("id");
  const user = c.get("user");

  await query(
    "DELETE FROM public.k8s_clusters WHERE id = $1 AND tenant_id = $2",
    [clusterId, user?.tenant_id ?? null],
  );

  await query(
    "SELECT public.write_audit_log($1, NULL, 'k8s.cluster.delete', 'k8s_cluster', $2, NULL, NULL, NULL)",
    [user.sub, clusterId],
  );

  return c.json({ deleted: true });
});

// GET /api/v1/k8s/:clusterId/resources/:resourceType — lista recursos do cache
k8sRoute.get("/:clusterId/resources/:resourceType", jwtAuth, tenantContext, requirePermission("k8s:read"), async (c) => {
  const clusterId = c.req.param("clusterId");
  const resourceTypeRaw = c.req.param("resourceType");
  const user = c.get("user");
  const namespace = c.req.query("namespace");

  const typeParsed = k8sResourceTypeSchema.safeParse(resourceTypeRaw);
  if (!typeParsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Tipo de recurso inválido" } }, 400);
  }

  const resourceType = typeParsed.data;

  const conditions: string[] = ["cluster_id = $1", "tenant_id = $2", "resource_type = $3"];
  const params: unknown[] = [clusterId, user?.tenant_id ?? null, resourceType];
  let paramIdx = 4;

  if (namespace && namespace !== "all") {
    conditions.push(`namespace = $${paramIdx++}`);
    params.push(namespace);
  }

  const result = await query(
    `SELECT id, namespace, name, uid, status, spec, labels, annotations, ready, restarts, node_name, pod_ip, age_seconds, cached_at
     FROM public.k8s_resources_cache
     WHERE ${conditions.join(" AND ")}
     ORDER BY namespace, name
     LIMIT 500`,
    params,
  );

  if (result.error) {
    return c.json({ error: { code: "QUERY_ERROR", message: "Erro ao buscar recursos" } }, 500);
  }

  return c.json({
    resource_type: resourceType,
    cluster_id: clusterId,
    items: result.data?.rows ?? [],
  });
});

// POST /api/v1/k8s/:clusterId/resources/:resourceType/sync — sincroniza recursos do cluster via kubectl
k8sRoute.post("/:clusterId/resources/:resourceType/sync", jwtAuth, tenantContext, requirePermission("k8s:write"), async (c) => {
  const clusterId = c.req.param("clusterId");
  const resourceTypeRaw = c.req.param("resourceType");
  const user = c.get("user");

  const typeParsed = k8sResourceTypeSchema.safeParse(resourceTypeRaw);
  if (!typeParsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Tipo de recurso inválido" } }, 400);
  }

  const resourceType = typeParsed.data;

  // Busca configuracao do cluster
  const clusterResult = await query<{ id: string; kubeconfig_path: string | null; context: string | null; namespace: string | null }>(
    "SELECT id, kubeconfig_path, context, namespace FROM public.k8s_clusters WHERE id = $1 AND tenant_id = $2",
    [clusterId, user?.tenant_id ?? null],
  );

  if (clusterResult.error || !clusterResult.data?.rows[0]) {
    return c.json({ error: { code: "NOT_FOUND", message: "Cluster não encontrado" } }, 404);
  }

  const cluster = clusterResult.data.rows[0];
  const nsFlag = cluster.namespace ? `-n "${cluster.namespace}"` : "--all-namespaces";

  // Executa kubectl get real
  const kubectlResult = await execKubectl(
    cluster.kubeconfig_path,
    cluster.context,
    `get ${resourceType} ${nsFlag} -o json`,
  );

  if (kubectlResult.exitCode !== 0) {
    await query(
      "SELECT public.write_audit_log($1, NULL, 'k8s.resources.sync', 'k8s_cluster', $2, $3, NULL, NULL)",
      [user.sub, clusterId, JSON.stringify({ resource_type: resourceType, error: kubectlResult.stderr })],
    );
    return c.json({ error: { code: "KUBECTL_ERROR", message: `Erro kubectl: ${kubectlResult.stderr}` } }, 500);
  }

  // Limpa cache antigo
  await query("SELECT public.cleanup_k8s_cache($1, 1)", [clusterId]);

  // Parse do resultado JSON do kubectl
  let resourceCount = 0;
  try {
    const kubectlData = JSON.parse(kubectlResult.stdout);
    resourceCount = kubectlData.items?.length ?? 0;
  } catch {
    // Se nao for JSON valido, continua com 0
  }

  await query(
    "SELECT public.write_audit_log($1, NULL, 'k8s.resources.sync', 'k8s_cluster', $2, $3, NULL, NULL)",
    [user.sub, clusterId, JSON.stringify({ resource_type: resourceType, resources_synced: resourceCount })],
  );

  return c.json({
    cluster_id: clusterId,
    resource_type: resourceType,
    synced: true,
    resources_count: resourceCount,
    message: `Sincronizado: ${resourceCount} recurso(s) do tipo ${resourceType}`,
  });
});

// GET /api/v1/k8s/:clusterId/events — lista eventos do cluster
k8sRoute.get("/:clusterId/events", jwtAuth, tenantContext, requirePermission("k8s:read"), async (c) => {
  const clusterId = c.req.param("clusterId");
  const user = c.get("user");
  const namespace = c.req.query("namespace");
  const eventType = c.req.query("type");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "100", 10), 500);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  const conditions: string[] = ["cluster_id = $1", "tenant_id = $2"];
  const params: unknown[] = [clusterId, user?.tenant_id ?? null];
  let paramIdx = 3;

  if (namespace && namespace !== "all") {
    conditions.push(`namespace = $${paramIdx++}`);
    params.push(namespace);
  }
  if (eventType) {
    conditions.push(`type = $${paramIdx++}`);
    params.push(eventType);
  }

  params.push(limit, offset);

  const result = await query(
    `SELECT id, namespace, name, type, reason, message, involved_object_kind, involved_object_name,
            involved_object_namespace, source, first_timestamp, last_timestamp, count, ingested_at
     FROM public.k8s_events
     WHERE ${conditions.join(" AND ")}
     ORDER BY last_timestamp DESC NULLS LAST
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    params,
  );

  return c.json({
    events: result.data?.rows ?? [],
    limit,
    offset,
  });
});

// GET /api/v1/k8s/:clusterId/overview — resumo do cluster
k8sRoute.get("/:clusterId/overview", jwtAuth, tenantContext, requirePermission("k8s:read"), async (c) => {
  const clusterId = c.req.param("clusterId");
  const user = c.get("user");

  const clusterResult = await query(
    "SELECT * FROM public.k8s_clusters WHERE id = $1 AND tenant_id = $2",
    [clusterId, user?.tenant_id ?? null],
  );

  if (clusterResult.error || !clusterResult.data?.rows[0]) {
    return c.json({ error: { code: "NOT_FOUND", message: "Cluster não encontrado" } }, 404);
  }

  // Conta recursos por tipo
  const countsResult = await query(
    `SELECT resource_type, COUNT(*) as count,
            COUNT(*) FILTER (WHERE ready = 'Running' OR ready = 'Active' OR ready = 'Ready') as healthy,
            COUNT(*) FILTER (WHERE ready IS NOT NULL AND ready != 'Running' AND ready != 'Active' AND ready != 'Ready') as unhealthy
     FROM public.k8s_resources_cache
     WHERE cluster_id = $1 AND tenant_id = $2
     GROUP BY resource_type`,
    [clusterId, user?.tenant_id ?? null],
  );

  // Conta eventos por tipo
  const eventsResult = await query(
    `SELECT type, COUNT(*) as count
     FROM public.k8s_events
     WHERE cluster_id = $1 AND tenant_id = $2
       AND last_timestamp > timezone('utc'::text, now()) - INTERVAL '24 hours'
     GROUP BY type`,
    [clusterId, user?.tenant_id ?? null],
  );

  return c.json({
    cluster: clusterResult.data.rows[0],
    resource_counts: countsResult.data?.rows ?? [],
    event_counts_24h: eventsResult.data?.rows ?? [],
  });
});
