// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import {
  createBillingSubscriptionSchema,
  createBillingPaymentSchema,
  asaasWebhookSchema,
  type CreateBillingSubscriptionInput,
  type CreateBillingPaymentInput,
} from "@repo/shared-validation";
import { requirePermission } from "../middleware/require-permission.js";
import { rateLimitWrite } from "../middleware/rate-limit.js";
import { httpCache } from "../middleware/http-cache.js";
import { safeJsonBody } from "../lib/safe-json.js";
import { writeAuditLog } from "../lib/audit.js";
import { safeRows, safeFirstRow } from "../lib/query-helpers.js";
import {
  createAsaasCustomer,
  createAsaasSubscription,
  createAsaasPayment,
  getAsaasPaymentStatus,
  isAsaasConfigured,
} from "../lib/asaas-client.js";
import "../types.js";

export const billingRoute = new Hono();

// GET /api/v1/billing — overview do modulo
billingRoute.get(
  "/",
  requirePermission("billing:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Paraleliza 2 queries
      const [subsResult, invoicesResult] = await Promise.all([
        query(
          "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'active') as active FROM public.billing_subscriptions WHERE tenant_id = $1",
          [tenantId],
        ),
        query(
          "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status IN ('PENDING','OVERDUE')) as pending FROM public.billing_invoices WHERE tenant_id = $1",
          [tenantId],
        ),
      ]);

      return c.json({
        overview: {
          subscriptions: subsResult.data?.rows[0] ?? {
            total: "0",
            active: "0",
          },
          invoices: invoicesResult.data?.rows[0] ?? {
            total: "0",
            pending: "0",
          },
        },
        endpoints: [
          "/subscriptions",
          "/invoices",
          "/payments",
          "/payments/:id/status",
          "/stats",
        ],
      });
    } catch (error) {
      logger.error("Erro no overview billing", {
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

// GET /api/v1/billing/stats — estatisticas de billing
billingRoute.get(
  "/stats",
  requirePermission("billing:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      // Paraleliza 2 queries
      const [revenueResult, subsResult] = await Promise.all([
        query(
          `SELECT COALESCE(SUM(amount_cents), 0) as total_revenue,
             COUNT(*) FILTER (WHERE status IN ('RECEIVED','CONFIRMED')) as paid_invoices,
             COUNT(*) FILTER (WHERE status IN ('PENDING','OVERDUE')) as pending_invoices,
             COUNT(*) as total_invoices
           FROM public.billing_invoices WHERE tenant_id = $1`,
          [tenantId],
        ),
        query(
          `SELECT plan, billing_cycle, status, COUNT(*) as count
           FROM public.billing_subscriptions WHERE tenant_id = $1
           GROUP BY plan, billing_cycle, status`,
          [tenantId],
        ),
      ]);

      return c.json({
        revenue: revenueResult.data?.rows[0] ?? {
          total_revenue: "0",
          paid_invoices: "0",
          pending_invoices: "0",
          total_invoices: "0",
        },
        subscriptions_by_plan: subsResult.data?.rows ?? [],
      });
    } catch (error) {
      logger.error("Erro ao buscar stats billing", {
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

// GET /api/v1/billing/subscriptions — lista assinaturas do tenant
billingRoute.get(
  "/subscriptions",
  requirePermission("billing:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        `SELECT * FROM public.billing_subscriptions WHERE tenant_id = $1 ORDER BY created_at DESC`,
        [tenantId],
      );
      return c.json({ subscriptions: safeRows(result) });
    } catch (error) {
      logger.error("Erro ao listar subscriptions", {
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

// POST /api/v1/billing/subscriptions — cria assinatura no Asaas e no DB
billingRoute.post(
  "/subscriptions",
  rateLimitWrite,
  requirePermission("billing:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const parsedBody = await safeJsonBody(c);
      if (!parsedBody.success) return parsedBody.response;
      const parsed = createBillingSubscriptionSchema.safeParse(parsedBody.data);

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

      if (!isAsaasConfigured()) {
        return c.json(
          {
            error: {
              code: "ASAAS_NOT_CONFIGURED",
              message: "Asaas não configurado",
            },
          },
          501,
        );
      }

      const data = parsed.data as CreateBillingSubscriptionInput;

      // Cria cliente no Asaas
      const customerResult = await createAsaasCustomer({
        name: data.customer_name,
        email: data.customer_email,
        cpfCnpj: data.customer_cpf_cnpj,
        phone: data.customer_phone,
      });

      if ("error" in customerResult) {
        return c.json(
          { error: { code: "ASAAS_ERROR", message: customerResult.error } },
          502,
        );
      }

      // Cria assinatura no Asaas
      const cycleMap = {
        monthly: "MONTHLY",
        quarterly: "QUARTERLY",
        yearly: "YEARLY",
      } as const;
      const subResult = await createAsaasSubscription({
        customer: customerResult.id,
        billingType: data.payment_method,
        value: data.amount_cents / 100,
        cycle: cycleMap[data.billing_cycle],
        nextDueDate: new Date().toISOString().split("T")[0],
        description: `JLMIRROR ${data.plan.toUpperCase()}`,
      });

      if ("error" in subResult) {
        return c.json(
          { error: { code: "ASAAS_ERROR", message: subResult.error } },
          502,
        );
      }

      // Salva no DB
      const dbResult = await query<{ id: string }>(
        `INSERT INTO public.billing_subscriptions (tenant_id, asaas_subscription_id, asaas_customer_id, plan, billing_cycle, amount_cents, status, payment_method)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7) RETURNING id`,
        [
          tenantId,
          subResult.id,
          customerResult.id,
          data.plan,
          data.billing_cycle,
          data.amount_cents,
          data.payment_method,
        ],
      );

      const id = safeFirstRow<{ id: string }>(dbResult)?.id;
      if (!id) {
        return c.json(
          {
            error: {
              code: "CREATE_ERROR",
              message: "Erro ao salvar assinatura",
            },
          },
          500,
        );
      }

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "billing.subscription.create",
            entityType: "billing_subscription",
            entityId: id,
            newData: { plan: data.plan, cycle: data.billing_cycle },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Assinatura criada", {
        subscriptionId: id,
        plan: data.plan,
        tenantId,
      });

      return c.json(
        { id, asaas_subscription_id: subResult.id, created: true },
        201,
      );
    } catch (error) {
      logger.error("Erro ao criar assinatura", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          error: { code: "CREATE_ERROR", message: "Erro ao criar assinatura" },
        },
        500,
      );
    }
  },
);

// GET /api/v1/billing/invoices — lista faturas do tenant
billingRoute.get(
  "/invoices",
  requirePermission("billing:read"),
  httpCache(30),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const result = await query(
        `SELECT * FROM public.billing_invoices WHERE tenant_id = $1 ORDER BY due_date DESC`,
        [tenantId],
      );
      return c.json({ invoices: safeRows(result) });
    } catch (error) {
      logger.error("Erro ao listar invoices", {
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

// POST /api/v1/billing/payments — cria pagamento avulso no Asaas
billingRoute.post(
  "/payments",
  rateLimitWrite,
  requirePermission("billing:write"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user?.tenant_id ?? null;

    try {
      const parsedBody = await safeJsonBody(c);
      if (!parsedBody.success) return parsedBody.response;
      const parsed = createBillingPaymentSchema.safeParse(parsedBody.data);

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

      if (!isAsaasConfigured()) {
        return c.json(
          {
            error: {
              code: "ASAAS_NOT_CONFIGURED",
              message: "Asaas não configurado",
            },
          },
          501,
        );
      }

      const data = parsed.data as CreateBillingPaymentInput;

      // Busca asaas_customer_id do tenant
      const subResult = await query<{ asaas_customer_id: string }>(
        "SELECT asaas_customer_id FROM public.billing_subscriptions WHERE tenant_id = $1 AND asaas_customer_id IS NOT NULL LIMIT 1",
        [tenantId],
      );
      const customerId = safeFirstRow(subResult)?.asaas_customer_id;

      if (!customerId) {
        return c.json(
          {
            error: {
              code: "NO_CUSTOMER",
              message: "Cliente não encontrado no Asaas",
            },
          },
          404,
        );
      }

      const paymentResult = await createAsaasPayment({
        customer: customerId as string,
        billingType: data.payment_method,
        value: data.amount_cents / 100,
        dueDate: data.due_date,
        description: data.description,
      });

      if ("error" in paymentResult) {
        return c.json(
          { error: { code: "ASAAS_ERROR", message: paymentResult.error } },
          502,
        );
      }

      // Salva no DB
      const dbResult = await query<{ id: string }>(
        `INSERT INTO public.billing_invoices (tenant_id, subscription_id, asaas_payment_id, amount_cents, status, payment_method, due_date, pix_qr_code, pix_copy_paste, boleto_url, boleto_barcode, invoice_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [
          tenantId,
          data.subscription_id ?? null,
          paymentResult.id,
          data.amount_cents,
          paymentResult.status,
          data.payment_method,
          data.due_date,
          paymentResult.pixQrCode ?? null,
          paymentResult.pixCopyPaste ?? null,
          paymentResult.bankSlipUrl ?? null,
          paymentResult.barCode ?? null,
          paymentResult.invoiceUrl ?? null,
        ],
      );

      const id = safeFirstRow<{ id: string }>(dbResult)?.id;
      if (!id) {
        return c.json(
          {
            error: {
              code: "CREATE_ERROR",
              message: "Erro ao salvar pagamento",
            },
          },
          500,
        );
      }

      if (user?.sub) {
        try {
          await writeAuditLog({
            userId: user.sub,
            tenantId,
            action: "billing.payment.create",
            entityType: "billing_invoice",
            entityId: id,
            newData: {
              amount: data.amount_cents,
              method: data.payment_method,
            },
          });
        } catch {
          // Audit log falhou — nao bloqueia
        }
      }

      logger.info("Pagamento criado", {
        invoiceId: id,
        asaasId: paymentResult.id,
        tenantId,
      });

      return c.json(
        {
          id,
          asaas_payment_id: paymentResult.id,
          status: paymentResult.status,
          pix_qr_code: paymentResult.pixQrCode ?? null,
          pix_copy_paste: paymentResult.pixCopyPaste ?? null,
          boleto_url: paymentResult.bankSlipUrl ?? null,
          invoice_url: paymentResult.invoiceUrl ?? null,
        },
        201,
      );
    } catch (error) {
      logger.error("Erro ao criar pagamento", {
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "CREATE_ERROR", message: "Erro ao criar pagamento" } },
        500,
      );
    }
  },
);

// GET /api/v1/billing/payments/:paymentId/status — consulta status no Asaas
billingRoute.get(
  "/payments/:paymentId/status",
  requirePermission("billing:read"),
  httpCache(15),
  async (c) => {
    const paymentId = c.req.param("paymentId");

    try {
      const result = await getAsaasPaymentStatus(paymentId);

      if ("error" in result) {
        return c.json(
          { error: { code: "ASAAS_ERROR", message: result.error } },
          502,
        );
      }

      // Atualiza status no DB
      await query(
        "UPDATE public.billing_invoices SET status = $1, paid_at = CASE WHEN $1 = 'RECEIVED' THEN timezone('utc'::text, now()) ELSE paid_at END WHERE asaas_payment_id = $2",
        [result.status, paymentId],
      );

      return c.json({ status: result.status });
    } catch (error) {
      logger.error("Erro ao consultar status pagamento", {
        paymentId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        { error: { code: "ASAAS_ERROR", message: "Erro ao consultar status" } },
        500,
      );
    }
  },
);

// POST /api/v1/billing/webhook — webhook do Asaas (publico, sem auth)
// Seguranca: valida assinatura HMAC se ASAAS_WEBHOOK_SECRET configurado
billingRoute.post("/webhook", rateLimitWrite, async (c) => {
  try {
    const parsedBody = await safeJsonBody(c);
    if (!parsedBody.success) return parsedBody.response;
    const parsed = asaasWebhookSchema.safeParse(parsedBody.data);

    if (!parsed.success) {
      return c.json(
        { received: false, error: "payment.id não encontrado" },
        400,
      );
    }

    const { event, payment } = parsed.data;

    // Verificacao de assinatura HMAC (se secret configurado)
    const webhookSecret = process.env.ASAAS_WEBHOOK_SECRET;
    if (webhookSecret) {
      const providedSig = c.req.header("X-Asaas-Signature") ?? "";
      if (!providedSig) {
        logger.warn("Asaas webhook sem assinatura", {
          paymentId: payment.id,
        });
        return c.json(
          { received: false, error: "Assinatura não fornecida" },
          401,
        );
      }

      // Verifica HMAC em tempo constante
      const { createHmac, timingSafeEqual } = await import("node:crypto");
      const bodyStr = JSON.stringify(parsedBody.data);
      const expectedSig = createHmac("sha256", webhookSecret)
        .update(bodyStr)
        .digest("hex");
      const providedBuf = Buffer.from(providedSig, "hex");
      const expectedBuf = Buffer.from(expectedSig, "hex");

      const valid =
        providedBuf.length === expectedBuf.length &&
        timingSafeEqual(providedBuf, expectedBuf);

      if (!valid) {
        logger.warn("Asaas webhook assinatura invalida", {
          paymentId: payment.id,
        });
        return c.json({ received: false, error: "Assinatura inválida" }, 401);
      }
    }

    // Atualiza status da fatura no DB
    const result = await query(
      "UPDATE public.billing_invoices SET status = $1, paid_at = CASE WHEN $1 IN ('RECEIVED', 'CONFIRMED') THEN timezone('utc'::text, now()) ELSE paid_at END WHERE asaas_payment_id = $2",
      [payment.status, payment.id],
    );

    if (result.data?.rowCount === 0) {
      logger.warn("Asaas webhook para pagamento desconhecido", {
        paymentId: payment.id,
      });
    }

    logger.info("Asaas webhook processado", {
      event,
      paymentId: payment.id,
      status: payment.status,
    });

    return c.json({
      received: true,
      event,
      payment_id: payment.id,
      status: payment.status,
    });
  } catch (error) {
    logger.error("Erro ao processar Asaas webhook", {
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json({ received: false, error: "Erro ao processar webhook" }, 500);
  }
});
