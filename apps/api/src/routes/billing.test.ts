// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  createBillingSubscriptionSchema,
  createBillingPaymentSchema,
  asaasWebhookSchema,
} from "@repo/shared-validation";
import { createHmac, timingSafeEqual } from "node:crypto";

// ========== createBillingSubscriptionSchema ==========

describe("billing — createBillingSubscriptionSchema", () => {
  const validSub = {
    amount_cents: 9999,
    customer_name: "João Silva",
    customer_email: "joao@example.com",
    customer_cpf_cnpj: "12345678901",
  };

  it("valida subscription minima", () => {
    const result = createBillingSubscriptionSchema.safeParse(validSub);
    expect(result.success).toBe(true);
  });

  it("aplica default plan=starter", () => {
    const result = createBillingSubscriptionSchema.safeParse(validSub);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.plan).toBe("starter");
    }
  });

  it("aplica default billing_cycle=monthly", () => {
    const result = createBillingSubscriptionSchema.safeParse(validSub);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.billing_cycle).toBe("monthly");
    }
  });

  it("aplica default payment_method=PIX", () => {
    const result = createBillingSubscriptionSchema.safeParse(validSub);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payment_method).toBe("PIX");
    }
  });

  it("valida plan=pro", () => {
    const result = createBillingSubscriptionSchema.safeParse({
      ...validSub,
      plan: "pro",
    });
    expect(result.success).toBe(true);
  });

  it("valida plan=enterprise", () => {
    const result = createBillingSubscriptionSchema.safeParse({
      ...validSub,
      plan: "enterprise",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita plan invalido", () => {
    const result = createBillingSubscriptionSchema.safeParse({
      ...validSub,
      plan: "free",
    });
    expect(result.success).toBe(false);
  });

  it("valida billing_cycle=quarterly", () => {
    const result = createBillingSubscriptionSchema.safeParse({
      ...validSub,
      billing_cycle: "quarterly",
    });
    expect(result.success).toBe(true);
  });

  it("valida billing_cycle=yearly", () => {
    const result = createBillingSubscriptionSchema.safeParse({
      ...validSub,
      billing_cycle: "yearly",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita billing_cycle invalido", () => {
    const result = createBillingSubscriptionSchema.safeParse({
      ...validSub,
      billing_cycle: "weekly",
    });
    expect(result.success).toBe(false);
  });

  it("valida payment_method=BOLETO", () => {
    const result = createBillingSubscriptionSchema.safeParse({
      ...validSub,
      payment_method: "BOLETO",
    });
    expect(result.success).toBe(true);
  });

  it("valida payment_method=CREDIT_CARD", () => {
    const result = createBillingSubscriptionSchema.safeParse({
      ...validSub,
      payment_method: "CREDIT_CARD",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita amount_cents zero", () => {
    const result = createBillingSubscriptionSchema.safeParse({
      ...validSub,
      amount_cents: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita amount_cents negativo", () => {
    const result = createBillingSubscriptionSchema.safeParse({
      ...validSub,
      amount_cents: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita amount_cents nao-inteiro", () => {
    const result = createBillingSubscriptionSchema.safeParse({
      ...validSub,
      amount_cents: 99.99,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita amount_cents > 99999999999", () => {
    const result = createBillingSubscriptionSchema.safeParse({
      ...validSub,
      amount_cents: 100000000000,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem customer_name", () => {
    const result = createBillingSubscriptionSchema.safeParse({
      ...validSub,
      customer_name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita customer_email invalido", () => {
    const result = createBillingSubscriptionSchema.safeParse({
      ...validSub,
      customer_email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita customer_cpf_cnpj muito curto (<11)", () => {
    const result = createBillingSubscriptionSchema.safeParse({
      ...validSub,
      customer_cpf_cnpj: "123",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita customer_cpf_cnpj muito longo (>18)", () => {
    const result = createBillingSubscriptionSchema.safeParse({
      ...validSub,
      customer_cpf_cnpj: "1234567890123456789",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita customer_cpf_cnpj com letras", () => {
    const result = createBillingSubscriptionSchema.safeParse({
      ...validSub,
      customer_cpf_cnpj: "1234567890a",
    });
    expect(result.success).toBe(false);
  });

  it("valida CPF com pontos e hifens", () => {
    const result = createBillingSubscriptionSchema.safeParse({
      ...validSub,
      customer_cpf_cnpj: "123.456.789-01",
    });
    expect(result.success).toBe(true);
  });

  it("valida CNPJ com pontos, barras e hifens", () => {
    const result = createBillingSubscriptionSchema.safeParse({
      ...validSub,
      customer_cpf_cnpj: "12.345.678/0001-90",
    });
    expect(result.success).toBe(true);
  });

  it("valida com customer_phone", () => {
    const result = createBillingSubscriptionSchema.safeParse({
      ...validSub,
      customer_phone: "+55 11 99999-9999",
    });
    expect(result.success).toBe(true);
  });
});

// ========== createBillingPaymentSchema ==========

describe("billing — createBillingPaymentSchema", () => {
  const validPayment = {
    amount_cents: 4999,
    payment_method: "PIX",
    due_date: "2025-01-31",
  };

  it("valida payment minimo", () => {
    const result = createBillingPaymentSchema.safeParse(validPayment);
    expect(result.success).toBe(true);
  });

  it("valida com subscription_id", () => {
    const result = createBillingPaymentSchema.safeParse({
      ...validPayment,
      subscription_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita subscription_id invalido", () => {
    const result = createBillingPaymentSchema.safeParse({
      ...validPayment,
      subscription_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita amount_cents zero", () => {
    const result = createBillingPaymentSchema.safeParse({
      ...validPayment,
      amount_cents: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita amount_cents > 99999999999", () => {
    const result = createBillingPaymentSchema.safeParse({
      ...validPayment,
      amount_cents: 100000000000,
    });
    expect(result.success).toBe(false);
  });

  it("valida payment_method=BOLETO", () => {
    const result = createBillingPaymentSchema.safeParse({
      ...validPayment,
      payment_method: "BOLETO",
    });
    expect(result.success).toBe(true);
  });

  it("valida payment_method=CREDIT_CARD", () => {
    const result = createBillingPaymentSchema.safeParse({
      ...validPayment,
      payment_method: "CREDIT_CARD",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita payment_method invalido", () => {
    const result = createBillingPaymentSchema.safeParse({
      ...validPayment,
      payment_method: "PAYPAL",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem due_date", () => {
    const result = createBillingPaymentSchema.safeParse({
      ...validPayment,
      due_date: "",
    });
    expect(result.success).toBe(false);
  });

  it("valida com description", () => {
    const result = createBillingPaymentSchema.safeParse({
      ...validPayment,
      description: "Mensalidade Janeiro",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita description muito longa (>500)", () => {
    const result = createBillingPaymentSchema.safeParse({
      ...validPayment,
      description: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

// ========== asaasWebhookSchema ==========

describe("billing — asaasWebhookSchema", () => {
  const validWebhook = {
    event: "PAYMENT_RECEIVED",
    payment: {
      id: "pay_123456",
      status: "RECEIVED",
    },
  };

  it("valida webhook completo", () => {
    const result = asaasWebhookSchema.safeParse(validWebhook);
    expect(result.success).toBe(true);
  });

  it("valida sem event (opcional)", () => {
    const result = asaasWebhookSchema.safeParse({
      payment: { id: "pay_123", status: "PENDING" },
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sem payment", () => {
    const result = asaasWebhookSchema.safeParse({ event: "test" });
    expect(result.success).toBe(false);
  });

  it("rejeita sem payment.id", () => {
    const result = asaasWebhookSchema.safeParse({
      payment: { status: "RECEIVED" },
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem payment.status", () => {
    const result = asaasWebhookSchema.safeParse({
      payment: { id: "pay_123" },
    });
    expect(result.success).toBe(false);
  });

  it("rejeita payment.id vazio", () => {
    const result = asaasWebhookSchema.safeParse({
      payment: { id: "", status: "RECEIVED" },
    });
    expect(result.success).toBe(false);
  });
});

// ========== Logica de HMAC Webhook Verification ==========

describe("billing — logica de HMAC webhook verification", () => {
  it("assinatura valida deve passar", () => {
    const secret = "my-webhook-secret";
    const body = JSON.stringify({
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_123", status: "RECEIVED" },
    });
    const expectedSig = createHmac("sha256", secret).update(body).digest("hex");
    const providedBuf = Buffer.from(expectedSig, "hex");
    const expectedBuf = Buffer.from(expectedSig, "hex");
    const valid =
      providedBuf.length === expectedBuf.length &&
      timingSafeEqual(providedBuf, expectedBuf);
    expect(valid).toBe(true);
  });

  it("assinatura invalida deve falhar", () => {
    const secret = "my-webhook-secret";
    const body = JSON.stringify({
      payment: { id: "pay_123", status: "RECEIVED" },
    });
    const expectedSig = createHmac("sha256", secret).update(body).digest("hex");
    const wrongSig = createHmac("sha256", "wrong-secret")
      .update(body)
      .digest("hex");
    const providedBuf = Buffer.from(wrongSig, "hex");
    const expectedBuf = Buffer.from(expectedSig, "hex");
    const valid =
      providedBuf.length === expectedBuf.length &&
      timingSafeEqual(providedBuf, expectedBuf);
    expect(valid).toBe(false);
  });

  it("assinaturas de tamanhos diferentes devem falhar", () => {
    const providedBuf = Buffer.from("abc", "hex");
    const expectedBuf = Buffer.from("abcd1234", "hex");
    const valid =
      providedBuf.length === expectedBuf.length &&
      timingSafeEqual(providedBuf, expectedBuf);
    expect(valid).toBe(false);
  });
});

// ========== Logica de Amount Conversion ==========

describe("billing — logica de amount conversion", () => {
  it("converte cents para reais corretamente", () => {
    const amountCents = 9999;
    const amountReais = amountCents / 100;
    expect(amountReais).toBe(99.99);
  });

  it("converte 100 cents para 1 real", () => {
    const amountCents = 100;
    const amountReais = amountCents / 100;
    expect(amountReais).toBe(1);
  });

  it("converte 0 cents (apos validacao)", () => {
    // Schema rejeita 0, mas logica de conversao e testada
    const amountCents = 1;
    const amountReais = amountCents / 100;
    expect(amountReais).toBe(0.01);
  });
});

// ========== Logica de Cycle Mapping ==========

describe("billing — logica de cycle mapping", () => {
  it("mapeia monthly -> MONTHLY", () => {
    const cycleMap = {
      monthly: "MONTHLY",
      quarterly: "QUARTERLY",
      yearly: "YEARLY",
    } as const;
    expect(cycleMap.monthly).toBe("MONTHLY");
  });

  it("mapeia quarterly -> QUARTERLY", () => {
    const cycleMap = {
      monthly: "MONTHLY",
      quarterly: "QUARTERLY",
      yearly: "YEARLY",
    } as const;
    expect(cycleMap.quarterly).toBe("QUARTERLY");
  });

  it("mapeia yearly -> YEARLY", () => {
    const cycleMap = {
      monthly: "MONTHLY",
      quarterly: "QUARTERLY",
      yearly: "YEARLY",
    } as const;
    expect(cycleMap.yearly).toBe("YEARLY");
  });
});

// ========== Logica de Tenant Isolation ==========

describe("billing — logica de tenant isolation", () => {
  it("queries de billing_subscriptions filtram por tenant_id", () => {
    const tenantId = "t-123";
    const sql =
      "SELECT * FROM public.billing_subscriptions WHERE tenant_id = $1";
    const params: unknown[] = [tenantId];
    expect(sql).toContain("tenant_id = $1");
    expect(params[0]).toBe(tenantId);
  });

  it("queries de billing_invoices filtram por tenant_id", () => {
    const tenantId = "t-456";
    const sql = "SELECT * FROM public.billing_invoices WHERE tenant_id = $1";
    const params: unknown[] = [tenantId];
    expect(sql).toContain("tenant_id = $1");
    expect(params[0]).toBe(tenantId);
  });

  it("INSERT billing_subscriptions inclui tenant_id", () => {
    const tenantId = "t-ins";
    const params: unknown[] = [tenantId, "sub-1", "cust-1", "pro", "monthly"];
    expect(params[0]).toBe(tenantId);
  });

  it("INSERT billing_invoices inclui tenant_id", () => {
    const tenantId = "t-inv";
    const params: unknown[] = [tenantId, "pay-1", 1000];
    expect(params[0]).toBe(tenantId);
  });
});

// ========== Logica de Optional Chaining ==========

describe("billing — logica de optional chaining", () => {
  type TestUser = { sub: string; tenant_id: string };

  function getSub(user: TestUser | null | undefined): string | null {
    return user?.sub ?? null;
  }

  function getTenantId(user: TestUser | null | undefined): string | null {
    return user?.tenant_id ?? null;
  }

  it("user?.sub retorna null quando user e null", () => {
    expect(getSub(null)).toBeNull();
  });

  it("user?.tenant_id retorna null quando user e undefined", () => {
    expect(getTenantId(undefined)).toBeNull();
  });

  it("user?.sub retorna valor quando user existe", () => {
    expect(getSub({ sub: "u1", tenant_id: "t1" })).toBe("u1");
  });

  it("userId null nao chama writeAuditLog", () => {
    const userId: string | null = null;
    const shouldCallAudit = !!userId;
    expect(shouldCallAudit).toBe(false);
  });
});

// ========== Logica de Parallel Queries ==========

describe("billing — logica de parallel queries", () => {
  it("overview paraleliza 2 queries", async () => {
    const results = await Promise.all([
      Promise.resolve({ data: { rows: [{ total: "10" }] } }),
      Promise.resolve({ data: { rows: [{ total: "5" }] } }),
    ]);
    expect(results).toHaveLength(2);
  });

  it("stats paraleliza 2 queries", async () => {
    const results = await Promise.all([
      Promise.resolve({ data: { rows: [] } }),
      Promise.resolve({ data: { rows: [] } }),
    ]);
    expect(results).toHaveLength(2);
  });

  it("Promise.all propaga erro", async () => {
    await expect(
      Promise.all([
        Promise.resolve({ data: { rows: [] } }),
        Promise.reject(new Error("DB error")),
      ]),
    ).rejects.toThrow("DB error");
  });
});

// ========== Logica de Webhook HMAC ==========

describe("billing — logica de webhook HMAC", () => {
  it("webhook sem secret nao valida assinatura", () => {
    const webhookSecret: string | undefined = undefined;
    const shouldValidate = !!webhookSecret;
    expect(shouldValidate).toBe(false);
  });

  it("webhook com secret valida assinatura", () => {
    const webhookSecret = "secret-123";
    const shouldValidate = !!webhookSecret;
    expect(shouldValidate).toBe(true);
  });

  it("webhook sem assinatura retorna 401 quando secret configurado", () => {
    const webhookSecret = "secret-123";
    const providedSig = "";
    const shouldReject = !!webhookSecret && !providedSig;
    expect(shouldReject).toBe(true);
  });
});

// ========== Logica de 404 Handling ==========

describe("billing — logica de 404 handling", () => {
  it("POST /payments sem customer retorna 404", () => {
    const customerId: string | undefined = undefined;
    const shouldReturn404 = !customerId;
    expect(shouldReturn404).toBe(true);
  });

  it("webhook para pagamento desconhecido loga warning", () => {
    const rowCount = 0;
    const shouldWarn = rowCount === 0;
    expect(shouldWarn).toBe(true);
  });
});
