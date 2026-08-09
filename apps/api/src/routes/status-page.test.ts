// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import { statusPageConfigSchema } from "@repo/shared-validation";

// ========== statusPageConfigSchema ==========

describe("status-page — statusPageConfigSchema", () => {
  const validConfig = {
    slug: "acme-status",
    company_name: "Acme Corp",
  };

  it("valida config minima", () => {
    const result = statusPageConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it("rejeita sem slug", () => {
    const result = statusPageConfigSchema.safeParse({
      ...validConfig,
      slug: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita slug com espacos", () => {
    const result = statusPageConfigSchema.safeParse({
      ...validConfig,
      slug: "acme status",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita slug com maiusculas", () => {
    const result = statusPageConfigSchema.safeParse({
      ...validConfig,
      slug: "Acme-Status",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita slug com caracteres especiais", () => {
    const result = statusPageConfigSchema.safeParse({
      ...validConfig,
      slug: "acme_status!",
    });
    expect(result.success).toBe(false);
  });

  it("valida slug com hifens e numeros", () => {
    const result = statusPageConfigSchema.safeParse({
      ...validConfig,
      slug: "acme-status-2025",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita slug muito longo (>100)", () => {
    const result = statusPageConfigSchema.safeParse({
      ...validConfig,
      slug: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem company_name", () => {
    const result = statusPageConfigSchema.safeParse({
      slug: "acme-status",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita company_name muito longo (>200)", () => {
    const result = statusPageConfigSchema.safeParse({
      ...validConfig,
      company_name: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("valida page_title", () => {
    const result = statusPageConfigSchema.safeParse({
      ...validConfig,
      page_title: "Status do Sistema",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita page_title muito longo (>200)", () => {
    const result = statusPageConfigSchema.safeParse({
      ...validConfig,
      page_title: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("valida logo_url", () => {
    const result = statusPageConfigSchema.safeParse({
      ...validConfig,
      logo_url: "https://example.com/logo.png",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita logo_url invalida", () => {
    const result = statusPageConfigSchema.safeParse({
      ...validConfig,
      logo_url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("valida primary_color hex", () => {
    const result = statusPageConfigSchema.safeParse({
      ...validConfig,
      primary_color: "#0d9488",
    });
    expect(result.success).toBe(true);
  });

  it("valida primary_color hex curto", () => {
    const result = statusPageConfigSchema.safeParse({
      ...validConfig,
      primary_color: "#fff",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita primary_color invalido", () => {
    const result = statusPageConfigSchema.safeParse({
      ...validConfig,
      primary_color: "teal",
    });
    expect(result.success).toBe(false);
  });

  it("valida show_uptime boolean", () => {
    const result = statusPageConfigSchema.safeParse({
      ...validConfig,
      show_uptime: true,
    });
    expect(result.success).toBe(true);
  });

  it("valida days_of_history", () => {
    const result = statusPageConfigSchema.safeParse({
      ...validConfig,
      days_of_history: 90,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita days_of_history < 1", () => {
    const result = statusPageConfigSchema.safeParse({
      ...validConfig,
      days_of_history: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita days_of_history > 365", () => {
    const result = statusPageConfigSchema.safeParse({
      ...validConfig,
      days_of_history: 400,
    });
    expect(result.success).toBe(false);
  });

  it("valida support_email", () => {
    const result = statusPageConfigSchema.safeParse({
      ...validConfig,
      support_email: "support@acme.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita support_email invalido", () => {
    const result = statusPageConfigSchema.safeParse({
      ...validConfig,
      support_email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("valida support_url", () => {
    const result = statusPageConfigSchema.safeParse({
      ...validConfig,
      support_url: "https://support.acme.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita support_url invalida", () => {
    const result = statusPageConfigSchema.safeParse({
      ...validConfig,
      support_url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("valida is_published boolean", () => {
    const result = statusPageConfigSchema.safeParse({
      ...validConfig,
      is_published: true,
    });
    expect(result.success).toBe(true);
  });

  it("valida config completa", () => {
    const result = statusPageConfigSchema.safeParse({
      slug: "acme-status",
      page_title: "Status do Sistema",
      company_name: "Acme Corp",
      logo_url: "https://example.com/logo.png",
      primary_color: "#0d9488",
      show_uptime: true,
      show_incident_history: true,
      show_sla_percentage: false,
      days_of_history: 90,
      support_email: "support@acme.com",
      support_url: "https://support.acme.com",
      is_published: true,
    });
    expect(result.success).toBe(true);
  });
});

// ========== Logica de Overall Status ==========

describe("status-page — logica de overall status", () => {
  function calcOverallStatus(
    services: Array<{ status: string }>,
  ): "operational" | "degraded" | "down" {
    const hasDown = services.some((s) => s.status === "down");
    const hasDegraded = services.some((s) => s.status === "degraded");
    return hasDown ? "down" : hasDegraded ? "degraded" : "operational";
  }

  it("todos operational retorna operational", () => {
    const result = calcOverallStatus([
      { status: "operational" },
      { status: "operational" },
    ]);
    expect(result).toBe("operational");
  });

  it("um degraded retorna degraded", () => {
    const result = calcOverallStatus([
      { status: "operational" },
      { status: "degraded" },
    ]);
    expect(result).toBe("degraded");
  });

  it("um down retorna down (mesmo com degraded)", () => {
    const result = calcOverallStatus([
      { status: "operational" },
      { status: "degraded" },
      { status: "down" },
    ]);
    expect(result).toBe("down");
  });

  it("lista vazia retorna operational", () => {
    const result = calcOverallStatus([]);
    expect(result).toBe("operational");
  });

  it("todos down retorna down", () => {
    const result = calcOverallStatus([{ status: "down" }, { status: "down" }]);
    expect(result).toBe("down");
  });
});
