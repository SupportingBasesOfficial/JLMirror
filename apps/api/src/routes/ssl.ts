import { Hono } from "hono";
import { query } from "@repo/db";
import * as tls from "node:tls";
import {
  createSslCertificateSchema,
  updateSslCertificateSchema,
  type CreateSslCertificateInput,
  type UpdateSslCertificateInput,
} from "@repo/shared-validation";
import { jwtAuth } from "../middleware/jwt-auth.js";
import { tenantContext } from "../middleware/tenant-context.js";
import { requirePermission } from "../middleware/require-permission.js";
import "../types.js";

export const sslRoute = new Hono();

// Funcao que faz handshake TLS real para verificar validade do certificado
async function checkTlsCertificate(hostname: string, port: number): Promise<{
  valid: boolean;
  validTo: Date | null;
  daysUntilExpiry: number | null;
  issuer: string | null;
  subject: string | null;
  error: string | null;
}> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: hostname, port, rejectUnauthorized: false, servername: hostname },
      () => {
        const cert = socket.getPeerCertificate();
        if (!cert || Object.keys(cert).length === 0) {
          socket.destroy();
          resolve({ valid: false, validTo: null, daysUntilExpiry: null, issuer: null, subject: null, error: "Nenhum certificado retornado pelo servidor" });
          return;
        }
        const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
        const now = new Date();
        const daysUntilExpiry = validTo ? Math.floor((validTo.getTime() - now.getTime()) / 86400000) : null;
        const issuerO = cert.issuer?.O as string | string[] | undefined;
        const subjectCN = cert.subject?.CN as string | string[] | undefined;
        const issuerCN = cert.issuer?.CN as string | string[] | undefined;
        const issuerStr = typeof issuerO === "string" ? issuerO : (Array.isArray(issuerO) ? issuerO[0] : (typeof issuerCN === "string" ? issuerCN : (Array.isArray(issuerCN) ? issuerCN[0] : null)));
        const subjectStr = typeof subjectCN === "string" ? subjectCN : (Array.isArray(subjectCN) ? subjectCN[0] : null);
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
      resolve({ valid: false, validTo: null, daysUntilExpiry: null, issuer: null, subject: null, error: err.message });
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ valid: false, validTo: null, daysUntilExpiry: null, issuer: null, subject: null, error: "Timeout na conexao TLS" });
    });
  });
}

// GET /api/v1/ssl/certificates — lista certificados com status calculado
sslRoute.get("/certificates", jwtAuth, tenantContext, requirePermission("ssl:read"), async (c) => {
  const user = c.get("user");
  const status = c.req.query("status");

  let sql = "SELECT * FROM public.ssl_certificates_with_status WHERE tenant_id = $1";
  const params: unknown[] = [user?.tenant_id ?? null];

  if (status) {
    sql += " AND status = $2";
    params.push(status);
  }

  sql += " ORDER BY valid_to ASC";

  const result = await query(sql, params);

  if (result.error) {
    return c.json({ error: { code: "QUERY_ERROR", message: "Erro ao buscar certificados" } }, 500);
  }

  return c.json({ certificates: result.data?.rows ?? [] });
});

// GET /api/v1/ssl/certificates/:id — detalhe com histórico de verificações
sslRoute.get("/certificates/:id", jwtAuth, tenantContext, requirePermission("ssl:read"), async (c) => {
  const certId = c.req.param("id");
  const user = c.get("user");

  const certResult = await query(
    "SELECT * FROM public.ssl_certificates WHERE id = $1 AND tenant_id = $2",
    [certId, user?.tenant_id ?? null],
  );

  if (certResult.error || !certResult.data?.rows[0]) {
    return c.json({ error: { code: "NOT_FOUND", message: "Certificado não encontrado" } }, 404);
  }

  const checksResult = await query(
    "SELECT * FROM public.ssl_checks WHERE cert_id = $1 ORDER BY checked_at DESC LIMIT 20",
    [certId],
  );

  const alertsResult = await query(
    "SELECT * FROM public.ssl_alerts WHERE cert_id = $1 ORDER BY created_at DESC LIMIT 20",
    [certId],
  );

  return c.json({
    certificate: certResult.data.rows[0],
    checks: checksResult.data?.rows ?? [],
    alerts: alertsResult.data?.rows ?? [],
  });
});

// POST /api/v1/ssl/certificates — registra certificado para monitoramento
sslRoute.post("/certificates", jwtAuth, tenantContext, requirePermission("ssl:write"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<CreateSslCertificateInput>();
  const parsed = createSslCertificateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;
  const result = await query<{ id: string }>(
    `INSERT INTO public.ssl_certificates (tenant_id, hostname, port, protocol, alert_days_before, is_auto_renewed, ca_provider)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (tenant_id, hostname, port) DO UPDATE SET is_active = true, alert_days_before = $5, updated_at = timezone('utc'::text, now())
     RETURNING id`,
    [
      user?.tenant_id ?? null, data.hostname, data.port, data.protocol,
      data.alert_days_before, data.is_auto_renewed, data.ca_provider ?? null,
    ],
  );

  if (result.error || !result.data?.rows[0]) {
    return c.json({ error: { code: "CREATE_ERROR", message: "Erro ao registrar certificado" } }, 500);
  }

  await query(
    "SELECT public.write_audit_log($1, NULL, 'ssl.cert.register', 'ssl_certificate', $2, $3, NULL, NULL)",
    [user.sub, result.data.rows[0].id, JSON.stringify({ hostname: data.hostname, port: data.port })],
  );

  return c.json({ id: result.data.rows[0].id }, 201);
});

// PUT /api/v1/ssl/certificates/:id — atualiza config do certificado
sslRoute.put("/certificates/:id", jwtAuth, tenantContext, requirePermission("ssl:write"), async (c) => {
  const certId = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json<UpdateSslCertificateInput>();
  const parsed = updateSslCertificateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } }, 400);
  }

  const data = parsed.data;
  const updateFields: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  const fieldMap: Record<string, string> = {
    hostname: "hostname", port: "port", protocol: "protocol",
    alert_days_before: "alert_days_before", is_auto_renewed: "is_auto_renewed",
    ca_provider: "ca_provider", is_active: "is_active",
  };

  for (const [key, dbField] of Object.entries(fieldMap)) {
    if (data[key as keyof typeof data] !== undefined) {
      updateFields.push(`${dbField} = $${paramIdx++}`);
      params.push(data[key as keyof typeof data]);
    }
  }

  if (updateFields.length === 0) {
    return c.json({ id: certId });
  }

  params.push(certId, user?.tenant_id ?? null);

  await query(
    `UPDATE public.ssl_certificates SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
    params,
  );

  return c.json({ id: certId });
});

// DELETE /api/v1/ssl/certificates/:id — remove certificado
sslRoute.delete("/certificates/:id", jwtAuth, tenantContext, requirePermission("ssl:write"), async (c) => {
  const certId = c.req.param("id");
  const user = c.get("user");

  await query(
    "DELETE FROM public.ssl_certificates WHERE id = $1 AND tenant_id = $2",
    [certId, user?.tenant_id ?? null],
  );

  await query(
    "SELECT public.write_audit_log($1, NULL, 'ssl.cert.delete', 'ssl_certificate', $2, NULL, NULL, NULL)",
    [user.sub, certId],
  );

  return c.json({ deleted: true });
});

// POST /api/v1/ssl/check/:id — verifica certificado via TLS handshake real
sslRoute.post("/check/:id", jwtAuth, tenantContext, requirePermission("ssl:write"), async (c) => {
  const certId = c.req.param("id");
  const user = c.get("user");

  const certResult = await query<{
    id: string; hostname: string; port: number; alert_days_before: number;
    valid_to: string | null; tenant_id: string;
  }>(
    "SELECT * FROM public.ssl_certificates WHERE id = $1 AND tenant_id = $2",
    [certId, user?.tenant_id ?? null],
  );

  if (certResult.error || !certResult.data?.rows[0]) {
    return c.json({ error: { code: "NOT_FOUND", message: "Certificado não encontrado" } }, 404);
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
    [certId, user?.tenant_id ?? null, status, daysUntilExpiry, validTo?.toISOString() ?? null],
  );

  // Gera alerta se necessário
  await query("SELECT public.generate_ssl_alert($1)", [certId]);

  // Auditoria
  await query(
    "SELECT public.write_audit_log($1, NULL, 'ssl.cert.check', 'ssl_certificate', $2, $3, NULL, NULL)",
    [user.sub, certId, JSON.stringify({ status, days_until_expiry: daysUntilExpiry, issuer: tlsResult.issuer, subject: tlsResult.subject, error: tlsResult.error })],
  );

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
});

// POST /api/v1/ssl/check-all — verifica todos os certificados ativos
sslRoute.post("/check-all", jwtAuth, tenantContext, requirePermission("ssl:write"), async (c) => {
  const user = c.get("user");

  const certsResult = await query<{ id: string }>(
    "SELECT id FROM public.ssl_certificates WHERE tenant_id = $1 AND is_active = true",
    [user?.tenant_id ?? null],
  );

  const certIds = certsResult.data?.rows ?? [];
  const results: { cert_id: string; status: string }[] = [];

  for (const row of certIds) {
    const certDetail = await query<{
      valid_to: string | null; alert_days_before: number; hostname: string; port: number;
    }>(
      "SELECT valid_to, alert_days_before, hostname, port FROM public.ssl_certificates WHERE id = $1",
      [row.id],
    );

    const cert = certDetail.data?.rows[0];
    if (!cert) continue;

    // Verificacao TLS real
    const tlsResult = await checkTlsCertificate(cert.hostname, cert.port);
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

    // Atualiza valid_to no banco com dados reais
    if (validTo) {
      await query(
        "UPDATE public.ssl_certificates SET valid_to = $1, last_checked_at = timezone('utc'::text, now()) WHERE id = $2",
        [validTo.toISOString(), row.id],
      );
    } else {
      await query(
        "UPDATE public.ssl_certificates SET last_checked_at = timezone('utc'::text, now()) WHERE id = $1",
        [row.id],
      );
    }

    await query(
      `INSERT INTO public.ssl_checks (cert_id, tenant_id, status, days_until_expiry, valid_to)
       VALUES ($1, $2, $3, $4, $5)`,
      [row.id, user?.tenant_id ?? null, status, daysUntilExpiry, validTo?.toISOString() ?? null],
    );

    await query("SELECT public.generate_ssl_alert($1)", [row.id]);

    results.push({ cert_id: row.id, status });
  }

  await query(
    "SELECT public.write_audit_log($1, NULL, 'ssl.check_all', 'ssl_certificate', NULL, $2, NULL, NULL)",
    [user.sub, JSON.stringify({ total: results.length, expired: results.filter(r => r.status === "expired").length, expiring: results.filter(r => r.status === "expiring_soon").length })],
  );

  return c.json({
    total: results.length,
    results,
  });
});

// GET /api/v1/ssl/alerts — lista alertas não reconhecidos
sslRoute.get("/alerts", jwtAuth, tenantContext, requirePermission("ssl:read"), async (c) => {
  const user = c.get("user");
  const acknowledged = c.req.query("acknowledged") === "true";
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);

  const result = await query(
    `SELECT a.*, c.hostname, c.port, c.protocol
     FROM public.ssl_alerts a
     JOIN public.ssl_certificates c ON a.cert_id = c.id
     WHERE a.tenant_id = $1 AND a.acknowledged = $2
     ORDER BY a.created_at DESC
     LIMIT $3`,
    [user?.tenant_id ?? null, acknowledged, limit],
  );

  return c.json({
    alerts: result.data?.rows ?? [],
  });
});

// POST /api/v1/ssl/alerts/:id/acknowledge — reconhece alerta
sslRoute.post("/alerts/:id/acknowledge", jwtAuth, tenantContext, requirePermission("ssl:write"), async (c) => {
  const alertId = c.req.param("id");
  const user = c.get("user");

  await query(
    "UPDATE public.ssl_alerts SET acknowledged = true, acknowledged_by = $1, acknowledged_at = timezone('utc'::text, now()) WHERE id = $2 AND tenant_id = $3",
    [user.sub, alertId, user?.tenant_id ?? null],
  );

  return c.json({ acknowledged: true });
});

// GET /api/v1/ssl/stats — estatísticas para dashboard
sslRoute.get("/stats", jwtAuth, tenantContext, requirePermission("ssl:read"), async (c) => {
  const user = c.get("user");

  const statsResult = await query(
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE status = 'valid') as valid,
       COUNT(*) FILTER (WHERE status = 'expiring_soon') as expiring_soon,
       COUNT(*) FILTER (WHERE status = 'expired') as expired
     FROM public.ssl_certificates_with_status
     WHERE tenant_id = $1`,
    [user?.tenant_id ?? null],
  );

  const alertsResult = await query(
    "SELECT COUNT(*) as count FROM public.ssl_alerts WHERE tenant_id = $1 AND acknowledged = false",
    [user?.tenant_id ?? null],
  );

  const upcomingResult = await query(
    `SELECT hostname, port, valid_to, days_until_expiry
     FROM public.ssl_certificates_with_status
     WHERE tenant_id = $1 AND status IN ('expiring_soon', 'expired')
     ORDER BY valid_to ASC
     LIMIT 10`,
    [user?.tenant_id ?? null],
  );

  return c.json({
    stats: statsResult.data?.rows[0] ?? { total: "0", valid: "0", expiring_soon: "0", expired: "0" },
    unacknowledged_alerts: alertsResult.data?.rows[0]?.count ?? "0",
    upcoming: upcomingResult.data?.rows ?? [],
  });
});
