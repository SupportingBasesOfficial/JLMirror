// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import * as tls from "node:tls";
import * as net from "node:net";
import {
  createSslCertificateSchema,
  updateSslCertificateSchema,
  type CreateSslCertificateInput,
  type UpdateSslCertificateInput,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { safeJsonBody } from "../lib/safe-json.js";
import { writeAuditLog } from "../lib/audit.js";
import "../types.js";

export const sslRoute = new Hono();

// Valida hostname para prevenir SSRF — rejeita IPs internos
function isSafeHostname(hostname: string): boolean {
  // Rejeita IPs literais (IPv4 e IPv6) — apenas dominios permitidos
  if (net.isIP(hostname) !== 0) {
    return false;
  }
  // Rejeita hostnames suspeitos
  const lower = hostname.toLowerCase();
  const blocked = [
    "localhost",
    "metadata",
    "169.254.169.254", // AWS metadata
    "metadata.google.internal", // GCP metadata
    "169.254.170.2", // ECS metadata
  ];
  if (blocked.some((b) => lower.includes(b))) {
    return false;
  }
  // Rejeita subdominios de metadata
  if (lower.endsWith(".internal") && lower.includes("metadata")) {
    return false;
  }
  return true;
}

// GET /api/v1/ssl — overview do modulo
sslRoute.get("/", requirePermission("ssl:read"), httpCache(30), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  try {
    const certsResult = await query(
      "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'valid') as valid, COUNT(*) FILTER (WHERE status = 'expiring') as expiring, COUNT(*) FILTER (WHERE status = 'expired') as expired FROM public.ssl_certificates WHERE tenant_id = $1",
      [tenantId],
    );

    return c.json({
      overview: {
        certificates: certsResult.data?.rows[0] ?? {
          total: "0",
          valid: "0",
          expiring: "0",
          expired: "0",
        },
      },
      endpoints: ["/certificates", "/certificates/:id", "/alerts", "/stats"],
    });
  } catch (error) {
    logger.error("Erro no overview SSL", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
      500,
    );
  }
});

// Funcao que faz handshake TLS real para verificar validade do certificado
async function checkTlsCertificate(
  hostname: string,
  port: number,
): Promise<{
  valid: boolean;
  validTo: Date | null;
  daysUntilExpiry: number | null;
  issuer: string | null;
  subject: string | null;
  error: string | null;
}> {
  // Prevencao SSRF — rejeita hostnames perigosos
  if (!isSafeHostname(hostname)) {
    return {
      valid: false,
      validTo: null,
      daysUntilExpiry: null,
      issuer: null,
      subject: null,
      error: "Hostname bloqueado por politica de seguranca (SSRF)",
    };
  }

  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: hostname, port, rejectUnauthorized: false, servername: hostname },
      () => {
        const cert = socket.getPeerCertificate();
        if (!cert || Object.keys(cert).length === 0) {
          socket.destroy();
          resolve({
            valid: false,
            validTo: null,
            daysUntilExpiry: null,
            issuer: null,
            subject: null,
            error: "Nenhum certificado retornado pelo servidor",
          });
          return;
        }
        const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
        const now = new Date();
        const daysUntilExpiry = validTo
          ? Math.floor((validTo.getTime() - now.getTime()) / 86400000)
          : null;
        const issuerO = cert.issuer?.O as string | string[] | undefined;
        const subjectCN = cert.subject?.CN as string | string[] | undefined;
        const issuerCN = cert.issuer?.CN as string | string[] | undefined;
        const issuerStr =
          typeof issuerO === "string"
            ? issuerO
            : Array.isArray(issuerO)
              ? issuerO[0]
              : typeof issuerCN === "string"
                ? issuerCN
                : Array.isArray(issuerCN)
                  ? issuerCN[0]
                  : null;
        const subjectStr =
          typeof subjectCN === "string"
            ? subjectCN
            : Array.isArray(subjectCN)
              ? subjectCN[0]
              : null;
        socket.destroy();
        resolve({
          valid: daysUntilExpiry !== null && daysUntilExpiry > 0,
          validTo,
          daysUntilExpiry,
          issuer: issuerStr,
          subject: subjectStr,
          error: null,
        });
      },
    );
    socket.setTimeout(10000);
    socket.on("error", (err) => {
      resolve({
        valid: false,
        validTo: null,
        daysUntilExpiry: null,
        issuer: null,
        subject: null,
        error: err.message,
      });
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve({
        valid: false,
        validTo: null,
        daysUntilExpiry: null,
        issuer: null,
        subject: null,
        error: "Timeout na conexao TLS",
      });
    });
  });
}

// GET /api/v1/ssl/certificates — lista certificados com status calculado
sslRoute.get(
  "/certificates",
  requirePermission("ssl:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const status = c.req.query("status");

    let sql =
      "SELECT * FROM public.ssl_certificates_with_status WHERE tenant_id = $1";
    const params: unknown[] = [tenantId];

    if (status) {
      sql += " AND status = $2";
      params.push(status);
    }

    sql += " ORDER BY valid_to ASC";

    try {
      const result = await query(sql, params);

      if (result.error) {
        return c.json(
          {
            error: {
              code: "QUERY_ERROR",
              message: "Erro ao buscar certificados",
            },
          },
          500,
        );
      }

      return c.json({ certificates: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar certificados SSL", {
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

// GET /api/v1/ssl/certificates/:id — detalhe com histórico de verificações
sslRoute.get(
  "/certificates/:id",
  requirePermission("ssl:read"),
  httpCache(15),
  async (c) => {
    const certId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Paraleliza 3 queries (cert + checks + alerts)
      const [certResult, checksResult, alertsResult] = await Promise.all([
        query(
          "SELECT * FROM public.ssl_certificates WHERE id = $1 AND tenant_id = $2",
          [certId, tenantId],
        ),
        query(
          "SELECT * FROM public.ssl_checks WHERE cert_id = $1 ORDER BY checked_at DESC LIMIT 20",
          [certId],
        ),
        query(
          "SELECT * FROM public.ssl_alerts WHERE cert_id = $1 ORDER BY created_at DESC LIMIT 20",
          [certId],
        ),
      ]);

      if (certResult.error || !certResult.data?.rows[0]) {
        return c.json(
          {
            error: { code: "NOT_FOUND", message: "Certificado não encontrado" },
          },
          404,
        );
      }

      return c.json({
        certificate: certResult.data.rows[0],
        checks: checksResult.data?.rows ?? [],
        alerts: alertsResult.data?.rows ?? [],
      });
    } catch (error) {
      logger.error("Erro ao buscar certificado SSL", {
        certId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// POST /api/v1/ssl/certificates — registra certificado para monitoramento
sslRoute.post(
  "/certificates",
  rateLimitWrite,
  requirePermission("ssl:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = createSslCertificateSchema.safeParse(parsedBody.data);
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

    const data = parsed.data as CreateSslCertificateInput;

    // Prevencao SSRF — valida hostname antes de registrar
    if (!isSafeHostname(data.hostname)) {
      return c.json(
        {
          error: {
            code: "INVALID_HOSTNAME",
            message: "Hostname bloqueado por politica de seguranca",
          },
        },
        400,
      );
    }

    try {
      const result = await query<{ id: string }>(
        `INSERT INTO public.ssl_certificates (tenant_id, hostname, port, protocol, alert_days_before, is_auto_renewed, ca_provider)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (tenant_id, hostname, port) DO UPDATE SET is_active = true, alert_days_before = $5, updated_at = timezone('utc'::text, now())
         RETURNING id`,
        [
          tenantId,
          data.hostname,
          data.port,
          data.protocol ?? null,
          data.alert_days_before,
          data.is_auto_renewed,
          data.ca_provider ?? null,
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          {
            error: {
              code: "CREATE_ERROR",
              message: "Erro ao registrar certificado",
            },
          },
          500,
        );
      }

      const certId = result.data.rows[0].id;

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "ssl.cert.register",
            entityType: "ssl_certificate",
            entityId: certId,
            newData: { hostname: data.hostname, port: data.port },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Certificado SSL registrado", {
        certId,
        hostname: data.hostname,
      });

      return c.json({ id: certId }, 201);
    } catch (error) {
      logger.error("Erro ao registrar certificado SSL", {
        hostname: data.hostname,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: {
            code: "CREATE_ERROR",
            message: "Erro ao registrar certificado",
          },
        },
        500,
      );
    }
  },
);

// PUT /api/v1/ssl/certificates/:id — atualiza config do certificado
sslRoute.put(
  "/certificates/:id",
  rateLimitWrite,
  requirePermission("ssl:write"),
  async (c) => {
    const certId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = updateSslCertificateSchema.safeParse(parsedBody.data);
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

    const data = parsed.data as UpdateSslCertificateInput;

    // Prevencao SSRF — valida hostname se fornecido
    if (data.hostname && !isSafeHostname(data.hostname)) {
      return c.json(
        {
          error: {
            code: "INVALID_HOSTNAME",
            message: "Hostname bloqueado por politica de seguranca",
          },
        },
        400,
      );
    }

    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    const fieldMap: Record<string, string> = {
      hostname: "hostname",
      port: "port",
      protocol: "protocol",
      alert_days_before: "alert_days_before",
      is_auto_renewed: "is_auto_renewed",
      ca_provider: "ca_provider",
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

    try {
      params.push(certId, tenantId);
      const result = await query(
        `UPDATE public.ssl_certificates SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
        params,
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          {
            error: { code: "NOT_FOUND", message: "Certificado não encontrado" },
          },
          404,
        );
      }

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "ssl.cert.update",
            entityType: "ssl_certificate",
            entityId: certId,
            newData: data,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Certificado SSL atualizado", { certId, tenantId });

      return c.json({ id: certId });
    } catch (error) {
      logger.error("Erro ao atualizar certificado SSL", {
        certId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: {
            code: "UPDATE_ERROR",
            message: "Erro ao atualizar certificado",
          },
        },
        500,
      );
    }
  },
);

// DELETE /api/v1/ssl/certificates/:id — remove certificado
sslRoute.delete(
  "/certificates/:id",
  rateLimitWrite,
  requirePermission("ssl:write"),
  async (c) => {
    const certId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        "DELETE FROM public.ssl_certificates WHERE id = $1 AND tenant_id = $2",
        [certId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          {
            error: { code: "NOT_FOUND", message: "Certificado não encontrado" },
          },
          404,
        );
      }

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "ssl.cert.delete",
            entityType: "ssl_certificate",
            entityId: certId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Certificado SSL removido", { certId, tenantId });

      return c.json({ deleted: true });
    } catch (error) {
      logger.error("Erro ao remover certificado SSL", {
        certId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: {
            code: "DELETE_ERROR",
            message: "Erro ao remover certificado",
          },
        },
        500,
      );
    }
  },
);

// POST /api/v1/ssl/check/:id — verifica certificado via TLS handshake real
sslRoute.post(
  "/check/:id",
  rateLimitWrite,
  requirePermission("ssl:write"),
  async (c) => {
    const certId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const certResult = await query<{
        id: string;
        hostname: string;
        port: number;
        alert_days_before: number;
        valid_to: string | null;
        tenant_id: string;
      }>(
        "SELECT id, hostname, port, alert_days_before, valid_to, tenant_id FROM public.ssl_certificates WHERE id = $1 AND tenant_id = $2",
        [certId, tenantId],
      );

      if (certResult.error || !certResult.data?.rows[0]) {
        return c.json(
          {
            error: { code: "NOT_FOUND", message: "Certificado não encontrado" },
          },
          404,
        );
      }

      const cert = certResult.data.rows[0];

      // Verificacao TLS real via node:tls handshake
      const tlsResult = await checkTlsCertificate(cert.hostname, cert.port);

      let status: string;
      const daysUntilExpiry = tlsResult.daysUntilExpiry;
      const validTo = tlsResult.validTo;

      if (tlsResult.error) {
        status = "error";
      } else if (daysUntilExpiry === null) {
        status = "error";
      } else if (daysUntilExpiry < 0) {
        status = "expired";
      } else if (daysUntilExpiry <= cert.alert_days_before) {
        status = "expiring_soon";
      } else {
        status = "valid";
      }

      // Atualiza valid_to no banco com dados reais do certificado
      if (validTo) {
        await query(
          "UPDATE public.ssl_certificates SET valid_to = $1, last_checked_at = timezone('utc'::text, now()) WHERE id = $2",
          [validTo.toISOString(), certId],
        );
      } else {
        await query(
          "UPDATE public.ssl_certificates SET last_checked_at = timezone('utc'::text, now()) WHERE id = $1",
          [certId],
        );
      }

      // Registra verificação
      await query(
        `INSERT INTO public.ssl_checks (cert_id, tenant_id, status, days_until_expiry, valid_to)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          certId,
          tenantId,
          status,
          daysUntilExpiry,
          validTo?.toISOString() ?? null,
        ],
      );

      // Gera alerta se necessário
      await query("SELECT public.generate_ssl_alert($1)", [certId]);

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "ssl.cert.check",
            entityType: "ssl_certificate",
            entityId: certId,
            newData: {
              status,
              days_until_expiry: daysUntilExpiry,
              issuer: tlsResult.issuer,
              subject: tlsResult.subject,
              error: tlsResult.error,
            },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Check SSL executado", {
        certId,
        hostname: cert.hostname,
        status,
      });

      return c.json({
        cert_id: certId,
        hostname: cert.hostname,
        port: cert.port,
        status,
        days_until_expiry: daysUntilExpiry,
        valid_to: validTo?.toISOString() ?? null,
        issuer: tlsResult.issuer,
        subject: tlsResult.subject,
        error: tlsResult.error,
        checked_at: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Erro ao verificar certificado SSL", {
        certId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: {
            code: "CHECK_ERROR",
            message: "Erro ao verificar certificado",
          },
        },
        500,
      );
    }
  },
);

// POST /api/v1/ssl/check-all — verifica todos os certificados ativos
sslRoute.post(
  "/check-all",
  rateLimitWrite,
  requirePermission("ssl:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const certsResult = await query<{
        id: string;
        hostname: string;
        port: number;
        alert_days_before: number;
      }>(
        "SELECT id, hostname, port, alert_days_before FROM public.ssl_certificates WHERE tenant_id = $1 AND is_active = true",
        [tenantId],
      );

      const certs = certsResult.data?.rows ?? [];
      const results: { cert_id: string; status: string }[] = [];

      // Processa certificados em paralelo (limite de 5 simultaneos para nao saturar)
      const batchSize = 5;
      for (let i = 0; i < certs.length; i += batchSize) {
        const batch = certs.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(async (cert) => {
            const tlsResult = await checkTlsCertificate(
              cert.hostname,
              cert.port,
            );
            const daysUntilExpiry = tlsResult.daysUntilExpiry;
            const validTo = tlsResult.validTo;

            let status: string;
            if (tlsResult.error) {
              status = "error";
            } else if (daysUntilExpiry === null) {
              status = "error";
            } else if (daysUntilExpiry < 0) {
              status = "expired";
            } else if (daysUntilExpiry <= cert.alert_days_before) {
              status = "expiring_soon";
            } else {
              status = "valid";
            }

            // Atualiza valid_to no banco
            if (validTo) {
              await query(
                "UPDATE public.ssl_certificates SET valid_to = $1, last_checked_at = timezone('utc'::text, now()) WHERE id = $2",
                [validTo.toISOString(), cert.id],
              );
            } else {
              await query(
                "UPDATE public.ssl_certificates SET last_checked_at = timezone('utc'::text, now()) WHERE id = $1",
                [cert.id],
              );
            }

            await query(
              `INSERT INTO public.ssl_checks (cert_id, tenant_id, status, days_until_expiry, valid_to)
               VALUES ($1, $2, $3, $4, $5)`,
              [
                cert.id,
                tenantId,
                status,
                daysUntilExpiry,
                validTo?.toISOString() ?? null,
              ],
            );

            await query("SELECT public.generate_ssl_alert($1)", [cert.id]);

            return { cert_id: cert.id, status };
          }),
        );
        results.push(...batchResults);
      }

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "ssl.check_all",
            entityType: "ssl_certificate",
            newData: {
              total: results.length,
              expired: results.filter((r) => r.status === "expired").length,
              expiring: results.filter((r) => r.status === "expiring_soon")
                .length,
            },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Check-all SSL executado", {
        tenantId,
        total: results.length,
      });

      return c.json({
        total: results.length,
        results,
      });
    } catch (error) {
      logger.error("Erro ao verificar todos certificados SSL", {
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: {
            code: "CHECK_ERROR",
            message: "Erro ao verificar certificados",
          },
        },
        500,
      );
    }
  },
);

// GET /api/v1/ssl/alerts — lista alertas não reconhecidos
sslRoute.get(
  "/alerts",
  requirePermission("ssl:read"),
  httpCache(15),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const acknowledged = c.req.query("acknowledged") === "true";
    const limit = Math.min(
      Number.parseInt(c.req.query("limit") ?? "50", 10) || 50,
      200,
    );

    try {
      const result = await query(
        `SELECT a.*, c.hostname, c.port, c.protocol
         FROM public.ssl_alerts a
         JOIN public.ssl_certificates c ON a.cert_id = c.id
         WHERE a.tenant_id = $1 AND a.acknowledged = $2
         ORDER BY a.created_at DESC
         LIMIT $3`,
        [tenantId, acknowledged, limit],
      );

      return c.json({
        alerts: result.data?.rows ?? [],
      });
    } catch (error) {
      logger.error("Erro ao listar alertas SSL", {
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

// POST /api/v1/ssl/alerts/:id/acknowledge — reconhece alerta
sslRoute.post(
  "/alerts/:id/acknowledge",
  rateLimitWrite,
  requirePermission("ssl:write"),
  async (c) => {
    const alertId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        "UPDATE public.ssl_alerts SET acknowledged = true, acknowledged_by = $1, acknowledged_at = timezone('utc'::text, now()) WHERE id = $2 AND tenant_id = $3",
        [user?.sub ?? null, alertId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Alerta não encontrado" } },
          404,
        );
      }

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "ssl.alert.acknowledge",
            entityType: "ssl_alert",
            entityId: alertId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Alerta SSL reconhecido", { alertId, tenantId });

      return c.json({ acknowledged: true });
    } catch (error) {
      logger.error("Erro ao reconhecer alerta SSL", {
        alertId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "UPDATE_ERROR", message: "Erro ao reconhecer alerta" },
        },
        500,
      );
    }
  },
);

// GET /api/v1/ssl/stats — estatísticas para dashboard
sslRoute.get(
  "/stats",
  requirePermission("ssl:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Paraleliza 3 queries (antes seriais)
      const [statsResult, alertsResult, upcomingResult] = await Promise.all([
        query(
          `SELECT
             COUNT(*) as total,
             COUNT(*) FILTER (WHERE status = 'valid') as valid,
             COUNT(*) FILTER (WHERE status = 'expiring_soon') as expiring_soon,
             COUNT(*) FILTER (WHERE status = 'expired') as expired
           FROM public.ssl_certificates_with_status
           WHERE tenant_id = $1`,
          [tenantId],
        ),
        query<{ count: string }>(
          "SELECT COUNT(*) as count FROM public.ssl_alerts WHERE tenant_id = $1 AND acknowledged = false",
          [tenantId],
        ),
        query(
          `SELECT hostname, port, valid_to, days_until_expiry
           FROM public.ssl_certificates_with_status
           WHERE tenant_id = $1 AND status IN ('expiring_soon', 'expired')
           ORDER BY valid_to ASC
           LIMIT 10`,
          [tenantId],
        ),
      ]);

      return c.json({
        stats: statsResult.data?.rows[0] ?? {
          total: "0",
          valid: "0",
          expiring_soon: "0",
          expired: "0",
        },
        unacknowledged_alerts: alertsResult.data?.rows[0]?.count ?? "0",
        upcoming: upcomingResult.data?.rows ?? [],
      });
    } catch (error) {
      logger.error("Erro ao buscar stats SSL", {
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
