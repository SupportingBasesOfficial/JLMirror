// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { requirePermission } from "../middleware/require-permission.js";
import "../types.js";

export const lgpdRoute = new Hono();

// GET /api/v1/lgpd/requests — lista solicitações LGPD
lgpdRoute.get(
  "/requests",
  requirePermission("admin:tenants:read"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const status = c.req.query("status");

    const conditions: string[] = ["tenant_id = $1"];
    const params: unknown[] = [tenantId];
    let paramIdx = 2;

    if (status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(status);
    }

    const result = await query(
      `SELECT lr.*, u.email as user_email, u.full_name as user_name,
       ru.email as requester_email
     FROM public.lgpd_requests lr
     JOIN public.users u ON lr.user_id = u.id
     JOIN public.users ru ON lr.requested_by = ru.id
     WHERE ${conditions.join(" AND ")}
     ORDER BY lr.created_at DESC`,
      params,
    );

    return c.json({ requests: result.data?.rows ?? [] });
  },
);

// POST /api/v1/lgpd/requests/export — exporta todos os dados pessoais de um usuário
lgpdRoute.post(
  "/requests/export",
  requirePermission("admin:tenants:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const body = await c.req.json<{ user_id: string; reason?: string }>();

    if (!body.user_id) {
      return c.json(
        {
          error: { code: "VALIDATION_ERROR", message: "user_id é obrigatório" },
        },
        400,
      );
    }

    // Cria registro da solicitação
    const reqResult = await query<{ id: string }>(
      `INSERT INTO public.lgpd_requests (user_id, tenant_id, request_type, status, requested_by, reason, processed_at)
     VALUES ($1, $2, 'export', 'processing', $3, $4, timezone('utc'::text, now()))
     RETURNING id`,
      [body.user_id, tenantId, user.sub, body.reason ?? null],
    );

    const requestId = reqResult.data?.rows[0]?.id;
    if (!requestId) {
      return c.json(
        {
          error: { code: "CREATE_ERROR", message: "Erro ao criar solicitação" },
        },
        500,
      );
    }

    try {
      // Coleta dados pessoais de todas as tabelas relevantes
      const personalData: Record<string, unknown> = {};

      // Dados do usuário
      const userResult = await query(
        "SELECT id, email, full_name, phone, is_active, must_change_password, last_login_at, created_at, updated_at FROM public.users WHERE id = $1",
        [body.user_id],
      );
      personalData.user = userResult.data?.rows[0] ?? null;

      // Sessões
      const sessionsResult = await query(
        "SELECT id, device_fingerprint, ip_address, user_agent, device_label, created_at, expires_at FROM public.sessions WHERE user_id = $1",
        [body.user_id],
      );
      personalData.sessions = sessionsResult.data?.rows ?? [];

      // Dispositivos confiáveis
      const devicesResult = await query(
        "SELECT id, device_fingerprint, device_label, ip_address, user_agent, trusted_at, last_seen_at FROM public.trusted_devices WHERE user_id = $1",
        [body.user_id],
      );
      personalData.trusted_devices = devicesResult.data?.rows ?? [];

      // Associações de tenant
      const tenantUsersResult = await query(
        "SELECT tenant_id, role, created_at FROM public.tenant_users WHERE user_id = $1",
        [body.user_id],
      );
      personalData.tenant_associations = tenantUsersResult.data?.rows ?? [];

      // Perfil
      const profileResult = await query(
        "SELECT * FROM public.user_profiles WHERE user_id = $1",
        [body.user_id],
      );
      personalData.profiles = profileResult.data?.rows ?? [];

      // Logs de auditoria
      const auditResult = await query(
        "SELECT action, entity_type, entity_id, old_value, new_value, created_at FROM public.system_logs WHERE actor_id = $1 ORDER BY created_at DESC LIMIT 1000",
        [body.user_id],
      );
      personalData.audit_logs = auditResult.data?.rows ?? [];

      // Logs de segurança
      const securityResult = await query(
        "SELECT event_type, metadata, created_at FROM public.user_security_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500",
        [body.user_id],
      );
      personalData.security_logs = securityResult.data?.rows ?? [];

      // Contatos de cliente (se for usuário de tenant)
      const contactsResult = await query(
        "SELECT * FROM public.client_contacts WHERE tenant_id = $1 ORDER BY created_at DESC",
        [tenantId],
      );
      personalData.client_contacts = contactsResult.data?.rows ?? [];

      // Dados comerciais
      const companyResult = await query(
        "SELECT * FROM public.client_companies WHERE tenant_id = $1",
        [tenantId],
      );
      personalData.client_company = companyResult.data?.rows[0] ?? null;

      // Atualiza solicitação com dados exportados
      await query(
        `UPDATE public.lgpd_requests SET status = 'completed', export_data = $1, completed_at = timezone('utc'::text, now()) WHERE id = $2`,
        [JSON.stringify(personalData), requestId],
      );

      await query(
        "SELECT public.write_audit_log($1, NULL, 'lgpd.export', 'lgpd_requests', NULL, $2, NULL, NULL)",
        [
          user.sub,
          JSON.stringify({ request_id: requestId, user_id: body.user_id }),
        ],
      );

      return c.json({
        request_id: requestId,
        status: "completed",
        data: personalData,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
      await query(
        "UPDATE public.lgpd_requests SET status = 'failed', error_message = $1, completed_at = timezone('utc'::text, now()) WHERE id = $2",
        [errorMsg, requestId],
      );
      return c.json(
        { error: { code: "EXPORT_ERROR", message: errorMsg } },
        500,
      );
    }
  },
);

// POST /api/v1/lgpd/requests/delete — anonimiza/deleta dados pessoais de um usuário
lgpdRoute.post(
  "/requests/delete",
  requirePermission("admin:tenants:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const body = await c.req.json<{
      user_id: string;
      reason?: string;
      mode?: "anonymize" | "delete";
    }>();

    if (!body.user_id) {
      return c.json(
        {
          error: { code: "VALIDATION_ERROR", message: "user_id é obrigatório" },
        },
        400,
      );
    }

    if (body.user_id === user.sub) {
      return c.json(
        {
          error: {
            code: "SELF_DELETE_FORBIDDEN",
            message: "Não é possível deletar seus próprios dados por esta rota",
          },
        },
        403,
      );
    }

    const mode = body.mode ?? "anonymize";

    // Cria registro da solicitação
    const reqResult = await query<{ id: string }>(
      `INSERT INTO public.lgpd_requests (user_id, tenant_id, request_type, status, requested_by, reason, processed_at)
     VALUES ($1, $2, 'delete', 'processing', $3, $4, timezone('utc'::text, now()))
     RETURNING id`,
      [body.user_id, tenantId, user.sub, body.reason ?? null],
    );

    const requestId = reqResult.data?.rows[0]?.id;
    if (!requestId) {
      return c.json(
        {
          error: { code: "CREATE_ERROR", message: "Erro ao criar solicitação" },
        },
        500,
      );
    }

    try {
      if (mode === "delete") {
        // Deleta completamente todos os dados do usuário
        await query("DELETE FROM public.sessions WHERE user_id = $1", [
          body.user_id,
        ]);
        await query("DELETE FROM public.trusted_devices WHERE user_id = $1", [
          body.user_id,
        ]);
        await query("DELETE FROM public.user_profiles WHERE user_id = $1", [
          body.user_id,
        ]);
        await query("DELETE FROM public.user_security_log WHERE user_id = $1", [
          body.user_id,
        ]);
        await query("DELETE FROM public.tenant_users WHERE user_id = $1", [
          body.user_id,
        ]);
        await query("DELETE FROM public.users WHERE id = $1", [body.user_id]);
      } else {
        // Anonimiza: mantém registros mas remove dados pessoais identificáveis
        await query(
          `UPDATE public.users SET
           email = 'anonymized_' || $1 || '@deleted.local',
           full_name = 'Usuário Anonimizado',
           phone = NULL,
           password_hash = 'REVOKED',
           is_active = false,
           must_change_password = false,
           updated_at = timezone('utc'::text, now())
         WHERE id = $1`,
          [body.user_id],
        );

        await query("DELETE FROM public.sessions WHERE user_id = $1", [
          body.user_id,
        ]);
        await query("DELETE FROM public.trusted_devices WHERE user_id = $1", [
          body.user_id,
        ]);

        await query(
          "UPDATE public.user_profiles SET display_name = 'Anonimizado', avatar_initials = 'XX', bio = NULL, phone = NULL, location = NULL, social_links = '[]' WHERE user_id = $1",
          [body.user_id],
        );
      }

      await query(
        "UPDATE public.lgpd_requests SET status = 'completed', completed_at = timezone('utc'::text, now()) WHERE id = $1",
        [requestId],
      );

      await query(
        "SELECT public.write_audit_log($1, NULL, 'lgpd.delete', 'lgpd_requests', NULL, $2, NULL, NULL)",
        [
          user.sub,
          JSON.stringify({
            request_id: requestId,
            user_id: body.user_id,
            mode,
          }),
        ],
      );

      return c.json({
        request_id: requestId,
        status: "completed",
        mode,
        message:
          mode === "delete"
            ? "Dados pessoais deletados permanentemente"
            : "Dados pessoais anonimizados",
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
      await query(
        "UPDATE public.lgpd_requests SET status = 'failed', error_message = $1, completed_at = timezone('utc'::text, now()) WHERE id = $2",
        [errorMsg, requestId],
      );
      return c.json(
        { error: { code: "DELETE_ERROR", message: errorMsg } },
        500,
      );
    }
  },
);

// GET /api/v1/lgpd/requests/:id — detalhes de uma solicitação
lgpdRoute.get(
  "/requests/:id",
  requirePermission("admin:tenants:read"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const requestId = c.req.param("id");

    const result = await query(
      `SELECT lr.*, u.email as user_email, u.full_name as user_name,
       ru.email as requester_email
     FROM public.lgpd_requests lr
     JOIN public.users u ON lr.user_id = u.id
     JOIN public.users ru ON lr.requested_by = ru.id
     WHERE lr.id = $1 AND lr.tenant_id = $2`,
      [requestId, tenantId],
    );

    if (!result.data?.rows[0]) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Solicitação não encontrada" } },
        404,
      );
    }

    return c.json({ request: result.data.rows[0] });
  },
);
