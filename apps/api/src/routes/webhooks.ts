// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import {
  createWebhookSchema,
  updateWebhookSchema,
  triggerWebhookSchema,
  type CreateWebhookInput,
  type UpdateWebhookInput,
  type TriggerWebhookInput,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { safeJsonBody } from "../lib/safe-json.js";
import { writeAuditLog } from "../lib/audit.js";
import {
  parsePaginationParams,
  buildPaginatedResponse,
} from "../lib/pagination.js";
import "../types.js";

export const webhookRoute = new Hono();

function signPayload(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

// Valida URL para prevenir SSRF — rejeita IPs internos e localhost
function isSafeWebhookUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    // Apenas http/https
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    const hostname = parsed.hostname;
    // Rejeita IPs literais (IPv4 e IPv6)
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
      // Permite apenas IPs publicos (nao 10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x)
      const parts = hostname.split(".").map(Number);
      if (
        parts[0] === 10 ||
        parts[0] === 127 ||
        (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) ||
        (parts[0] === 192 && parts[1] === 168) ||
        (parts[0] === 169 && parts[1] === 254) ||
        parts[0] === 0
      ) {
        return false;
      }
    }
    // Rejeita IPv6 loopback e link-local
    if (
      hostname.includes(":") ||
      hostname === "::1" ||
      hostname.startsWith("fe80")
    ) {
      return false;
    }
    // Rejeita localhost
    if (hostname.toLowerCase() === "localhost") {
      return false;
    }
    // Rejeita metadata endpoints
    const lower = hostname.toLowerCase();
    if (
      lower === "metadata.google.internal" ||
      lower.includes("169.254.169.254") ||
      lower.includes("169.254.170.2")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ========== List ==========

webhookRoute.get(
  "/",
  requirePermission("webhooks:read"),
  httpCache(15),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const activeOnly = c.req.query("active") === "true";
    const pagination = parsePaginationParams({
      page: c.req.query("page"),
      limit: c.req.query("limit"),
      sort: c.req.query("sort"),
      order: c.req.query("order"),
    });

    const conditions: string[] = ["tenant_id = $1"];
    const params: unknown[] = [tenantId];
    let paramIdx = 2;
    if (activeOnly) {
      conditions.push("is_active = true");
    }

    const whereClause = conditions.join(" AND ");

    try {
      // Paraleliza count + data
      const countParams = [...params];
      const dataParams = [...params, pagination.limit, pagination.offset];

      const [countResult, result] = await Promise.all([
        query<{ total: number }>(
          `SELECT COUNT(*)::int as total FROM public.webhooks WHERE ${whereClause}`,
          countParams,
        ),
        query(
          `SELECT id, name, description, url, method, events, headers, is_active, is_verified,
             max_retries, retry_delay_seconds, timeout_seconds, expected_status_code,
             last_triggered_at, last_delivery_status,
             total_deliveries, successful_deliveries, failed_deliveries, created_at, updated_at
           FROM public.webhooks WHERE ${whereClause}
           ORDER BY ${pagination.sort} ${pagination.order.toUpperCase()}
           LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
          dataParams,
        ),
      ]);

      const total = countResult.data?.rows[0]?.total ?? 0;

      return c.json(
        buildPaginatedResponse(result.data?.rows ?? [], total, pagination),
      );
    } catch (error) {
      logger.error("Erro ao listar webhooks", {
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

// ========== Create ==========

webhookRoute.post(
  "/",
  rateLimitWrite,
  requirePermission("webhooks:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = createWebhookSchema.safeParse(parsedBody.data);
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

    const data = parsed.data as CreateWebhookInput;

    // SSRF prevention — valida URL antes de salvar
    if (!isSafeWebhookUrl(data.url)) {
      return c.json(
        {
          error: {
            code: "SSRF_BLOCKED",
            message:
              "URL bloqueada: nao sao permitidas URLs para IPs internos, localhost ou metadata endpoints",
          },
        },
        400,
      );
    }

    const secret = data.secret ?? null;

    try {
      const result = await query<{ id: string }>(
        `INSERT INTO public.webhooks (tenant_id, name, description, url, method, events, headers, secret,
           is_active, max_retries, retry_delay_seconds, timeout_seconds, expected_status_code, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
        [
          tenantId,
          data.name,
          data.description ?? null,
          data.url,
          data.method,
          JSON.stringify(data.events),
          data.headers ? JSON.stringify(data.headers) : null,
          secret,
          data.is_active,
          data.max_retries,
          data.retry_delay_seconds,
          data.timeout_seconds,
          data.expected_status_code,
          user?.sub ?? null,
        ],
      );

      if (result.error || !result.data?.rows[0]) {
        return c.json(
          { error: { code: "CREATE_ERROR", message: "Erro ao criar webhook" } },
          500,
        );
      }

      const webhookId = result.data.rows[0].id;

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "webhook.create",
            entityType: "webhook",
            entityId: webhookId,
            newData: {
              name: data.name,
              url: data.url,
              events: data.events,
            },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Webhook criado", { webhookId, name: data.name, tenantId });

      return c.json({ id: webhookId }, 201);
    } catch (error) {
      logger.error("Erro ao criar webhook", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar webhook" } },
        500,
      );
    }
  },
);

// ========== Update ==========

webhookRoute.put(
  "/:id",
  rateLimitWrite,
  requirePermission("webhooks:write"),
  async (c) => {
    const webhookId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = updateWebhookSchema.safeParse(parsedBody.data);
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

    const data = parsed.data as UpdateWebhookInput;

    // SSRF prevention — valida URL se fornecida
    if (data.url && !isSafeWebhookUrl(data.url)) {
      return c.json(
        {
          error: {
            code: "SSRF_BLOCKED",
            message:
              "URL bloqueada: nao sao permitidas URLs para IPs internos, localhost ou metadata endpoints",
          },
        },
        400,
      );
    }

    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    const fieldMap: Record<string, string> = {
      name: "name",
      description: "description",
      url: "url",
      method: "method",
      secret: "secret",
      is_active: "is_active",
      is_verified: "is_verified",
      max_retries: "max_retries",
      retry_delay_seconds: "retry_delay_seconds",
      timeout_seconds: "timeout_seconds",
      expected_status_code: "expected_status_code",
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        updateFields.push(`${dbField} = $${paramIdx++}`);
        params.push(data[key as keyof typeof data]);
      }
    }

    if (data.events !== undefined) {
      updateFields.push(`events = $${paramIdx++}`);
      params.push(JSON.stringify(data.events));
    }

    if (data.headers !== undefined) {
      updateFields.push(`headers = $${paramIdx++}`);
      params.push(JSON.stringify(data.headers));
    }

    if (updateFields.length === 0) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Nada para atualizar" } },
        400,
      );
    }

    params.push(webhookId, tenantId);

    try {
      const result = await query(
        `UPDATE public.webhooks SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
        params,
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Webhook não encontrado" } },
          404,
        );
      }

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "webhook.update",
            entityType: "webhook",
            entityId: webhookId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Webhook atualizado", { webhookId, tenantId });

      return c.json({ id: webhookId });
    } catch (error) {
      logger.error("Erro ao atualizar webhook", {
        webhookId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "UPDATE_ERROR", message: "Erro ao atualizar webhook" },
        },
        500,
      );
    }
  },
);

// ========== Delete ==========

webhookRoute.delete(
  "/:id",
  rateLimitWrite,
  requirePermission("webhooks:write"),
  async (c) => {
    const webhookId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        "DELETE FROM public.webhooks WHERE id = $1 AND tenant_id = $2",
        [webhookId, tenantId],
      );

      if (result.data?.rowCount === 0) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Webhook não encontrado" } },
          404,
        );
      }

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "webhook.delete",
            entityType: "webhook",
            entityId: webhookId,
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Webhook removido", { webhookId, tenantId });

      return c.json({ deleted: true });
    } catch (error) {
      logger.error("Erro ao remover webhook", {
        webhookId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "DELETE_ERROR", message: "Erro ao remover webhook" } },
        500,
      );
    }
  },
);

// ========== Test ==========

webhookRoute.post(
  "/:id/test",
  rateLimitWrite,
  requirePermission("webhooks:write"),
  async (c) => {
    const webhookId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const whResult = await query(
        "SELECT * FROM public.webhooks WHERE id = $1 AND tenant_id = $2",
        [webhookId, tenantId],
      );

      if (whResult.error || !whResult.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Webhook não encontrado" } },
          404,
        );
      }

      const wh = whResult.data.rows[0] as {
        id: string;
        url: string;
        method: string;
        headers: Record<string, string>;
        secret: string | null;
        timeout_seconds: number;
        expected_status_code: number;
      };

      // SSRF prevention — valida URL antes de fetch
      if (!isSafeWebhookUrl(wh.url)) {
        return c.json(
          {
            error: {
              code: "SSRF_BLOCKED",
              message: "URL do webhook bloqueada por politica de seguranca",
            },
          },
          400,
        );
      }

      const testPayload = JSON.stringify({
        event: "webhook.test",
        timestamp: new Date().toISOString(),
        data: { webhook_id: wh.id, test: true },
      });

      const startTime = Date.now();
      let statusCode = 0;
      let errorMsg: string | null = null;
      let responseBody = "";

      try {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          wh.timeout_seconds * 1000,
        );

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          ...wh.headers,
        };
        if (wh.secret) {
          headers["X-Webhook-Signature"] = signPayload(wh.secret, testPayload);
        }

        const res = await fetch(wh.url, {
          method: wh.method,
          headers,
          body: testPayload,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        statusCode = res.status;
        responseBody = await res.text();

        if (statusCode !== wh.expected_status_code) {
          errorMsg = `Status ${statusCode} (esperado ${wh.expected_status_code})`;
        }
      } catch (err) {
        errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
      }

      const responseTimeMs = Date.now() - startTime;
      const success = statusCode === wh.expected_status_code && !errorMsg;

      // Registra entrega de teste
      await query(
        `INSERT INTO public.webhook_deliveries (tenant_id, webhook_id, event_name, payload, status, attempt_number, response_status_code, response_body, response_time_ms, error_message, delivered_at)
       VALUES ($1, $2, 'webhook.test', $3, $4, 1, $5, $6, $7, $8, timezone('utc'::text, now()))`,
        [
          tenantId,
          webhookId,
          testPayload,
          success ? "success" : "failed",
          statusCode || null,
          responseBody.substring(0, 5000),
          responseTimeMs,
          errorMsg,
        ],
      );

      // Atualiza stats do webhook
      await query(
        `UPDATE public.webhooks SET
         last_triggered_at = timezone('utc'::text, now()),
         last_delivery_status = $1,
         total_deliveries = total_deliveries + 1,
         successful_deliveries = successful_deliveries + $2,
         failed_deliveries = failed_deliveries + $3
       WHERE id = $4`,
        [
          success ? "success" : "failed",
          success ? 1 : 0,
          success ? 0 : 1,
          webhookId,
        ],
      );

      return c.json({
        success,
        status_code: statusCode,
        response_time_ms: responseTimeMs,
        error: errorMsg,
        response_body: responseBody.substring(0, 1000),
      });
    } catch (error) {
      logger.error("Erro ao testar webhook", {
        webhookId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "TEST_ERROR", message: "Erro ao testar webhook" } },
        500,
      );
    }
  },
);

// ========== Trigger ==========

webhookRoute.post(
  "/trigger",
  rateLimitWrite,
  requirePermission("webhooks:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = triggerWebhookSchema.safeParse(parsedBody.data);
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

    const data = parsed.data as TriggerWebhookInput;
    const eventName = data.event_name ?? data.event;
    const payloadStr = JSON.stringify(data.payload);

    try {
      // Paraleliza insert do evento + busca de webhooks
      const [eventResult, webhooksResult] = await Promise.all([
        query<{ id: string }>(
          `INSERT INTO public.webhook_events (tenant_id, event_name, source_type, source_id, payload)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [
            tenantId,
            eventName,
            data.source_type ?? null,
            data.source_id ?? null,
            payloadStr,
          ],
        ),
        query(
          `SELECT * FROM public.webhooks
         WHERE tenant_id = $1 AND is_active = true AND events @> $2::jsonb`,
          [tenantId, JSON.stringify([eventName])],
        ),
      ]);

      const matchedWebhooks = webhooksResult.data?.rows ?? [];
      let triggered = 0;

      // Cria registros de entrega pendente para todos webhooks matched
      if (matchedWebhooks.length > 0) {
        const values: string[] = [];
        const params: unknown[] = [];
        let paramIdx = 1;

        for (const wh of matchedWebhooks as Array<{ id: string }>) {
          values.push(
            `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, 'pending', 1)`,
          );
          params.push(tenantId, wh.id, eventName, payloadStr);
        }

        const deliveryResult = await query(
          `INSERT INTO public.webhook_deliveries (tenant_id, webhook_id, event_name, payload, status, attempt_number)
           VALUES ${values.join(", ")}`,
          params,
        );
        if (!deliveryResult.error) {
          triggered = matchedWebhooks.length;
        }
      }

      // Atualiza contador do evento
      if (eventResult.data?.rows[0]) {
        await query(
          "UPDATE public.webhook_events SET triggered_webhooks = $1 WHERE id = $2",
          [triggered, eventResult.data.rows[0].id],
        );
      }

      logger.info("Webhook triggered", {
        eventName,
        triggered,
        tenantId,
      });

      return c.json(
        {
          event_id: eventResult.data?.rows[0]?.id,
          triggered_webhooks: triggered,
        },
        201,
      );
    } catch (error) {
      logger.error("Erro ao disparar webhook", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "TRIGGER_ERROR", message: "Erro ao disparar webhook" },
        },
        500,
      );
    }
  },
);

// ========== Deliveries ==========

webhookRoute.get(
  "/:id/deliveries",
  requirePermission("webhooks:read"),
  httpCache(15),
  async (c) => {
    const webhookId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;
    const status = c.req.query("status");
    const limit = Math.min(
      Number.parseInt(c.req.query("limit") ?? "50", 10) || 50,
      200,
    );

    const conditions: string[] = ["webhook_id = $1", "tenant_id = $2"];
    const params: unknown[] = [webhookId, tenantId];
    let paramIdx = 3;

    if (status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(status);
    }

    params.push(limit);

    try {
      const result = await query(
        `SELECT * FROM public.webhook_deliveries WHERE ${conditions.join(" AND ")}
       ORDER BY created_at DESC LIMIT $${paramIdx++}`,
        params,
      );

      return c.json({ deliveries: result.data?.rows ?? [] });
    } catch (error) {
      logger.error("Erro ao listar deliveries", {
        webhookId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Erro interno" } },
        500,
      );
    }
  },
);

// ========== Retry Delivery ==========

webhookRoute.post(
  "/:id/deliveries/:deliveryId/retry",
  rateLimitWrite,
  requirePermission("webhooks:write"),
  async (c) => {
    const webhookId = c.req.param("id");
    const deliveryId = c.req.param("deliveryId");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const deliveryResult = await query(
        "SELECT * FROM public.webhook_deliveries WHERE id = $1 AND webhook_id = $2 AND tenant_id = $3",
        [deliveryId, webhookId, tenantId],
      );

      if (deliveryResult.error || !deliveryResult.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Entrega não encontrada" } },
          404,
        );
      }

      const delivery = deliveryResult.data.rows[0] as {
        id: string;
        event_name: string;
        payload: string;
        attempt_number: number;
      };

      const whResult = await query(
        "SELECT * FROM public.webhooks WHERE id = $1 AND tenant_id = $2",
        [webhookId, tenantId],
      );

      if (!whResult.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Webhook não encontrado" } },
          404,
        );
      }

      const wh = whResult.data.rows[0] as {
        url: string;
        method: string;
        headers: Record<string, string>;
        secret: string | null;
        timeout_seconds: number;
        expected_status_code: number;
      };

      // SSRF prevention — valida URL antes de fetch
      if (!isSafeWebhookUrl(wh.url)) {
        return c.json(
          {
            error: {
              code: "SSRF_BLOCKED",
              message: "URL do webhook bloqueada por politica de seguranca",
            },
          },
          400,
        );
      }

      const startTime = Date.now();
      let statusCode = 0;
      let errorMsg: string | null = null;
      let responseBody = "";

      try {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          wh.timeout_seconds * 1000,
        );

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          ...wh.headers,
        };
        if (wh.secret) {
          headers["X-Webhook-Signature"] = signPayload(
            wh.secret,
            delivery.payload,
          );
        }

        const res = await fetch(wh.url, {
          method: wh.method,
          headers,
          body: delivery.payload,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        statusCode = res.status;
        responseBody = await res.text();

        if (statusCode !== wh.expected_status_code) {
          errorMsg = `Status ${statusCode} (esperado ${wh.expected_status_code})`;
        }
      } catch (err) {
        errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
      }

      const responseTimeMs = Date.now() - startTime;
      const success = statusCode === wh.expected_status_code && !errorMsg;
      const newAttempt = delivery.attempt_number + 1;

      await query(
        `UPDATE public.webhook_deliveries SET
         status = $1, attempt_number = $2, response_status_code = $3,
         response_body = $4, response_time_ms = $5, error_message = $6,
         delivered_at = CASE WHEN $1 = 'success' THEN timezone('utc'::text, now()) ELSE delivered_at END
       WHERE id = $7`,
        [
          success ? "success" : "failed",
          newAttempt,
          statusCode || null,
          responseBody.substring(0, 5000),
          responseTimeMs,
          errorMsg,
          deliveryId,
        ],
      );

      return c.json({
        success,
        status_code: statusCode,
        response_time_ms: responseTimeMs,
        attempt: newAttempt,
        error: errorMsg,
      });
    } catch (error) {
      logger.error("Erro ao retry delivery", {
        deliveryId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "RETRY_ERROR", message: "Erro ao retry entrega" } },
        500,
      );
    }
  },
);

// ========== Stats ==========

webhookRoute.get(
  "/stats",
  requirePermission("webhooks:read"),
  httpCache(15),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Paraleliza 4 queries independentes
      const [overviewResult, recentDeliveries, pendingRetries, topWebhooks] =
        await Promise.all([
          query(
            `SELECT
               COUNT(*) as total_webhooks,
               COUNT(*) FILTER (WHERE is_active = true) as active_webhooks,
               COUNT(*) FILTER (WHERE is_verified = true) as verified_webhooks,
               SUM(total_deliveries) as total_deliveries,
               SUM(successful_deliveries) as successful_deliveries,
               SUM(failed_deliveries) as failed_deliveries
             FROM public.webhooks WHERE tenant_id = $1`,
            [tenantId],
          ),
          query(
            `SELECT d.id, d.event_name, d.status, d.attempt_number, d.response_status_code,
               d.response_time_ms, d.error_message, d.created_at, w.name as webhook_name
             FROM public.webhook_deliveries d
             JOIN public.webhooks w ON d.webhook_id = w.id
             WHERE d.tenant_id = $1
             ORDER BY d.created_at DESC LIMIT 10`,
            [tenantId],
          ),
          query(
            `SELECT COUNT(*) as count FROM public.webhook_deliveries
             WHERE tenant_id = $1 AND status IN ('pending', 'retrying')`,
            [tenantId],
          ),
          query(
            `SELECT id, name, total_deliveries, successful_deliveries, failed_deliveries, last_delivery_status
             FROM public.webhooks WHERE tenant_id = $1
             ORDER BY total_deliveries DESC LIMIT 5`,
            [tenantId],
          ),
        ]);

      return c.json({
        overview: overviewResult.data?.rows[0] ?? {
          total_webhooks: "0",
          active_webhooks: "0",
          verified_webhooks: "0",
          total_deliveries: "0",
          successful_deliveries: "0",
          failed_deliveries: "0",
        },
        recent_deliveries: recentDeliveries.data?.rows ?? [],
        pending_retries: pendingRetries.data?.rows[0]?.count ?? "0",
        top_webhooks: topWebhooks.data?.rows ?? [],
      });
    } catch (error) {
      logger.error("Erro ao buscar stats webhooks", {
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

// ========== Verify Signature (inbound) ==========

webhookRoute.post(
  "/verify/:id",
  rateLimitWrite,
  requirePermission("webhooks:write"),
  async (c) => {
    const webhookId = c.req.param("id");
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    const parsedBody = await safeJsonBody<{
      signature: string;
      payload: string;
    }>(c);
    if (!parsedBody.success) return parsedBody.response;

    try {
      const whResult = await query(
        "SELECT secret FROM public.webhooks WHERE id = $1 AND tenant_id = $2",
        [webhookId, tenantId],
      );

      if (!whResult.data?.rows[0]) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Webhook não encontrado" } },
          404,
        );
      }

      const secret = whResult.data.rows[0].secret as string | null;
      if (!secret) {
        return c.json(
          {
            error: {
              code: "NO_SECRET",
              message: "Webhook não possui secret configurado",
            },
          },
          400,
        );
      }

      const expectedSig = signPayload(secret, parsedBody.data.payload);
      const providedSig = Buffer.from(parsedBody.data.signature, "hex");
      const expectedBuf = Buffer.from(expectedSig, "hex");

      const valid =
        providedSig.length === expectedBuf.length &&
        timingSafeEqual(providedSig, expectedBuf);

      if (valid) {
        await query(
          "UPDATE public.webhooks SET is_verified = true WHERE id = $1",
          [webhookId],
        );
      }

      logger.info("Webhook signature verified", {
        webhookId,
        valid,
        tenantId,
      });

      return c.json({ verified: valid });
    } catch (error) {
      logger.error("Erro ao verificar signature", {
        webhookId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "VERIFY_ERROR", message: "Erro ao verificar" } },
        500,
      );
    }
  },
);
