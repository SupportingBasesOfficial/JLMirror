// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Rotas de admin Zabbix: templates, maintenance, services, SLA, actions,
// proxies, discovery, reports, host groups, users, user groups, user-host-groups
// + novos endpoints: trends, usermacros, valuemaps, alerts, mediatypes,
//   httptests, correlations, dashboards, proxygroups, tokens, auditlog,
//   hanodes, connectors, script.execute, configuration import/export

import type { Hono } from "hono";
import { query } from "@repo/db";
import {
  zabbixCreateMaintenanceSchema,
  zabbixCreateHostGroupSchema,
  zabbixUpdateHostGroupSchema,
  zabbixCreateUserSchema,
  zabbixUpdateUserSchema,
  zabbixCreateUserGroupSchema,
  zabbixUpdateUserGroupSchema,
  assignUserHostGroupSchema,
} from "@repo/shared-validation";
import {
  createZabbixClient,
  zabbixErrorResponse,
  configNotFoundResponse,
  validationErrorResponse,
  accessDeniedResponse,
  verifyHostOwnership,
  redactSensitiveFields,
  enqueueWriteJob,
} from "./shared.js";

export function registerAdminRoutes(zabbixRoute: Hono) {
  // ==================== TEMPLATES ====================
  zabbixRoute.get("/templates", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const hostId = c.req.query("host_id");

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      // Se hostId informado, verifica posse (IDOR protection)
      if (hostId) {
        const belongs = await verifyHostOwnership(ctx, hostId);
        if (!belongs) {
          return c.json(accessDeniedResponse(), 403);
        }
      }
      const templates = await ctx.client.getTemplates(hostId);
      return c.json({ data: templates });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // ==================== MAINTENANCE ====================
  zabbixRoute.get("/maintenances", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const hostId = c.req.query("host_id");

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      // Se hostId informado, verifica posse (IDOR protection)
      if (hostId) {
        const belongs = await verifyHostOwnership(ctx, hostId);
        if (!belongs) {
          return c.json(accessDeniedResponse(), 403);
        }
      }
      const hostIds = hostId ? [hostId] : undefined;
      const maintenances = await ctx.client.getMaintenances(hostIds);
      return c.json({ data: maintenances });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  zabbixRoute.post("/maintenances", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const userId = user.sub;

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const body = await c.req.json();
      const parsed = zabbixCreateMaintenanceSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(validationErrorResponse(parsed.error.flatten()), 400);
      }
      // Verifica se os hostids informados pertencem ao tenant (IDOR protection)
      if (Array.isArray(parsed.data.hostids)) {
        for (const hid of parsed.data.hostids) {
          const belongs = await verifyHostOwnership(ctx, hid);
          if (!belongs) {
            return c.json(accessDeniedResponse(), 403);
          }
        }
      }
      const jobId = await enqueueWriteJob({
        tenantId,
        userId,
        operation: "maintenance.create",
        method: "maintenance.create",
        params: parsed.data as Record<string, unknown>,
      });
      return c.json({ ok: true, jobId, status: "queued" }, 202);
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  zabbixRoute.delete("/maintenances/:id", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const userId = user.sub;
    const maintenanceId = c.req.param("id");

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const jobId = await enqueueWriteJob({
        tenantId,
        userId,
        operation: "maintenance.delete",
        method: "maintenance.delete",
        params: [maintenanceId] as unknown as Record<string, unknown>,
      });
      return c.json({ ok: true, jobId, status: "queued" }, 202);
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // ==================== SERVICES ====================
  zabbixRoute.get("/services", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const parentId = c.req.query("parent_id");

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const services = await ctx.client.getServices(parentId);
      return c.json({ data: services });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // ==================== SLA ====================
  zabbixRoute.get("/slas", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const slas = await ctx.client.getSlas();
      return c.json({ data: slas });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // ==================== USERS ====================
  zabbixRoute.get("/users", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const users = await ctx.client.getUsers();
      // Ofusca campos sensiveis (passwd, etc)
      return c.json({ data: redactSensitiveFields(users) });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  zabbixRoute.post("/users", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const userId = user.sub;

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const body = await c.req.json();
      const parsed = zabbixCreateUserSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(validationErrorResponse(parsed.error.flatten()), 400);
      }
      const jobId = await enqueueWriteJob({
        tenantId,
        userId,
        operation: "user.create",
        method: "user.create",
        params: parsed.data as Record<string, unknown>,
      });
      return c.json({ ok: true, jobId, status: "queued" }, 202);
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  zabbixRoute.put("/users/:id", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const userId = user.sub;
    const targetUserId = c.req.param("id");

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const body = await c.req.json();
      const parsed = zabbixUpdateUserSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(validationErrorResponse(parsed.error.flatten()), 400);
      }
      const jobId = await enqueueWriteJob({
        tenantId,
        userId,
        operation: "user.update",
        method: "user.update",
        params: { userid: targetUserId, ...parsed.data } as Record<
          string,
          unknown
        >,
      });
      return c.json({ ok: true, jobId, status: "queued" }, 202);
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  zabbixRoute.delete("/users/:id", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const userId = user.sub;
    const targetUserId = c.req.param("id");

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const jobId = await enqueueWriteJob({
        tenantId,
        userId,
        operation: "user.delete",
        method: "user.delete",
        params: [targetUserId] as unknown as Record<string, unknown>,
      });
      return c.json({ ok: true, jobId, status: "queued" }, 202);
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // ==================== ACTIONS ====================
  zabbixRoute.get("/actions", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const actions = await ctx.client.getActions();
      return c.json({ data: actions });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // ==================== PROXIES ====================
  zabbixRoute.get("/proxies", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const proxies = await ctx.client.getProxies();
      return c.json({ data: proxies });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // ==================== DISCOVERY ====================
  zabbixRoute.get("/discovery-rules", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const rules = await ctx.client.getDiscoveryRules();
      return c.json({ data: rules });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // ==================== REPORTS ====================
  zabbixRoute.get("/reports", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const reports = await ctx.client.getReports();
      return c.json({ data: reports });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // ==================== HOST GROUPS ====================
  zabbixRoute.get("/host-groups", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const groups = await ctx.client.getHostGroupsWithHosts();
      return c.json({ data: groups });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  zabbixRoute.post("/host-groups", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const userId = user.sub;

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const body = await c.req.json();
      const parsed = zabbixCreateHostGroupSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(validationErrorResponse(parsed.error.flatten()), 400);
      }
      const jobId = await enqueueWriteJob({
        tenantId,
        userId,
        operation: "hostgroup.create",
        method: "hostgroup.create",
        params: { name: parsed.data.name },
      });
      return c.json({ ok: true, jobId, status: "queued" }, 202);
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  zabbixRoute.put("/host-groups/:id", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const userId = user.sub;
    const groupId = c.req.param("id");

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const body = await c.req.json();
      const parsed = zabbixUpdateHostGroupSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(validationErrorResponse(parsed.error.flatten()), 400);
      }
      const jobId = await enqueueWriteJob({
        tenantId,
        userId,
        operation: "hostgroup.update",
        method: "hostgroup.update",
        params: { groupid: groupId, name: parsed.data.name },
      });
      return c.json({ ok: true, jobId, status: "queued" }, 202);
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  zabbixRoute.delete("/host-groups/:id", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const userId = user.sub;
    const groupId = c.req.param("id");

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      // Nao permite deletar o proprio host_group_id do tenant
      if (groupId === ctx.hostGroupId) {
        return c.json(
          {
            error: {
              code: "CANNOT_DELETE_OWN_GROUP",
              message: "Não é possível remover o grupo do próprio tenant",
            },
          },
          403,
        );
      }
      const jobId = await enqueueWriteJob({
        tenantId,
        userId,
        operation: "hostgroup.delete",
        method: "hostgroup.delete",
        params: [groupId] as unknown as Record<string, unknown>,
      });
      return c.json({ ok: true, jobId, status: "queued" }, 202);
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // ==================== ZABBIX USER GROUPS ====================
  zabbixRoute.get("/user-groups", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const groups = await ctx.client.getUserGroups();
      return c.json({ data: groups });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  zabbixRoute.post("/user-groups", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const userId = user.sub;

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const body = await c.req.json();
      const parsed = zabbixCreateUserGroupSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(validationErrorResponse(parsed.error.flatten()), 400);
      }
      const jobId = await enqueueWriteJob({
        tenantId,
        userId,
        operation: "usergroup.create",
        method: "usergroup.create",
        params: { name: parsed.data.name, permission: parsed.data.permission },
      });
      return c.json({ ok: true, jobId, status: "queued" }, 202);
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  zabbixRoute.put("/user-groups/:id", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const userId = user.sub;
    const groupId = c.req.param("id");

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const body = await c.req.json();
      const parsed = zabbixUpdateUserGroupSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(validationErrorResponse(parsed.error.flatten()), 400);
      }
      const jobId = await enqueueWriteJob({
        tenantId,
        userId,
        operation: "usergroup.update",
        method: "usergroup.update",
        params: { usrgrpid: groupId, ...parsed.data } as Record<
          string,
          unknown
        >,
      });
      return c.json({ ok: true, jobId, status: "queued" }, 202);
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  zabbixRoute.delete("/user-groups/:id", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const userId = user.sub;
    const groupId = c.req.param("id");

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const jobId = await enqueueWriteJob({
        tenantId,
        userId,
        operation: "usergroup.delete",
        method: "usergroup.delete",
        params: [groupId] as unknown as Record<string, unknown>,
      });
      return c.json({ ok: true, jobId, status: "queued" }, 202);
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // ==================== USER HOST GROUP ASSIGNMENT ====================
  zabbixRoute.get("/user-host-groups", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const userId = c.req.query("user_id");

    let sql = `SELECT id, user_id, zabbix_host_group_id, zabbix_host_group_name, created_at
               FROM public.user_host_groups WHERE tenant_id = $1`;
    const params: unknown[] = [tenantId];
    if (userId) {
      sql += ` AND user_id = $2`;
      params.push(userId);
    }
    sql += ` ORDER BY created_at DESC`;

    const result = await query(sql, params);
    return c.json({ data: result.data?.rows ?? [] });
  });

  zabbixRoute.post("/user-host-groups", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    try {
      const body = await c.req.json();
      const parsed = assignUserHostGroupSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(validationErrorResponse(parsed.error.flatten()), 400);
      }

      const result = await query<{ id: string }>(
        `INSERT INTO public.user_host_groups (tenant_id, user_id, zabbix_host_group_id, zabbix_host_group_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id, user_id, zabbix_host_group_id) DO UPDATE SET zabbix_host_group_name = EXCLUDED.zabbix_host_group_name
         RETURNING id`,
        [
          tenantId,
          parsed.data.user_id,
          parsed.data.zabbix_host_group_id,
          parsed.data.zabbix_host_group_name ?? null,
        ],
      );

      return c.json({ ok: true, id: result.data?.rows[0]?.id });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  zabbixRoute.delete("/user-host-groups/:id", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const assignmentId = c.req.param("id");

    const result = await query(
      "DELETE FROM public.user_host_groups WHERE id = $1 AND tenant_id = $2",
      [assignmentId, tenantId],
    );

    if (result.error) {
      return c.json(
        {
          error: {
            code: "DELETE_ERROR",
            message: "Erro ao remover atribuição",
          },
        },
        500,
      );
    }

    return c.json({ ok: true });
  });

  zabbixRoute.get("/user-host-groups/by-group/:groupId", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const groupId = c.req.param("groupId");

    const result = await query(
      `SELECT uhg.id, uhg.user_id, uhg.zabbix_host_group_id, uhg.zabbix_host_group_name, uhg.created_at,
              u.email, u.full_name
       FROM public.user_host_groups uhg
       JOIN public.users u ON uhg.user_id = u.id
       WHERE uhg.tenant_id = $1 AND uhg.zabbix_host_group_id = $2
       ORDER BY uhg.created_at DESC`,
      [tenantId, groupId],
    );

    return c.json({ data: result.data?.rows ?? [] });
  });

  // ==================== NOVOS ENDPOINTS ZABBIX 7.4 ====================

  // GET /api/v1/zabbix/user-macros?host_id=...
  zabbixRoute.get("/user-macros", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const hostId = c.req.query("host_id");

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      if (hostId) {
        const belongs = await verifyHostOwnership(ctx, hostId);
        if (!belongs) {
          return c.json(accessDeniedResponse(), 403);
        }
      }
      const macros = await ctx.client.getUserMacros(hostId);
      // Macros secretas ja sao ofuscadas no client, mas garantimos aqui tambem
      return c.json({ data: redactSensitiveFields(macros) });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // GET /api/v1/zabbix/value-maps
  zabbixRoute.get("/value-maps", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const valueMaps = await ctx.client.getValueMaps();
      return c.json({ data: valueMaps });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // GET /api/v1/zabbix/alerts?limit=100
  zabbixRoute.get("/alerts", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const limitStr = c.req.query("limit");

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const limit = limitStr ? Number(limitStr) : undefined;
      const alerts = await ctx.client.getAlerts(limit);
      return c.json({ data: alerts });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // GET /api/v1/zabbix/media-types
  zabbixRoute.get("/media-types", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const mediaTypes = await ctx.client.getMediaTypes();
      return c.json({ data: mediaTypes });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // GET /api/v1/zabbix/http-tests?host_id=...
  zabbixRoute.get("/http-tests", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const hostId = c.req.query("host_id");

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      if (hostId) {
        const belongs = await verifyHostOwnership(ctx, hostId);
        if (!belongs) {
          return c.json(accessDeniedResponse(), 403);
        }
      }
      const httpTests = await ctx.client.getHttpTests(hostId);
      return c.json({ data: httpTests });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // GET /api/v1/zabbix/correlations
  zabbixRoute.get("/correlations", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const correlations = await ctx.client.getCorrelations();
      return c.json({ data: correlations });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // GET /api/v1/zabbix/dashboards
  zabbixRoute.get("/dashboards", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const dashboards = await ctx.client.getDashboards();
      return c.json({ data: dashboards });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // GET /api/v1/zabbix/proxy-groups
  zabbixRoute.get("/proxy-groups", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const proxyGroups = await ctx.client.getProxyGroups();
      return c.json({ data: proxyGroups });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // GET /api/v1/zabbix/tokens
  zabbixRoute.get("/tokens", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const tokens = await ctx.client.getTokens();
      return c.json({ data: tokens });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // GET /api/v1/zabbix/audit-log?limit=100
  zabbixRoute.get("/audit-log", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const limitStr = c.req.query("limit");

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const limit = limitStr ? Number(limitStr) : undefined;
      const auditLog = await ctx.client.getAuditLog(limit);
      return c.json({ data: auditLog });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // GET /api/v1/zabbix/ha-nodes
  zabbixRoute.get("/ha-nodes", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const haNodes = await ctx.client.getHaNodes();
      return c.json({ data: haNodes });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // GET /api/v1/zabbix/connectors
  zabbixRoute.get("/connectors", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const connectors = await ctx.client.getConnectors();
      return c.json({ data: connectors });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // POST /api/v1/zabbix/connector/setup
  // Configura connector de streaming no Zabbix do tenant:
  // 1. Gera token unico para o connector
  // 2. Salva token em tenant_routes.zabbix_connector_token
  // 3. Chama connector.create no Zabbix apontando para nosso endpoint receptor
  zabbixRoute.post("/connector/setup", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const body = await c.req.json().catch(() => ({}));
      const dataType = body.data_type ?? "history";
      const connectorName = body.name ?? `JLMIRROR-${tenantId.slice(0, 8)}`;

      // Gera token unico (32 bytes hex)
      const { randomBytes } = await import("node:crypto");
      const connectorToken = randomBytes(32).toString("hex");

      // URL do endpoint receptor — usa a URL base da request
      const requestUrl = new URL(c.req.url);
      const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;
      const streamUrl = `${baseUrl}/api/v1/zabbix/connector/stream`;

      // Salva token no banco antes de criar o connector no Zabbix
      const updateResult = await query(
        `UPDATE public.tenant_routes
         SET zabbix_connector_token = $1
         WHERE tenant_id = $2 AND status = 'active'`,
        [connectorToken, tenantId],
      );

      if (updateResult.error) {
        return c.json(
          {
            error: {
              code: "DB_ERROR",
              message: "Erro ao salvar token do connector",
            },
          },
          500,
        );
      }

      // Cria o connector no Zabbix
      const result = await ctx.client.createConnector({
        name: connectorName,
        url: streamUrl,
        data_type: dataType,
        token: connectorToken,
      });

      return c.json({
        ok: true,
        connectorids: result.connectorids,
        stream_url: streamUrl,
        data_type: dataType,
      });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // DELETE /api/v1/zabbix/connector/:id — remove connector do Zabbix e limpa token
  zabbixRoute.delete("/connector/:id", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const connectorId = c.req.param("id");

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      // Deleta o connector no Zabbix
      await ctx.client.rpc("connector.delete", [
        connectorId,
      ] as unknown as Record<string, unknown>);

      // Limpa o token do banco
      await query(
        `UPDATE public.tenant_routes
         SET zabbix_connector_token = NULL
         WHERE tenant_id = $1 AND status = 'active'`,
        [tenantId],
      );

      return c.json({ ok: true });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // POST /api/v1/zabbix/scripts/:id/execute — executa comando remoto
  zabbixRoute.post("/scripts/:id/execute", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const scriptId = c.req.param("id");

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const body = await c.req.json().catch(() => ({}));
      const hostId = body.hostid as string | undefined;
      if (!hostId) {
        return c.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "hostid é obrigatório",
            },
          },
          400,
        );
      }
      // Verifica posse do host antes de executar script (IDOR protection)
      const belongs = await verifyHostOwnership(ctx, hostId);
      if (!belongs) {
        return c.json(accessDeniedResponse(), 403);
      }
      const result = await ctx.client.executeScript(scriptId, hostId);
      return c.json({ ok: true, result: result.result });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // POST /api/v1/zabbix/configuration/export — exporta configuracoes
  zabbixRoute.post("/configuration/export", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const body = await c.req.json().catch(() => ({}));
      const result = await ctx.client.exportConfiguration({
        hosts: body.hosts,
        templates: body.templates,
        format: body.format ?? "json",
      });
      return c.json({ data: result });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // POST /api/v1/zabbix/configuration/import — importa configuracoes
  zabbixRoute.post("/configuration/import", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const body = await c.req.json();
      if (!body.source || !body.format) {
        return c.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "source e format são obrigatórios",
            },
          },
          400,
        );
      }
      const result = await ctx.client.importConfiguration(
        body.source,
        body.format,
      );
      return c.json({ ok: true, imported: result.imported });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });
}
