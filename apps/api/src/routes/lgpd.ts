// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import {
  lgpdExportSchema,
  lgpdDeleteSchema,
  type LgpdExportInput,
  type LgpdDeleteInput,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { safeJsonBody } from "../lib/safe-json.js";
import { writeAuditLog } from "../lib/audit.js";
import "../types.js";

export const lgpdRoute = new Hono();

// GET /api/v1/lgpd — overview do modulo
lgpdRoute.get(
  "/",
  requirePermission("admin:tenants:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const requestsResult = await query(
        "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'pending') as pending FROM public.lgpd_requests WHERE tenant_id = $1",
        [tenantId],
      );

      return c.json({
        overview: {
          requests: requestsResult.data?.rows[0] ?? {
            total: "0",
            pending: "0",
          },
        },
        endpoints: [
          "/requests",
          "/requests/export",
          "/requests/delete",
          "/requests/:id",
        ],
      });
    } catch (error) {
      logger.error("Erro ao buscar LGPD overview", {
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

// GET /api/v1/lgpd/requests — lista solicitações LGPD
lgpdRoute.get(
  "/requests",
  requirePermission("admin:tenants:read"),
  httpCache(30),
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

    try {
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
    } catch (error) {
      logger.error("Erro ao listar LGPD requests", {
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

// POST /api/v1/lgpd/requests/export — exporta todos os dados pessoais de um usuário
lgpdRoute.post(
  "/requests/export",
  requirePermission("admin:tenants:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = lgpdExportSchema.safeParse(parsedBody.data);
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

    const data = parsed.data as LgpdExportInput;

    try {
      // Cria registro da solicitação
      const reqResult = await query<{ id: string }>(
        `INSERT INTO public.lgpd_requests (user_id, tenant_id, request_type, status, requested_by, reason, processed_at)
         VALUES ($1, $2, 'export', 'processing', $3, $4, timezone('utc'::text, now()))
         RETURNING id`,
        [data.user_id, tenantId, userId, data.reason ?? null],
      );

      const requestId = reqResult.data?.rows[0]?.id;
      if (!requestId) {
        return c.json(
          {
            error: {
              code: "CREATE_ERROR",
              message: "Erro ao criar solicitação",
            },
          },
          500,
        );
      }

      try {
        // Coleta dados pessoais de todas as tabelas relevantes em paralelo
        const personalData: Record<string, unknown> = {};

        const [
          userResult,
          sessionsResult,
          devicesResult,
          tenantUsersResult,
          profileResult,
          auditResult,
          securityResult,
          contactsResult,
          companyResult,
        ] = await Promise.all([
          query(
            "SELECT id, email, full_name, phone, is_active, must_change_password, last_login_at, created_at, updated_at FROM public.users WHERE id = $1",
            [data.user_id],
          ),
          query(
            "SELECT id, device_fingerprint, ip_address, user_agent, device_label, created_at, expires_at FROM public.sessions WHERE user_id = $1",
            [data.user_id],
          ),
          query(
            "SELECT id, device_fingerprint, device_label, ip_address, user_agent, trusted_at, last_seen_at FROM public.trusted_devices WHERE user_id = $1",
            [data.user_id],
          ),
          query(
            "SELECT tenant_id, role, created_at FROM public.tenant_users WHERE user_id = $1",
            [data.user_id],
          ),
          query("SELECT * FROM public.user_profiles WHERE user_id = $1", [
            data.user_id,
          ]),
          query(
            "SELECT action, entity_type, entity_id, old_value, new_value, created_at FROM public.system_logs WHERE actor_id = $1 ORDER BY created_at DESC LIMIT 1000",
            [data.user_id],
          ),
          query(
            "SELECT event_type, metadata, created_at FROM public.user_security_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500",
            [data.user_id],
          ),
          query(
            "SELECT * FROM public.client_contacts WHERE tenant_id = $1 ORDER BY created_at DESC",
            [tenantId],
          ),
          query("SELECT * FROM public.client_companies WHERE tenant_id = $1", [
            tenantId,
          ]),
        ]);

        personalData.user = userResult.data?.rows[0] ?? null;
        personalData.sessions = sessionsResult.data?.rows ?? [];
        personalData.trusted_devices = devicesResult.data?.rows ?? [];
        personalData.tenant_associations = tenantUsersResult.data?.rows ?? [];
        personalData.profiles = profileResult.data?.rows ?? [];
        personalData.audit_logs = auditResult.data?.rows ?? [];
        personalData.security_logs = securityResult.data?.rows ?? [];
        personalData.client_contacts = contactsResult.data?.rows ?? [];
        personalData.client_company = companyResult.data?.rows[0] ?? null;

        // Atualiza solicitação com dados exportados
        await query(
          `UPDATE public.lgpd_requests SET status = 'completed', export_data = $1, completed_at = timezone('utc'::text, now()) WHERE id = $2`,
          [JSON.stringify(personalData), requestId],
        );

        if (userId) {
          try {
            await writeAuditLog({
              userId,
              tenantId,
              action: "lgpd.export",
              entityType: "lgpd_requests",
              entityId: requestId,
              newData: { request_id: requestId, user_id: data.user_id },
            });
          } catch {
            // Audit log falhou — nao bloqueia
          }
        }

        logger.info("LGPD export concluído", {
          requestId,
          userId: data.user_id,
          tenantId,
        });

        return c.json({
          request_id: requestId,
          status: "completed",
          data: personalData,
        });
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Erro desconhecido";
        await query(
          "UPDATE public.lgpd_requests SET status = 'failed', error_message = $1, completed_at = timezone('utc'::text, now()) WHERE id = $2",
          [errorMsg, requestId],
        );
        logger.error("Erro no LGPD export", {
          requestId,
          error: errorMsg,
        });
        return c.json(
          { error: { code: "EXPORT_ERROR", message: errorMsg } },
          500,
        );
      }
    } catch (error) {
      logger.error("Erro ao criar LGPD export request", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "CREATE_ERROR", message: "Erro ao criar solicitação" },
        },
        500,
      );
    }
  },
);

// POST /api/v1/lgpd/requests/delete — anonimiza/deleta dados pessoais de um usuário
lgpdRoute.post(
  "/requests/delete",
  requirePermission("admin:tenants:write"),
  rateLimitWrite,
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const userId = user?.sub ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = lgpdDeleteSchema.safeParse(parsedBody.data);
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

    const data = parsed.data as LgpdDeleteInput;

    // Protecao: nao permite auto-delete
    if (data.user_id === userId) {
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

    try {
      // Cria registro da solicitação
      const reqResult = await query<{ id: string }>(
        `INSERT INTO public.lgpd_requests (user_id, tenant_id, request_type, status, requested_by, reason, processed_at)
         VALUES ($1, $2, 'delete', 'processing', $3, $4, timezone('utc'::text, now()))
         RETURNING id`,
        [data.user_id, tenantId, userId, data.reason ?? null],
      );

      const requestId = reqResult.data?.rows[0]?.id;
      if (!requestId) {
        return c.json(
          {
            error: {
              code: "CREATE_ERROR",
              message: "Erro ao criar solicitação",
            },
          },
          500,
        );
      }

      try {
        if (data.mode === "delete") {
          // Deleta completamente todos os dados do usuário em paralelo
          await Promise.all([
            query("DELETE FROM public.sessions WHERE user_id = $1", [
              data.user_id,
            ]),
            query("DELETE FROM public.trusted_devices WHERE user_id = $1", [
              data.user_id,
            ]),
            query("DELETE FROM public.user_profiles WHERE user_id = $1", [
              data.user_id,
            ]),
            query("DELETE FROM public.user_security_log WHERE user_id = $1", [
              data.user_id,
            ]),
            query("DELETE FROM public.tenant_users WHERE user_id = $1", [
              data.user_id,
            ]),
          ]);
          // Deleta usuario por ultimo (FK constraints)
          await query("DELETE FROM public.users WHERE id = $1", [data.user_id]);
        } else {
          // Anonimiza: mantém registros mas remove dados pessoais identificáveis
          await Promise.all([
            query(
              `UPDATE public.users SET
               email = 'anonymized_' || $1 || '@deleted.local',
               full_name = 'Usuário Anonimizado',
               phone = NULL,
               password_hash = 'REVOKED',
               is_active = false,
               must_change_password = false,
               updated_at = timezone('utc'::text, now())
               WHERE id = $1`,
              [data.user_id],
            ),
            query("DELETE FROM public.sessions WHERE user_id = $1", [
              data.user_id,
            ]),
            query("DELETE FROM public.trusted_devices WHERE user_id = $1", [
              data.user_id,
            ]),
            query(
              "UPDATE public.user_profiles SET display_name = 'Anonimizado', avatar_initials = 'XX', bio = NULL, phone = NULL, location = NULL, social_links = '[]' WHERE user_id = $1",
              [data.user_id],
            ),
          ]);
        }

        await query(
          "UPDATE public.lgpd_requests SET status = 'completed', completed_at = timezone('utc'::text, now()) WHERE id = $1",
          [requestId],
        );

        if (userId) {
          try {
            await writeAuditLog({
              userId,
              tenantId,
              action: "lgpd.delete",
              entityType: "lgpd_requests",
              entityId: requestId,
              newData: {
                request_id: requestId,
                user_id: data.user_id,
                mode: data.mode,
              },
            });
          } catch {
            // Audit log falhou — nao bloqueia
          }
        }

        logger.info("LGPD delete concluído", {
          requestId,
          userId: data.user_id,
          mode: data.mode,
          tenantId,
        });

        return c.json({
          request_id: requestId,
          status: "completed",
          mode: data.mode,
          message:
            data.mode === "delete"
              ? "Dados pessoais deletados permanentemente"
              : "Dados pessoais anonimizados",
        });
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Erro desconhecido";
        await query(
          "UPDATE public.lgpd_requests SET status = 'failed', error_message = $1, completed_at = timezone('utc'::text, now()) WHERE id = $2",
          [errorMsg, requestId],
        );
        logger.error("Erro no LGPD delete", {
          requestId,
          error: errorMsg,
        });
        return c.json(
          { error: { code: "DELETE_ERROR", message: errorMsg } },
          500,
        );
      }
    } catch (error) {
      logger.error("Erro ao criar LGPD delete request", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "CREATE_ERROR", message: "Erro ao criar solicitação" },
        },
        500,
      );
    }
  },
);

// GET /api/v1/lgpd/requests/:id — detalhes de uma solicitação
lgpdRoute.get(
  "/requests/:id",
  requirePermission("admin:tenants:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const requestId = c.req.param("id");

    try {
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
          {
            error: { code: "NOT_FOUND", message: "Solicitação não encontrada" },
          },
          404,
        );
      }

      return c.json({ request: result.data.rows[0] });
    } catch (error) {
      logger.error("Erro ao buscar LGPD request", {
        requestId,
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
