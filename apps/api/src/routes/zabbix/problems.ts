// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Rotas de problems, events e acknowledge

import type { Hono } from "hono";
import { zabbixAcknowledgeSchema } from "@repo/shared-validation";
import {
  createZabbixClient,
  zabbixErrorResponse,
  configNotFoundResponse,
  validationErrorResponse,
  accessDeniedResponse,
  verifyHostOwnership,
  enqueueWriteJob,
} from "./shared.js";

export function registerProblemsRoutes(zabbixRoute: Hono) {
  // GET /api/v1/zabbix/problems?host_id=...&acknowledged=false
  zabbixRoute.get("/problems", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const hostId = c.req.query("host_id");
    const acknowledged = c.req.query("acknowledged");

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
      const options: { acknowledged?: boolean } = {};
      if (acknowledged !== undefined)
        options.acknowledged = acknowledged === "true";
      const problems = await ctx.client.getProblems(hostIds, options);
      return c.json({ data: problems });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // GET /api/v1/zabbix/events?host_id=...&value=1&limit=100
  zabbixRoute.get("/events", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const hostId = c.req.query("host_id");
    const value = c.req.query("value");
    const acknowledged = c.req.query("acknowledged");
    const limit = c.req.query("limit");
    const from = c.req.query("from");
    const to = c.req.query("to");

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
      const hostIds = hostId ? [hostId] : [];
      const options: {
        value?: number;
        acknowledged?: boolean;
        limit?: number;
        from?: number;
        to?: number;
      } = {};
      if (value) options.value = Number(value);
      if (acknowledged !== undefined)
        options.acknowledged = acknowledged === "true";
      if (limit) options.limit = Number(limit);
      if (from) options.from = Number(from);
      if (to) options.to = Number(to);
      const events = await ctx.client.getEvents(hostIds, options);
      return c.json({ data: events });
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });

  // POST /api/v1/zabbix/acknowledge
  zabbixRoute.post("/acknowledge", async (c) => {
    const user = c.get("user");
    const tenantId = user.tenant_id;
    const userId = user.sub;

    const ctx = await createZabbixClient(tenantId, user.scope === "global");
    if (!ctx) {
      return c.json(configNotFoundResponse(), 503);
    }

    try {
      const body = await c.req.json();
      const parsed = zabbixAcknowledgeSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(validationErrorResponse(parsed.error.flatten()), 400);
      }
      const d = parsed.data;
      const jobId = await enqueueWriteJob({
        tenantId,
        userId,
        operation: "event.acknowledge",
        method: "event.acknowledge",
        params: {
          eventids: d.eventids,
          message: d.message,
          action: d.action,
        },
      });
      return c.json({ ok: true, jobId, status: "queued" }, 202);
    } catch (error) {
      return c.json(zabbixErrorResponse(error), 502);
    }
  });
}
