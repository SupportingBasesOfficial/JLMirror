// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import { clientPortalUserSchema } from "@repo/shared-validation";

describe("client-portal schemas — clientPortalUserSchema", () => {
  it("valida usuario com campos obrigatorios", () => {
    const result = clientPortalUserSchema.safeParse({
      email: "client@empresa.com",
      contact_name: "João Silva",
    });
    expect(result.success).toBe(true);
  });

  it("valida usuario com todos os campos", () => {
    const result = clientPortalUserSchema.safeParse({
      email: "client@empresa.com",
      contact_name: "João Silva",
      company_name: "Empresa LTDA",
      phone: "+55 11 99999-9999",
      can_view_incidents: true,
      can_view_sla: true,
      can_view_services: true,
      can_create_tickets: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita email invalido", () => {
    const result = clientPortalUserSchema.safeParse({
      email: "not-an-email",
      contact_name: "João Silva",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem contact_name", () => {
    const result = clientPortalUserSchema.safeParse({
      email: "client@empresa.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita contact_name vazio", () => {
    const result = clientPortalUserSchema.safeParse({
      email: "client@empresa.com",
      contact_name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem email", () => {
    const result = clientPortalUserSchema.safeParse({
      contact_name: "João Silva",
    });
    expect(result.success).toBe(false);
  });

  it("aceita permissions como booleans opcionais", () => {
    const result = clientPortalUserSchema.safeParse({
      email: "client@empresa.com",
      contact_name: "João",
      can_view_incidents: false,
      can_create_tickets: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.can_view_incidents).toBe(false);
      expect(result.data.can_create_tickets).toBe(true);
    }
  });
});
