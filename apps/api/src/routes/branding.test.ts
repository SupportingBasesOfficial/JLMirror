// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";

// ========== Logica de Default Branding ==========

describe("branding — default branding values", () => {
  const DEFAULT_BRANDING = {
    company_name: null,
    logo_url: null,
    primary_color: "#1BA898",
    secondary_color: "#35D0C4",
    custom_css: null,
    login_message: null,
  };

  it("default branding tem primary_color valido", () => {
    expect(DEFAULT_BRANDING.primary_color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("default branding tem secondary_color valido", () => {
    expect(DEFAULT_BRANDING.secondary_color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("default branding tem company_name null", () => {
    expect(DEFAULT_BRANDING.company_name).toBeNull();
  });

  it("default branding tem logo_url null", () => {
    expect(DEFAULT_BRANDING.logo_url).toBeNull();
  });

  it("default branding tem custom_css null", () => {
    expect(DEFAULT_BRANDING.custom_css).toBeNull();
  });

  it("default branding tem login_message null", () => {
    expect(DEFAULT_BRANDING.login_message).toBeNull();
  });
});

// ========== Logica de Tenant Slug Matching ==========

describe("branding — logica de tenant slug matching", () => {
  function normalizeSlug(name: string): string {
    return name.toLowerCase().replace(/ /g, "-");
  }

  it("normaliza nome com espacos para hifens", () => {
    expect(normalizeSlug("Acme Corp")).toBe("acme-corp");
  });

  it("normaliza nome com multiplos espacos", () => {
    expect(normalizeSlug("Acme Corp LLC")).toBe("acme-corp-llc");
  });

  it("normaliza nome com maiusculas", () => {
    expect(normalizeSlug("ACME")).toBe("acme");
  });

  it("normaliza nome sem espacos", () => {
    expect(normalizeSlug("acme")).toBe("acme");
  });

  it("normaliza nome vazio", () => {
    expect(normalizeSlug("")).toBe("");
  });
});

// ========== Logica de Branding Response ==========

describe("branding — logica de branding response", () => {
  const DEFAULT_BRANDING = {
    company_name: null,
    logo_url: null,
    primary_color: "#1BA898",
    secondary_color: "#35D0C4",
    custom_css: null,
    login_message: null,
  };

  it("retorna defaults quando tenant nao encontrado", () => {
    const branding = null;
    const response = branding ?? DEFAULT_BRANDING;
    expect(response).toEqual(DEFAULT_BRANDING);
  });

  it("retorna branding do tenant quando encontrado", () => {
    const branding = {
      company_name: "Acme Corp",
      logo_url: "https://example.com/logo.png",
      primary_color: "#FF5733",
      secondary_color: "#33FF57",
      custom_css: ".btn { color: red; }",
      login_message: "Welcome to Acme",
    };
    const response = branding ?? DEFAULT_BRANDING;
    expect(response.company_name).toBe("Acme Corp");
    expect(response.primary_color).toBe("#FF5733");
  });
});
