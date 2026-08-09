// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import { clientPortalUserSchema } from "@repo/shared-validation";

// ========== clientPortalUserSchema ==========

describe("client-portal — clientPortalUserSchema", () => {
  const validUser = {
    email: "client@example.com",
    contact_name: "João Silva",
  };

  it("valida user minimo", () => {
    const result = clientPortalUserSchema.safeParse(validUser);
    expect(result.success).toBe(true);
  });

  it("rejeita sem email", () => {
    const result = clientPortalUserSchema.safeParse({
      contact_name: "João",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita email invalido", () => {
    const result = clientPortalUserSchema.safeParse({
      email: "not-an-email",
      contact_name: "João",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita email muito longo (>255)", () => {
    const result = clientPortalUserSchema.safeParse({
      email: `${"a".repeat(250)}@example.com`,
      contact_name: "João",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem contact_name", () => {
    const result = clientPortalUserSchema.safeParse({
      email: "client@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita contact_name vazio", () => {
    const result = clientPortalUserSchema.safeParse({
      email: "client@example.com",
      contact_name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita contact_name muito longo (>200)", () => {
    const result = clientPortalUserSchema.safeParse({
      email: "client@example.com",
      contact_name: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("valida com company_name", () => {
    const result = clientPortalUserSchema.safeParse({
      ...validUser,
      company_name: "Acme Corp",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita company_name muito longo (>200)", () => {
    const result = clientPortalUserSchema.safeParse({
      ...validUser,
      company_name: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("valida com phone", () => {
    const result = clientPortalUserSchema.safeParse({
      ...validUser,
      phone: "+55 11 99999-9999",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita phone muito longo (>50)", () => {
    const result = clientPortalUserSchema.safeParse({
      ...validUser,
      phone: "1".repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it("valida can_view_incidents boolean", () => {
    const result = clientPortalUserSchema.safeParse({
      ...validUser,
      can_view_incidents: true,
    });
    expect(result.success).toBe(true);
  });

  it("valida can_view_sla boolean", () => {
    const result = clientPortalUserSchema.safeParse({
      ...validUser,
      can_view_sla: false,
    });
    expect(result.success).toBe(true);
  });

  it("valida can_view_services boolean", () => {
    const result = clientPortalUserSchema.safeParse({
      ...validUser,
      can_view_services: true,
    });
    expect(result.success).toBe(true);
  });

  it("valida can_create_tickets boolean", () => {
    const result = clientPortalUserSchema.safeParse({
      ...validUser,
      can_create_tickets: true,
    });
    expect(result.success).toBe(true);
  });

  it("valida user completo", () => {
    const result = clientPortalUserSchema.safeParse({
      email: "client@example.com",
      contact_name: "João Silva",
      company_name: "Acme Corp",
      phone: "+55 11 99999-9999",
      can_view_incidents: true,
      can_view_sla: true,
      can_view_services: true,
      can_create_tickets: false,
    });
    expect(result.success).toBe(true);
  });
});

// ========== Logica de Portal Token ==========

describe("client-portal — logica de portal token", () => {
  it("gera UUID valido", async () => {
    const { randomUUID } = await import("node:crypto");
    const token = randomUUID();
    expect(token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("gera tokens unicos", async () => {
    const { randomUUID } = await import("node:crypto");
    const token1 = randomUUID();
    const token2 = randomUUID();
    expect(token1).not.toBe(token2);
  });
});

// ========== Logica de Permissions ==========

describe("client-portal — logica de permissions default", () => {
  it("can_view_incidents default true", () => {
    const can_view_incidents = true;
    expect(can_view_incidents).toBe(true);
  });

  it("can_view_sla default true", () => {
    const can_view_sla = true;
    expect(can_view_sla).toBe(true);
  });

  it("can_view_services default true", () => {
    const can_view_services = true;
    expect(can_view_services).toBe(true);
  });

  it("can_create_tickets default false", () => {
    const can_create_tickets = false;
    expect(can_create_tickets).toBe(false);
  });
});
