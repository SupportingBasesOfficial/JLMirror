// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import { requirePermission } from "../middleware/require-permission.js";
import { validate } from "../middleware/validate.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { discoverySessionSchema } from "@repo/shared-validation";
import { writeAuditLog } from "../lib/audit.js";
import "../types.js";

export const discoveryRoute = new Hono();

// GET /api/v1/discovery — overview do modulo
discoveryRoute.get(
  "/",
  requirePermission("discovery:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const sessionsResult = await query(
        "SELECT COUNT(*) as total FROM public.discovery_sessions WHERE tenant_id = $1",
        [tenantId],
      );

      return c.json({
        overview: {
          sessions: sessionsResult.data?.rows[0]?.total ?? "0",
        },
        endpoints: [
          "/sessions",
          "/sessions/:id",
          "/sessions/:id/devices",
          "/sessions/:id/links",
          "/sessions/:id/topology",
          "/devices/:id/import",
        ],
      });
    } catch (error) {
      logger.error("Erro ao buscar discovery overview", {
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

// ========== Sessions ==========

// GET /api/v1/discovery/sessions — lista sessoes de discovery
discoveryRoute.get(
  "/sessions",
  requirePermission("discovery:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Usa LEFT JOIN + agregacao em vez de N+1 subqueries
      const result = await query(
        `SELECT s.*,
           COALESCE(dd.device_count, 0) as device_count,
           COALESCE(dl.link_count, 0) as link_count
         FROM public.discovery_sessions s
         LEFT JOIN (
           SELECT session_id, COUNT(*) as device_count
           FROM public.discovered_devices
           GROUP BY session_id
         ) dd ON dd.session_id = s.id
         LEFT JOIN (
           SELECT session_id, COUNT(*) as link_count
           FROM public.discovered_links
           GROUP BY session_id
         ) dl ON dl.session_id = s.id
         WHERE s.tenant_id = $1
         ORDER BY s.created_at DESC`,
        [tenantId],
      );

      return c.json({ sessions: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar discovery sessions", {
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

// POST /api/v1/discovery/sessions — cria nova sessao de discovery
discoveryRoute.post(
  "/sessions",
  requirePermission("discovery:write"),
  rateLimitWrite,
  validate({ schema: discoverySessionSchema }),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;
    const body = c.get("validatedData") as {
      name: string;
      ip_ranges: string[];
      snmp_communities?: string[];
      snmp_ports?: number[];
      snmp_timeout_ms?: number;
      snmp_retries?: number;
      use_snmp?: boolean;
      use_lldp?: boolean;
      use_arp?: boolean;
    };

    const {
      name,
      ip_ranges,
      snmp_communities,
      snmp_ports,
      snmp_timeout_ms,
      snmp_retries,
      use_snmp,
      use_lldp,
      use_arp,
    } = body;

    try {
      const result = await query<{ id: string }>(
        `INSERT INTO public.discovery_sessions
         (tenant_id, name, ip_ranges, snmp_communities, snmp_ports, snmp_timeout_ms, snmp_retries,
          use_snmp, use_lldp, use_arp, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11)
         RETURNING id`,
        [
          tenantId,
          name,
          ip_ranges,
          snmp_communities ?? ["public"],
          snmp_ports ?? [161],
          snmp_timeout_ms ?? 3000,
          snmp_retries ?? 2,
          use_snmp ?? true,
          use_lldp ?? true,
          use_arp ?? true,
          userId,
        ],
      );

      const sessionId = result.data?.rows[0]?.id;

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "discovery.session.create",
            entityType: "discovery_sessions",
            entityId: sessionId,
            newData: { id: sessionId, name, ip_ranges },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Discovery session criada", {
        sessionId,
        name,
        tenantId,
      });

      return c.json({
        id: sessionId,
        created: true,
        status: "pending",
      });
    } catch (error) {
      logger.error("Erro ao criar discovery session", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar" } },
        500,
      );
    }
  },
);

// POST /api/v1/discovery/sessions/:id/run — inicia a execucao do discovery
discoveryRoute.post(
  "/sessions/:id/run",
  requirePermission("discovery:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const sessionId = c.req.param("id");

    try {
      // Verifica pertencimento
      const sessionResult = await query<{
        id: string;
        status: string;
        ip_ranges: string[];
        snmp_communities: string[];
        use_snmp: boolean;
        use_lldp: boolean;
      }>(
        "SELECT id, status, ip_ranges, snmp_communities, use_snmp, use_lldp FROM public.discovery_sessions WHERE id = $1 AND tenant_id = $2 LIMIT 1",
        [sessionId, tenantId],
      );

      const session = sessionResult.data?.rows[0];
      if (!session) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Sessão não encontrada" } },
          404,
        );
      }

      if (session.status === "running") {
        return c.json(
          {
            error: {
              code: "ALREADY_RUNNING",
              message: "Sessão já está em execução",
            },
          },
          409,
        );
      }

      // Marca como running
      await query(
        "UPDATE public.discovery_sessions SET status = 'running', started_at = timezone('utc'::text, now()), error_message = NULL WHERE id = $1",
        [sessionId],
      );

      // Simula discovery — em producao usaria net-snmp ou snmp-native
      const ipRanges = session.ip_ranges as string[];
      const communities = session.snmp_communities as string[];
      let devicesFound = 0;
      const linksFound = 0;

      try {
        for (const range of ipRanges) {
          const devices = await simulateDiscovery(
            range,
            communities,
            session.use_snmp ?? true,
            session.use_lldp ?? true,
          );

          for (const dev of devices) {
            await query(
              `INSERT INTO public.discovered_devices (tenant_id, session_id, ip_address, hostname, sys_descr, device_type, vendor, discovered_via)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (session_id, ip_address) DO UPDATE SET
                 hostname = EXCLUDED.hostname,
                 sys_descr = EXCLUDED.sys_descr,
                 device_type = EXCLUDED.device_type,
                 vendor = EXCLUDED.vendor`,
              [
                tenantId,
                sessionId,
                dev.ip,
                dev.hostname,
                dev.sys_descr,
                dev.device_type,
                dev.vendor,
                dev.discovered_via,
              ],
            );
            devicesFound++;
          }
        }

        // Atualiza sessao como completed
        await query(
          "UPDATE public.discovery_sessions SET status = 'completed', completed_at = timezone('utc'::text, now()), devices_found = $1, links_found = $2 WHERE id = $3",
          [devicesFound, linksFound, sessionId],
        );

        logger.info("Discovery session concluida", {
          sessionId,
          devicesFound,
          linksFound,
          tenantId,
        });

        return c.json({
          status: "completed",
          devices_found: devicesFound,
          links_found: linksFound,
        });
      } catch (err) {
        await query(
          "UPDATE public.discovery_sessions SET status = 'failed', completed_at = timezone('utc'::text, now()), error_message = $1 WHERE id = $2",
          [err instanceof Error ? err.message : "Erro desconhecido", sessionId],
        );

        logger.error("Erro durante discovery run", {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });

        return c.json(
          {
            status: "failed",
            error: err instanceof Error ? err.message : "Erro desconhecido",
          },
          500,
        );
      }
    } catch (error) {
      logger.error("Erro ao iniciar discovery run", {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "RUN_ERROR", message: "Erro ao executar" } },
        500,
      );
    }
  },
);

// DELETE /api/v1/discovery/sessions/:id — remove sessao
discoveryRoute.delete(
  "/sessions/:id",
  requirePermission("discovery:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;
    const sessionId = c.req.param("id");

    try {
      const result = await query(
        "DELETE FROM public.discovery_sessions WHERE id = $1 AND tenant_id = $2",
        [sessionId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Sessão não encontrada" } },
          404,
        );
      }

      if (userId) {
        try {
          await writeAuditLog({
            userId,
            tenantId,
            action: "discovery.session.delete",
            entityType: "discovery_sessions",
            entityId: sessionId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Discovery session removida", { sessionId, tenantId });

      return c.json({ deleted: true });
    } catch (error) {
      logger.error("Erro ao remover discovery session", {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "DELETE_ERROR", message: "Erro ao remover" } },
        500,
      );
    }
  },
);

// ========== Discovered Devices ==========

// GET /api/v1/discovery/sessions/:id/devices — lista dispositivos descobertos
discoveryRoute.get(
  "/sessions/:id/devices",
  requirePermission("discovery:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const sessionId = c.req.param("id");

    try {
      const result = await query(
        `SELECT * FROM public.discovered_devices WHERE session_id = $1 AND tenant_id = $2 ORDER BY ip_address`,
        [sessionId, tenantId],
      );

      return c.json({ devices: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar discovered devices", {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// POST /api/v1/discovery/devices/:id/import — importa dispositivo descoberto
discoveryRoute.post(
  "/devices/:id/import",
  requirePermission("discovery:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;
    const discoveredId = c.req.param("id");

    try {
      // Busca dispositivo descoberto
      const devResult = await query<{
        ip_address: string;
        hostname: string | null;
        device_type: string | null;
        vendor: string | null;
        model: string | null;
      }>(
        "SELECT ip_address, hostname, device_type, vendor, model FROM public.discovered_devices WHERE id = $1 AND tenant_id = $2 LIMIT 1",
        [discoveredId, tenantId],
      );

      const dev = devResult.data?.rows[0];
      if (!dev) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Dispositivo descoberto não encontrado",
            },
          },
          404,
        );
      }

      // Cria no cadastro de dispositivos
      const importResult = await query<{ id: string }>(
        `INSERT INTO public.devices (tenant_id, hostname, ip, device_type, vendor, model, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          tenantId,
          dev.hostname ?? `device-${dev.ip_address}`,
          dev.ip_address,
          dev.device_type ?? "unknown",
          dev.vendor,
          dev.model,
        ],
      );

      const newDeviceId = importResult.data?.rows[0]?.id;
      if (newDeviceId) {
        // Paraleliza: vincula + audit log
        await Promise.all([
          query(
            "UPDATE public.discovered_devices SET device_id = $1 WHERE id = $2",
            [newDeviceId, discoveredId],
          ),
          userId
            ? writeAuditLog({
                userId,
                tenantId,
                action: "discovery.device.import",
                entityType: "discovered_devices",
                entityId: discoveredId,
                newData: { device_id: newDeviceId, ip: dev.ip_address },
              }).catch(() => {})
            : Promise.resolve(),
        ]);

        logger.info("Discovered device importado", {
          discoveredId,
          newDeviceId,
          ip: dev.ip_address,
          tenantId,
        });

        return c.json({ device_id: newDeviceId, imported: true });
      }

      return c.json({
        imported: false,
        message: "Dispositivo já existe ou não foi criado",
      });
    } catch (error) {
      logger.error("Erro ao importar discovered device", {
        discoveredId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "IMPORT_ERROR", message: "Erro ao importar" } },
        500,
      );
    }
  },
);

// ========== Discovered Links ==========

// GET /api/v1/discovery/sessions/:id/links — lista links de topologia
discoveryRoute.get(
  "/sessions/:id/links",
  requirePermission("discovery:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const sessionId = c.req.param("id");

    try {
      const result = await query(
        `SELECT l.*,
         src.ip_address as source_ip, src.hostname as source_hostname,
         tgt.ip_address as target_ip, tgt.hostname as target_hostname
         FROM public.discovered_links l
         JOIN public.discovered_devices src ON l.source_device_id = src.id
         JOIN public.discovered_devices tgt ON l.target_device_id = tgt.id
         WHERE l.session_id = $1 AND l.tenant_id = $2
         ORDER BY src.ip_address`,
        [sessionId, tenantId],
      );

      return c.json({ links: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar discovered links", {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// ========== Topology View ==========

// GET /api/v1/discovery/sessions/:id/topology — visao de topologia
discoveryRoute.get(
  "/sessions/:id/topology",
  requirePermission("discovery:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const sessionId = c.req.param("id");

    try {
      // Paraleliza 2 queries independentes
      const [devicesResult, linksResult] = await Promise.all([
        query(
          "SELECT id, ip_address, hostname, device_type, vendor, model, discovered_via FROM public.discovered_devices WHERE session_id = $1 AND tenant_id = $2",
          [sessionId, tenantId],
        ),
        query(
          `SELECT l.id, l.source_device_id, l.target_device_id, l.source_interface, l.target_interface, l.discovered_via, l.link_speed, l.link_status
           FROM public.discovered_links l
           WHERE l.session_id = $1 AND l.tenant_id = $2`,
          [sessionId, tenantId],
        ),
      ]);

      const nodes = (devicesResult.data?.rows ?? []).map(
        (d: Record<string, unknown>) => ({
          id: d.id as string,
          label: (d.hostname as string) ?? (d.ip_address as string),
          ip: d.ip_address as string,
          type: d.device_type as string,
          vendor: d.vendor as string,
        }),
      );

      const edges = (linksResult.data?.rows ?? []).map(
        (l: Record<string, unknown>) => ({
          id: l.id as string,
          source: l.source_device_id as string,
          target: l.target_device_id as string,
          source_interface: l.source_interface as string,
          target_interface: l.target_interface as string,
          discovered_via: l.discovered_via as string,
          speed: l.link_speed as string,
        }),
      );

      return c.json({ nodes, edges });
    } catch (error) {
      logger.error("Erro ao buscar discovery topology", {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// ========== Simulated Discovery (MVP) ==========
// Em producao: usar net-snmp ou biblioteca SNMP nativa para walk real

async function simulateDiscovery(
  _ipRange: string,
  _communities: string[],
  _useSnmp: boolean,
  _useLldp: boolean,
): Promise<
  Array<{
    ip: string;
    hostname: string;
    sys_descr: string;
    device_type: string;
    vendor: string;
    discovered_via: string;
  }>
> {
  // MVP: retorna array vazio — em producao faria SNMP walk real
  return [];
}
