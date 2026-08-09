// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import { execFile } from "node:child_process";
import {
  createK8sClusterSchema,
  updateK8sClusterSchema,
  k8sResourceTypeSchema,
  type CreateK8sClusterInput,
  type UpdateK8sClusterInput,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { safeJsonBody } from "../lib/safe-json.js";
import { writeAuditLog } from "../lib/audit.js";
import "../types.js";

export const k8sRoute = new Hono();

// GET /api/v1/k8s — overview do modulo
k8sRoute.get("/", requirePermission("k8s:read"), httpCache(30), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  try {
    const clustersResult = await query(
      "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM public.k8s_clusters WHERE tenant_id = $1",
      [tenantId],
    );

    return c.json({
      overview: {
        clusters: clustersResult.data?.rows[0] ?? {
          total: "0",
          active: "0",
        },
      },
      endpoints: ["/clusters", "/clusters/:id", "/clusters/:id/events"],
    });
  } catch (error) {
    logger.error("Erro no overview k8s", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

// Executa kubectl usando execFile (sem shell) — previne Command Injection
// args sao passados como array, nao interpolados no shell
function execKubectl(
  kubeconfigPath: string | null,
  context: string | null,
  args: string[],
  timeoutMs: number = 30000,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const fullArgs: string[] = [];
  if (kubeconfigPath) {
    fullArgs.push(`--kubeconfig=${kubeconfigPath}`);
  }
  if (context) {
    fullArgs.push(`--context=${context}`);
  }
  fullArgs.push(...args);

  return new Promise((resolve) => {
    execFile(
      "kubectl",
      fullArgs,
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, shell: false },
      (error, stdout, stderr) => {
        resolve({
          stdout,
          stderr,
          exitCode: error ? ((error.code as number) ?? 1) : 0,
        });
      },
    );
  });
}

// GET /api/v1/k8s/clusters — lista clusters
k8sRoute.get(
  "/clusters",
  requirePermission("k8s:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        "SELECT * FROM public.k8s_clusters WHERE tenant_id = $1 ORDER BY name",
        [tenantId],
      );

      if (result.error) {
        return c.json(
          {
            error: { code: "QUERY_ERROR", message: "Erro ao buscar clusters" },
          },
          500,
        );
      }

      return c.json({ clusters: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar clusters k8s", {
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

// POST /api/v1/k8s/clusters — registra cluster
k8sRoute.post(
  "/clusters",
  rateLimitWrite,
  requirePermission("k8s:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = createK8sClusterSchema.safeParse(parsedBody.data);
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

    const data = parsed.data as CreateK8sClusterInput;

    try {
      const result = await query<{ id: string }>(
        `INSERT INTO public.k8s_clusters (tenant_id, name, display_name, api_server_url, context, namespace, kubeconfig_path)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tenant_id, name) DO UPDATE SET api_server_url = $4, updated_at = timezone('utc'::text, now())
       RETURNING id`,
        [
          tenantId,
          data.name,
          data.display_name ?? null,
          data.api_server_url ?? data.api_server,
          data.context ?? null,
          data.namespace,
          data.kubeconfig_path ?? null,
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "CREATE_ERROR",
              message: "Erro ao registrar cluster",
            },
          },
          500,
        );
      }

      const clusterId = result.data.rows[0].id;

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "k8s.cluster.register",
            entityType: "k8s_cluster",
            entityId: clusterId,
            newData: {
              name: data.name,
              api_server: data.api_server_url ?? data.api_server,
            },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Cluster k8s registrado", {
        clusterId,
        name: data.name,
        tenantId,
      });

      return c.json({ id: clusterId }, 201);
    } catch (error) {
      logger.error("Erro ao registrar cluster k8s", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "CREATE_ERROR", message: "Erro ao registrar cluster" },
        },
        500,
      );
    }
  },
);

// PUT /api/v1/k8s/clusters/:id — atualiza cluster
k8sRoute.put(
  "/clusters/:id",
  rateLimitWrite,
  requirePermission("k8s:write"),
  async (c) => {
    const clusterId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = updateK8sClusterSchema.safeParse(parsedBody.data);
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

    const data = parsed.data as UpdateK8sClusterInput;
    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    const fieldMap: Record<string, string> = {
      name: "name",
      display_name: "display_name",
      api_server_url: "api_server_url",
      context: "context",
      namespace: "namespace",
      kubeconfig_path: "kubeconfig_path",
      is_active: "is_active",
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        updateFields.push(`${dbField} = $${paramIdx++}`);
        params.push(data[key as keyof typeof data]);
      }
    }

    if (updateFields.length === 0) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Nada para atualizar" } },
        400,
      );
    }

    params.push(clusterId, tenantId);

    try {
      const result = await query(
        `UPDATE public.k8s_clusters SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
        params,
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Cluster não encontrado" } },
          404,
        );
      }

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "k8s.cluster.update",
            entityType: "k8s_cluster",
            entityId: clusterId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Cluster k8s atualizado", { clusterId, tenantId });

      return c.json({ id: clusterId });
    } catch (error) {
      logger.error("Erro ao atualizar cluster k8s", {
        clusterId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "UPDATE_ERROR", message: "Erro ao atualizar cluster" },
        },
        500,
      );
    }
  },
);

// DELETE /api/v1/k8s/clusters/:id — remove cluster
k8sRoute.delete(
  "/clusters/:id",
  rateLimitWrite,
  requirePermission("k8s:write"),
  async (c) => {
    const clusterId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        "DELETE FROM public.k8s_clusters WHERE id = $1 AND tenant_id = $2",
        [clusterId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Cluster não encontrado" } },
          404,
        );
      }

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "k8s.cluster.delete",
            entityType: "k8s_cluster",
            entityId: clusterId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Cluster k8s removido", { clusterId, tenantId });

      return c.json({ deleted: true });
    } catch (error) {
      logger.error("Erro ao remover cluster k8s", {
        clusterId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "DELETE_ERROR", message: "Erro ao remover cluster" } },
        500,
      );
    }
  },
);

// GET /api/v1/k8s/:clusterId/resources/:resourceType — lista recursos do cache
k8sRoute.get(
  "/:clusterId/resources/:resourceType",
  requirePermission("k8s:read"),
  httpCache(15),
  async (c) => {
    const clusterId = c.req.param("clusterId");
    const resourceTypeRaw = c.req.param("resourceType");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const namespace = c.req.query("namespace");

    const typeParsed = k8sResourceTypeSchema.safeParse(resourceTypeRaw);
    if (!typeParsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Tipo de recurso inválido",
          },
        },
        400,
      );
    }

    const resourceType = typeParsed.data;

    const conditions: string[] = [
      "cluster_id = $1",
      "tenant_id = $2",
      "resource_type = $3",
    ];
    const params: unknown[] = [clusterId, tenantId, resourceType];
    let paramIdx = 4;

    if (namespace && namespace !== "all") {
      conditions.push(`namespace = $${paramIdx++}`);
      params.push(namespace);
    }

    try {
      const result = await query(
        `SELECT id, namespace, name, uid, status, spec, labels, annotations, ready, restarts, node_name, pod_ip, age_seconds, cached_at
       FROM public.k8s_resources_cache
       WHERE ${conditions.join(" AND ")}
       ORDER BY namespace, name
       LIMIT 500`,
        params,
      );

      if (result.error) {
        return c.json(
          {
            error: { code: "QUERY_ERROR", message: "Erro ao buscar recursos" },
          },
          500,
        );
      }

      return c.json({
        resource_type: resourceType,
        cluster_id: clusterId,
        items: result.data?.rows ?? [],
      });
    } catch (error) {
      logger.error("Erro ao buscar recursos k8s", {
        clusterId,
        resourceType,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// POST /api/v1/k8s/:clusterId/resources/:resourceType/sync — sincroniza recursos do cluster via kubectl
k8sRoute.post(
  "/:clusterId/resources/:resourceType/sync",
  rateLimitWrite,
  requirePermission("k8s:write"),
  async (c) => {
    const clusterId = c.req.param("clusterId");
    const resourceTypeRaw = c.req.param("resourceType");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const typeParsed = k8sResourceTypeSchema.safeParse(resourceTypeRaw);
    if (!typeParsed.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Tipo de recurso inválido",
          },
        },
        400,
      );
    }

    const resourceType = typeParsed.data;

    try {
      // Busca configuracao do cluster
      const clusterResult = await query<{
        id: string;
        kubeconfig_path: string | null;
        context: string | null;
        namespace: string | null;
      }>(
        "SELECT id, kubeconfig_path, context, namespace FROM public.k8s_clusters WHERE id = $1 AND tenant_id = $2",
        [clusterId, tenantId],
      );

      if (clusterResult.error || !clusterResult.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Cluster não encontrado" } },
          404,
        );
      }

      const cluster = clusterResult.data.rows[0];

      // Constroi args para kubectl usando execFile (sem shell injection)
      const kubectlArgs: string[] = ["get", resourceType];
      if (cluster.namespace) {
        kubectlArgs.push("-n", cluster.namespace);
      } else {
        kubectlArgs.push("--all-namespaces");
      }
      kubectlArgs.push("-o", "json");

      // Executa kubectl get real (execFile = sem shell, args como array)
      const kubectlResult = await execKubectl(
        cluster.kubeconfig_path,
        cluster.context,
        kubectlArgs,
      );

      if (kubectlResult.exitCode !== 0) {
        if (user?.sub) {
          try {
            await writeAuditLog({
              userId: user.sub,
              tenantId,
              action: "k8s.resources.sync",
              entityType: "k8s_cluster",
              entityId: clusterId,
              newData: {
                resource_type: resourceType,
                error: kubectlResult.stderr,
              },
            });
          } catch {
            // Audit log falhou — nao bloqueia
          }
        }
        return c.json(
          {
            error: {
              code: "KUBECTL_ERROR",
              message: `Erro kubectl: ${kubectlResult.stderr}`,
            },
          },
          500,
        );
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

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "k8s.resources.sync",
            entityType: "k8s_cluster",
            entityId: clusterId,
            newData: {
              resource_type: resourceType,
              resources_synced: resourceCount,
            },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Recursos k8s sincronizados", {
        clusterId,
        resourceType,
        resourceCount,
        tenantId,
      });

      return c.json({
        cluster_id: clusterId,
        resource_type: resourceType,
        synced: true,
        resources_count: resourceCount,
        message: `Sincronizado: ${resourceCount} recurso(s) do tipo ${resourceType}`,
      });
    } catch (error) {
      logger.error("Erro ao sincronizar recursos k8s", {
        clusterId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: {
            code: "SYNC_ERROR",
            message: "Erro ao sincronizar recursos",
          },
        },
        500,
      );
    }
  },
);

// GET /api/v1/k8s/:clusterId/events — lista eventos do cluster
k8sRoute.get(
  "/:clusterId/events",
  requirePermission("k8s:read"),
  httpCache(15),
  async (c) => {
    const clusterId = c.req.param("clusterId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const namespace = c.req.query("namespace");
    const eventType = c.req.query("type");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "100", 10), 500);
    const offset = parseInt(c.req.query("offset") ?? "0", 10);

    const conditions: string[] = ["cluster_id = $1", "tenant_id = $2"];
    const params: unknown[] = [clusterId, tenantId];
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

    try {
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
    } catch (error) {
      logger.error("Erro ao buscar eventos k8s", {
        clusterId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// GET /api/v1/k8s/:clusterId/overview — resumo do cluster
k8sRoute.get(
  "/:clusterId/overview",
  requirePermission("k8s:read"),
  httpCache(15),
  async (c) => {
    const clusterId = c.req.param("clusterId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const clusterResult = await query(
        "SELECT * FROM public.k8s_clusters WHERE id = $1 AND tenant_id = $2",
        [clusterId, tenantId],
      );

      if (clusterResult.error || !clusterResult.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Cluster não encontrado" } },
          404,
        );
      }

      // Paraleliza 2 queries independentes (counts + events)
      const [countsResult, eventsResult] = await Promise.all([
        query(
          `SELECT resource_type, COUNT(*) as count,
              COUNT(*) FILTER (WHERE ready = 'Running' OR ready = 'Active' OR ready = 'Ready') as healthy,
              COUNT(*) FILTER (WHERE ready IS NOT NULL AND ready != 'Running' AND ready != 'Active' AND ready != 'Ready') as unhealthy
           FROM public.k8s_resources_cache
           WHERE cluster_id = $1 AND tenant_id = $2
           GROUP BY resource_type`,
          [clusterId, tenantId],
        ),
        query(
          `SELECT type, COUNT(*) as count
           FROM public.k8s_events
           WHERE cluster_id = $1 AND tenant_id = $2
             AND last_timestamp > timezone('utc'::text, now()) - INTERVAL '24 hours'
           GROUP BY type`,
          [clusterId, tenantId],
        ),
      ]);

      return c.json({
        cluster: clusterResult.data.rows[0],
        resource_counts: countsResult.data?.rows ?? [],
        event_counts_24h: eventsResult.data?.rows ?? [],
      });
    } catch (error) {
      logger.error("Erro ao buscar overview k8s", {
        clusterId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);
