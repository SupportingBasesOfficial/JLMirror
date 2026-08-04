// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import { statusPageConfigSchema } from "@repo/shared-validation";

describe("status-page schemas — statusPageConfigSchema", () => {
  it("valida config minima (slug + company_name)", () => {
    const result = statusPageConfigSchema.safeParse({
      slug: "empresa-ltda",
      company_name: "Empresa LTDA",
    });
    expect(result.success).toBe(true);
  });

  it("valida config completa", () => {
    const result = statusPageConfigSchema.safeParse({
      slug: "empresa-ltda",
      page_title: "Status do Sistema",
      company_name: "Empresa LTDA",
      logo_url: "https://example.com/logo.png",
      primary_color: "#0d9488",
      show_uptime: true,
      show_incident_history: true,
      show_sla_percentage: false,
      days_of_history: 90,
      support_email: "suporte@empresa.com",
      support_url: "https://empresa.com/suporte",
      is_published: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita slug com caracteres invalidos", () => {
    const result = statusPageConfigSchema.safeParse({
      slug: "Empresa LTDA!",
      company_name: "Empresa LTDA",
    });
    expect(result.success).toBe(false);
  });

  it("aceita slug com hifens e numeros", () => {
    const result = statusPageConfigSchema.safeParse({
      slug: "empresa-2024",
      company_name: "Empresa",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita slug vazio", () => {
    const result = statusPageConfigSchema.safeParse({
      slug: "",
      company_name: "Empresa",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem company_name", () => {
    const result = statusPageConfigSchema.safeParse({
      slug: "empresa",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita company_name vazio", () => {
    const result = statusPageConfigSchema.safeParse({
      slug: "empresa",
      company_name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita days_of_history nao-inteiro", () => {
    const result = statusPageConfigSchema.safeParse({
      slug: "empresa",
      company_name: "Empresa",
      days_of_history: 30.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita days_of_history menor que 1", () => {
    const result = statusPageConfigSchema.safeParse({
      slug: "empresa",
      company_name: "Empresa",
      days_of_history: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita show_uptime como string", () => {
    const result = statusPageConfigSchema.safeParse({
      slug: "empresa",
      company_name: "Empresa",
      show_uptime: "true",
    });
    expect(result.success).toBe(false);
  });
});
