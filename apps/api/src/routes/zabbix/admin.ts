// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Rotas de admin Zabbix: templates, maintenance, services, SLA, actions,
// proxies, discovery, reports, host groups, users, user groups, user-host-groups

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
} from "./shared.js";

export function registerAdminRoutes(zabbixRoute: Hono) {
  // ==================== TEMPLATES ====================
  zabbixRoute.get("/templates", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const hostId = c.req.query("host_id");

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const templates = await client.getTemplates(hostId);
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

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const hostIds = hostId ? [hostId] : undefined;
      const maintenances = await client.getMaintenances(hostIds);
      return c.json({ data: maintenances });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  zabbixRoute.post("/maintenances", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const body = await c.req.json();
      const parsed = zabbixCreateMaintenanceSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(validationErrorResponse(parsed.error.flatten()), 400);
      }
      const result = await client.createMaintenance(parsed.data);
      return c.json({ ok: true, maintenanceids: result.maintenanceids });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  zabbixRoute.delete("/maintenances/:id", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const maintenanceId = c.req.param("id");

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      await client.deleteMaintenance([maintenanceId]);
      return c.json({ ok: true });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // ==================== SERVICES ====================
  zabbixRoute.get("/services", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const parentId = c.req.query("parent_id");

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const services = await client.getServices(parentId);
      return c.json({ data: services });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // ==================== SLA ====================
  zabbixRoute.get("/slas", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const slas = await client.getSlas();
      return c.json({ data: slas });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // ==================== USERS ====================
  zabbixRoute.get("/users", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const users = await client.getUsers();
      return c.json({ data: users });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  zabbixRoute.post("/users", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const body = await c.req.json();
      const parsed = zabbixCreateUserSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(validationErrorResponse(parsed.error.flatten()), 400);
      }
      const result = await client.createUser(parsed.data);
      return c.json({ ok: true, userids: result.userids });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  zabbixRoute.put("/users/:id", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const userId = c.req.param("id");

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const body = await c.req.json();
      const parsed = zabbixUpdateUserSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(validationErrorResponse(parsed.error.flatten()), 400);
      }
      await client.updateUser(userId, parsed.data);
      return c.json({ ok: true });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  zabbixRoute.delete("/users/:id", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const userId = c.req.param("id");

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      await client.deleteUser([userId]);
      return c.json({ ok: true });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // ==================== ACTIONS ====================
  zabbixRoute.get("/actions", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const actions = await client.getActions();
      return c.json({ data: actions });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // ==================== PROXIES ====================
  zabbixRoute.get("/proxies", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const proxies = await client.getProxies();
      return c.json({ data: proxies });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // ==================== DISCOVERY ====================
  zabbixRoute.get("/discovery-rules", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const rules = await client.getDiscoveryRules();
      return c.json({ data: rules });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // ==================== REPORTS ====================
  zabbixRoute.get("/reports", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const reports = await client.getReports();
      return c.json({ data: reports });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // ==================== HOST GROUPS ====================
  zabbixRoute.get("/host-groups", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const groups = await client.getHostGroupsWithHosts();
      return c.json({ data: groups });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  zabbixRoute.post("/host-groups", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const body = await c.req.json();
      const parsed = zabbixCreateHostGroupSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(validationErrorResponse(parsed.error.flatten()), 400);
      }
      const result = await client.createHostGroup(parsed.data.name);
      return c.json({ ok: true, groupids: result.groupids });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  zabbixRoute.put("/host-groups/:id", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const groupId = c.req.param("id");

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const body = await c.req.json();
      const parsed = zabbixUpdateHostGroupSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(validationErrorResponse(parsed.error.flatten()), 400);
      }
      await client.updateHostGroup(groupId, parsed.data.name);
      return c.json({ ok: true });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  zabbixRoute.delete("/host-groups/:id", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const groupId = c.req.param("id");

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      await client.deleteHostGroup([groupId]);
      return c.json({ ok: true });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // ==================== ZABBIX USER GROUPS ====================
  zabbixRoute.get("/user-groups", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const groups = await client.getUserGroups();
      return c.json({ data: groups });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  zabbixRoute.post("/user-groups", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const body = await c.req.json();
      const parsed = zabbixCreateUserGroupSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(validationErrorResponse(parsed.error.flatten()), 400);
      }
      const result = await client.createUserGroup(
        parsed.data.name,
        parsed.data.permission,
      );
      return c.json({ ok: true, usrgrpids: result.usrgrpids });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  zabbixRoute.put("/user-groups/:id", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const groupId = c.req.param("id");

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const body = await c.req.json();
      const parsed = zabbixUpdateUserGroupSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(validationErrorResponse(parsed.error.flatten()), 400);
      }
      await client.updateUserGroup(groupId, parsed.data);
      return c.json({ ok: true });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  zabbixRoute.delete("/user-groups/:id", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const groupId = c.req.param("id");

    const client = await createZabbixClient(tenantId);
    if (!client) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      await client.deleteUserGroup([groupId]);
      return c.json({ ok: true });
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
              u.email, u.full_name, tu.role
       FROM public.user_host_groups uhg
       JOIN public.users u ON uhg.user_id = u.id
       LEFT JOIN public.tenant_users tu ON tu.user_id = u.id AND tu.tenant_id = uhg.tenant_id
       WHERE uhg.tenant_id = $1 AND uhg.zabbix_host_group_id = $2
       ORDER BY uhg.created_at DESC`,
      [tenantId, groupId],
    );

    return c.json({ data: result.data?.rows ?? [] });
  });
}
