// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import { z } from "zod";

// Schemas de billing — replicados para teste (mesmo padrão do route)
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

describe("billing schemas — createSubscriptionSchema", () => {
  it("valida assinatura completa", () => {
    const result = createSubscriptionSchema.safeParse({
      plan: "pro",
      billing_cycle: "monthly",
      payment_method: "PIX",
      amount_cents: 9900,
      customer_name: "Empresa XYZ",
      customer_email: "contato@xyz.com",
      customer_cpf_cnpj: "12345678000199",
    });
    expect(result.success).toBe(true);
  });

  it("aplica defaults para plan, billing_cycle e payment_method", () => {
    const result = createSubscriptionSchema.safeParse({
      amount_cents: 4900,
      customer_name: "Empresa ABC",
      customer_email: "abc@test.com",
      customer_cpf_cnpj: "12345678000199",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.plan).toBe("starter");
      expect(result.data.billing_cycle).toBe("monthly");
      expect(result.data.payment_method).toBe("PIX");
    }
  });

  it("rejeita plan invalido", () => {
    const result = createSubscriptionSchema.safeParse({
      plan: "free",
      amount_cents: 100,
      customer_name: "Test",
      customer_email: "t@t.com",
      customer_cpf_cnpj: "12345678000199",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita amount_cents negativo", () => {
    const result = createSubscriptionSchema.safeParse({
      amount_cents: -100,
      customer_name: "Test",
      customer_email: "t@t.com",
      customer_cpf_cnpj: "12345678000199",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita email invalido", () => {
    const result = createSubscriptionSchema.safeParse({
      amount_cents: 100,
      customer_name: "Test",
      customer_email: "not-an-email",
      customer_cpf_cnpj: "12345678000199",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita cpf/cnpj muito curto", () => {
    const result = createSubscriptionSchema.safeParse({
      amount_cents: 100,
      customer_name: "Test",
      customer_email: "t@t.com",
      customer_cpf_cnpj: "123",
    });
    expect(result.success).toBe(false);
  });
});

describe("billing schemas — createPaymentSchema", () => {
  it("valida pagamento PIX", () => {
    const result = createPaymentSchema.safeParse({
      amount_cents: 9900,
      payment_method: "PIX",
      due_date: "2026-01-15",
    });
    expect(result.success).toBe(true);
  });

  it("valida pagamento com subscription_id", () => {
    const result = createPaymentSchema.safeParse({
      subscription_id: "550e8400-e29b-41d4-a716-446655440000",
      amount_cents: 9900,
      payment_method: "BOLETO",
      due_date: "2026-01-15",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita subscription_id invalido (nao UUID)", () => {
    const result = createPaymentSchema.safeParse({
      subscription_id: "not-a-uuid",
      amount_cents: 9900,
      payment_method: "PIX",
      due_date: "2026-01-15",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita payment_method invalido", () => {
    const result = createPaymentSchema.safeParse({
      amount_cents: 9900,
      payment_method: "PAYPAL",
      due_date: "2026-01-15",
    });
    expect(result.success).toBe(false);
  });
});
