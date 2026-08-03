// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import { query } from "@repo/db";
import {
  createWebhookSchema,
  updateWebhookSchema,
  triggerWebhookSchema,
  type CreateWebhookInput,
  type UpdateWebhookInput,
  type TriggerWebhookInput,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import {
  parsePaginationParams,
  buildPaginatedResponse,
} from "../lib/pagination.js";
import "../types.js";

export const webhookRoute = new Hono();

function signPayload(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

// ========== List ==========

webhookRoute.get("/", requirePermission("webhooks:read"), async (c) => {
  const user = c.get("user");
  const activeOnly = c.req.query("active") === "true";
  const pagination = parsePaginationParams({
    page: c.req.query("page"),
    limit: c.req.query("limit"),
    sort: c.req.query("sort"),
    order: c.req.query("order"),
  });

  const conditions: string[] = ["tenant_id = $1"];
  const params: unknown[] = [user?.tenant_id ?? null];
  let paramIdx = 2;
  if (activeOnly) {
    conditions.push("is_active = true");
  }

  const whereClause = conditions.join(" AND ");

  const countResult = await query<{ total: number }>(
    `SELECT COUNT(*)::int as total FROM public.webhooks WHERE ${whereClause}`,
    params,
  );
  const total = countResult.data?.rows[0]?.total ?? 0;

  params.push(pagination.limit, pagination.offset);
  const result = await query(
    `SELECT id, name, description, url, method, events, headers, is_active, is_verified,
       max_retries, retry_delay_seconds, timeout_seconds, expected_status_code,
       last_triggered_at, last_delivery_status,
       total_deliveries, successful_deliveries, failed_deliveries, created_at, updated_at
     FROM public.webhooks WHERE ${whereClause}
     ORDER BY ${pagination.sort} ${pagination.order.toUpperCase()}
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    params,
  );

  return c.json(
    buildPaginatedResponse(result.data?.rows ?? [], total, pagination),
  );
});

// ========== Create ==========

webhookRoute.post("/", requirePermission("webhooks:write"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json<CreateWebhookInput>();
  const parsed = createWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
      400,
    );
  }

  const data = parsed.data;
  const secret = data.secret ?? null;

  const result = await query<{ id: string }>(
    `INSERT INTO public.webhooks (tenant_id, name, description, url, method, events, headers, secret,
       is_active, max_retries, retry_delay_seconds, timeout_seconds, expected_status_code, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
    [
      user?.tenant_id ?? null,
      data.name,
      data.description ?? null,
      data.url,
      data.method,
      JSON.stringify(data.events),
      JSON.stringify(data.headers),
      secret,
      data.is_active,
      data.max_retries,
      data.retry_delay_seconds,
      data.timeout_seconds,
      data.expected_status_code,
      user.sub,
    ],
  );

  if (result.error || !result.data?.rows[0]) {
    return c.json(
      { error: { code: "CREATE_ERROR", message: "Erro ao criar webhook" } },
      500,
    );
  }

  await query(
    "SELECT public.write_audit_log($1, NULL, 'webhook.create', 'webhook', $2, $3, NULL, NULL)",
    [
      user.sub,
      result.data.rows[0].id,
      JSON.stringify({ name: data.name, url: data.url, events: data.events }),
    ],
  );

  return c.json({ id: result.data.rows[0].id }, 201);
});

// ========== Update ==========

webhookRoute.put("/:id", requirePermission("webhooks:write"), async (c) => {
  const webhookId = c.req.param("id");
  const user = c.get("user");
  const body = await c.req.json<UpdateWebhookInput>();
  const parsed = updateWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
      400,
    );
  }

  const data = parsed.data;
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
    return c.json({ id: webhookId });
  }

  params.push(webhookId, user?.tenant_id ?? null);

  await query(
    `UPDATE public.webhooks SET ${updateFields.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx++}`,
    params,
  );

  return c.json({ id: webhookId });
});

// ========== Delete ==========

webhookRoute.delete("/:id", requirePermission("webhooks:write"), async (c) => {
  const webhookId = c.req.param("id");
  const user = c.get("user");

  await query("DELETE FROM public.webhooks WHERE id = $1 AND tenant_id = $2", [
    webhookId,
    user?.tenant_id ?? null,
  ]);

  return c.json({ deleted: true });
});

// ========== Test ==========

webhookRoute.post(
  "/:id/test",
  requirePermission("webhooks:write"),
  async (c) => {
    const webhookId = c.req.param("id");
    const user = c.get("user");

    const whResult = await query(
      "SELECT * FROM public.webhooks WHERE id = $1 AND tenant_id = $2",
      [webhookId, user?.tenant_id ?? null],
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
        user?.tenant_id ?? null,
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
  },
);

// ========== Trigger ==========

webhookRoute.post(
  "/trigger",
  requirePermission("webhooks:write"),
  async (c) => {
    const user = c.get("user");
    const body = await c.req.json<TriggerWebhookInput>();
    const parsed = triggerWebhookSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
        400,
      );
    }

    const data = parsed.data;
    const payloadStr = JSON.stringify(data.payload);

    // Registra evento
    const eventResult = await query<{ id: string }>(
      `INSERT INTO public.webhook_events (tenant_id, event_name, source_type, source_id, payload)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        user?.tenant_id ?? null,
        data.event_name,
        data.source_type ?? null,
        data.source_id ?? null,
        payloadStr,
      ],
    );

    // Busca webhooks que escutam este evento
    const webhooksResult = await query(
      `SELECT * FROM public.webhooks
     WHERE tenant_id = $1 AND is_active = true AND events @> $2::jsonb`,
      [user?.tenant_id ?? null, JSON.stringify([data.event_name])],
    );

    const matchedWebhooks = webhooksResult.data?.rows ?? [];
    let triggered = 0;

    for (const wh of matchedWebhooks as Array<{
      id: string;
      url: string;
      method: string;
      headers: Record<string, string>;
      secret: string | null;
      timeout_seconds: number;
      expected_status_code: number;
      max_retries: number;
      retry_delay_seconds: number;
    }>) {
      // Cria registro de entrega pendente
      await query(
        `INSERT INTO public.webhook_deliveries (tenant_id, webhook_id, event_name, payload, status, attempt_number)
       VALUES ($1, $2, $3, $4, 'pending', 1)`,
        [user?.tenant_id ?? null, wh.id, data.event_name, payloadStr],
      );

      triggered++;
    }

    // Atualiza contador do evento
    if (eventResult.data?.rows[0]) {
      await query(
        "UPDATE public.webhook_events SET triggered_webhooks = $1 WHERE id = $2",
        [triggered, eventResult.data.rows[0].id],
      );
    }

    return c.json(
      {
        event_id: eventResult.data?.rows[0]?.id,
        triggered_webhooks: triggered,
      },
      201,
    );
  },
);

// ========== Deliveries ==========

webhookRoute.get(
  "/:id/deliveries",
  requirePermission("webhooks:read"),
  async (c) => {
    const webhookId = c.req.param("id");
    const user = c.get("user");
    const status = c.req.query("status");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);

    const conditions: string[] = ["webhook_id = $1", "tenant_id = $2"];
    const params: unknown[] = [webhookId, user?.tenant_id ?? null];
    let paramIdx = 3;

    if (status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(status);
    }

    params.push(limit);

    const result = await query(
      `SELECT * FROM public.webhook_deliveries WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC LIMIT $${paramIdx++}`,
      params,
    );

    return c.json({ deliveries: result.data?.rows ?? [] });
  },
);

// ========== Retry Delivery ==========

webhookRoute.post(
  "/:id/deliveries/:deliveryId/retry",
  requirePermission("webhooks:write"),
  async (c) => {
    const webhookId = c.req.param("id");
    const deliveryId = c.req.param("deliveryId");
    const user = c.get("user");

    const deliveryResult = await query(
      "SELECT * FROM public.webhook_deliveries WHERE id = $1 AND webhook_id = $2 AND tenant_id = $3",
      [deliveryId, webhookId, user?.tenant_id ?? null],
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
      [webhookId, user?.tenant_id ?? null],
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
  },
);

// ========== Stats ==========

webhookRoute.get(
  "/stats/overview",
  requirePermission("webhooks:read"),
  async (c) => {
    const user = c.get("user");

    const overviewResult = await query(
      `SELECT
       COUNT(*) as total_webhooks,
       COUNT(*) FILTER (WHERE is_active = true) as active_webhooks,
       COUNT(*) FILTER (WHERE is_verified = true) as verified_webhooks,
       SUM(total_deliveries) as total_deliveries,
       SUM(successful_deliveries) as successful_deliveries,
       SUM(failed_deliveries) as failed_deliveries
     FROM public.webhooks WHERE tenant_id = $1`,
      [user?.tenant_id ?? null],
    );

    const recentDeliveries = await query(
      `SELECT d.id, d.event_name, d.status, d.attempt_number, d.response_status_code,
       d.response_time_ms, d.error_message, d.created_at, w.name as webhook_name
     FROM public.webhook_deliveries d
     JOIN public.webhooks w ON d.webhook_id = w.id
     WHERE d.tenant_id = $1
     ORDER BY d.created_at DESC LIMIT 10`,
      [user?.tenant_id ?? null],
    );

    const pendingRetries = await query(
      `SELECT COUNT(*) as count FROM public.webhook_deliveries
     WHERE tenant_id = $1 AND status IN ('pending', 'retrying')`,
      [user?.tenant_id ?? null],
    );

    const topWebhooks = await query(
      `SELECT id, name, total_deliveries, successful_deliveries, failed_deliveries, last_delivery_status
     FROM public.webhooks WHERE tenant_id = $1
     ORDER BY total_deliveries DESC LIMIT 5`,
      [user?.tenant_id ?? null],
    );

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
  },
);

// ========== Verify Signature (inbound) ==========

webhookRoute.post(
  "/verify/:id",
  requirePermission("webhooks:write"),
  async (c) => {
    const webhookId = c.req.param("id");
    const user = c.get("user");
    const body = await c.req.json<{ signature: string; payload: string }>();

    const whResult = await query(
      "SELECT secret FROM public.webhooks WHERE id = $1 AND tenant_id = $2",
      [webhookId, user?.tenant_id ?? null],
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

    const expectedSig = signPayload(secret, body.payload);
    const providedSig = Buffer.from(body.signature, "hex");
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

    return c.json({ verified: valid });
  },
);
