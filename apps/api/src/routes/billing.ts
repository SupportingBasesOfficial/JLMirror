// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Hono } from "hono";
import { query } from "@repo/db";
import { z } from "zod";
import { requirePermission } from "../middleware/require-permission.js";
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
billingRoute.get("/", requirePermission("billing:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  const subsResult = await query(
    "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'active') as active FROM public.billing_subscriptions WHERE tenant_id = $1",
    [tenantId],
  );
  const invoicesResult = await query(
    "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status IN ('PENDING','OVERDUE')) as pending FROM public.billing_invoices WHERE tenant_id = $1",
    [tenantId],
  );

  return c.json({
    overview: {
      subscriptions: subsResult.data?.rows[0] ?? { total: "0", active: "0" },
      invoices: invoicesResult.data?.rows[0] ?? { total: "0", pending: "0" },
    },
    endpoints: [
      "/subscriptions",
      "/invoices",
      "/payments",
      "/payments/:id/status",
      "/stats",
    ],
  });
});

// GET /api/v1/billing/stats — estatisticas de billing
billingRoute.get("/stats", requirePermission("billing:read"), async (c) => {
  const user = c.get("user");
  const tenantId = user?.tenant_id ?? null;

  const revenueResult = await query(
    `SELECT COALESCE(SUM(amount_cents), 0) as total_revenue,
       COUNT(*) FILTER (WHERE status IN ('RECEIVED','CONFIRMED')) as paid_invoices,
       COUNT(*) FILTER (WHERE status IN ('PENDING','OVERDUE')) as pending_invoices,
       COUNT(*) as total_invoices
     FROM public.billing_invoices WHERE tenant_id = $1`,
    [tenantId],
  );

  const subsResult = await query(
    `SELECT plan, billing_cycle, status, COUNT(*) as count
     FROM public.billing_subscriptions WHERE tenant_id = $1
     GROUP BY plan, billing_cycle, status`,
    [tenantId],
  );

  return c.json({
    revenue: revenueResult.data?.rows[0] ?? {
      total_revenue: "0",
      paid_invoices: "0",
      pending_invoices: "0",
      total_invoices: "0",
    },
    subscriptions_by_plan: subsResult.data?.rows ?? [],
  });
});

const createSubscriptionSchema = z.object({
  plan: z.enum(["starter", "pro", "enterprise"]).default("starter"),
  billing_cycle: z.enum(["monthly", "quarterly", "yearly"]).default("monthly"),
  payment_method: z.enum(["PIX", "BOLETO", "CREDIT_CARD"]).default("PIX"),
  amount_cents: z.number().int().positive(),
  customer_name: z.string().min(1),
  customer_email: z.string().email(),
  customer_cpf_cnpj: z.string().min(11),
  customer_phone: z.string().optional(),
});

const createPaymentSchema = z.object({
  subscription_id: z.string().uuid().optional(),
  amount_cents: z.number().int().positive(),
  payment_method: z.enum(["PIX", "BOLETO", "CREDIT_CARD"]),
  due_date: z.string(),
  description: z.string().optional(),
});

// GET /api/v1/billing/subscriptions — lista assinaturas do tenant
billingRoute.get(
  "/subscriptions",
  requirePermission("billing:read"),
  async (c) => {
    const user = c.get("user");
    const result = await query(
      `SELECT * FROM public.billing_subscriptions WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [user.tenant_id],
    );
    return c.json({ subscriptions: safeRows(result) });
  },
);

// POST /api/v1/billing/subscriptions — cria assinatura no Asaas e no DB
billingRoute.post(
  "/subscriptions",
  requirePermission("billing:write"),
  async (c) => {
    const user = c.get("user");
    const body = await c.req.json();
    const parsed = createSubscriptionSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
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

    const data = parsed.data;

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
        user.tenant_id,
        subResult.id,
        customerResult.id,
        data.plan,
        data.billing_cycle,
        data.amount_cents,
        data.payment_method,
      ],
    );

    const id = safeFirstRow(dbResult)?.id;
    return c.json(
      { id, asaas_subscription_id: subResult.id, created: true },
      201,
    );
  },
);

// GET /api/v1/billing/invoices — lista faturas do tenant
billingRoute.get("/invoices", requirePermission("billing:read"), async (c) => {
  const user = c.get("user");
  const result = await query(
    `SELECT * FROM public.billing_invoices WHERE tenant_id = $1 ORDER BY due_date DESC`,
    [user.tenant_id],
  );
  return c.json({ invoices: safeRows(result) });
});

// POST /api/v1/billing/payments — cria pagamento avulso no Asaas
billingRoute.post(
  "/payments",
  requirePermission("billing:write"),
  async (c) => {
    const user = c.get("user");
    const body = await c.req.json();
    const parsed = createPaymentSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos" } },
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

    const data = parsed.data;

    // Busca asaas_customer_id do tenant
    const subResult = await query<{ asaas_customer_id: string }>(
      "SELECT asaas_customer_id FROM public.billing_subscriptions WHERE tenant_id = $1 AND asaas_customer_id IS NOT NULL LIMIT 1",
      [user.tenant_id],
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
        user.tenant_id,
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

    const id = safeFirstRow(dbResult)?.id;
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
  },
);

// GET /api/v1/billing/payments/:paymentId/status — consulta status no Asaas
billingRoute.get(
  "/payments/:paymentId/status",
  requirePermission("billing:read"),
  async (c) => {
    const paymentId = c.req.param("paymentId");
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
  },
);

// POST /api/v1/billing/webhook — webhook do Asaas (publico, sem auth)
billingRoute.post("/webhook", async (c) => {
  const body = await c.req.json();

  // Asaas envia event e payment
  const event = body.event as string | undefined;
  const payment = body.payment as { id: string; status: string } | undefined;

  if (!payment?.id) {
    return c.json({ received: false, error: "payment.id não encontrado" }, 400);
  }

  // Atualiza status da fatura no DB
  await query(
    "UPDATE public.billing_invoices SET status = $1, paid_at = CASE WHEN $1 IN ('RECEIVED', 'CONFIRMED') THEN timezone('utc'::text, now()) ELSE paid_at END WHERE asaas_payment_id = $2",
    [payment.status, payment.id],
  );

  return c.json({
    received: true,
    event,
    payment_id: payment.id,
    status: payment.status,
  });
});
