// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  createRoleSchema,
  assignRolePermissionsSchema,
} from "@repo/shared-validation";

describe("rbac schemas — createRoleSchema", () => {
  it("valida criacao de role com permissoes", () => {
    const result = createRoleSchema.safeParse({
      name: "admin",
      permissions: ["zabbix:read", "zabbix:write"],
    });
    expect(result.success).toBe(true);
  });

  it("valida criacao de role sem permissoes (default [])", () => {
    const result = createRoleSchema.safeParse({
      name: "viewer",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.permissions).toEqual([]);
    }
  });

  it("valida criacao de role com descricao opcional", () => {
    const result = createRoleSchema.safeParse({
      name: "operator",
      description: "Operador de turno",
      permissions: ["zabbix:read"],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita role sem name", () => {
    const result = createRoleSchema.safeParse({
      permissions: ["zabbix:read"],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita role com name vazio", () => {
    const result = createRoleSchema.safeParse({
      name: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("rbac schemas — assignRolePermissionsSchema", () => {
  it("valida atribuicao de permissoes", () => {
    const result = assignRolePermissionsSchema.safeParse({
      role_id: "550e8400-e29b-41d4-a716-446655440000",
      permissions: ["zabbix:read", "zabbix:write"],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita role_id nao-UUID", () => {
    const result = assignRolePermissionsSchema.safeParse({
      role_id: "not-a-uuid",
      permissions: ["zabbix:read"],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem role_id", () => {
    const result = assignRolePermissionsSchema.safeParse({
      permissions: ["zabbix:read"],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem permissions", () => {
    const result = assignRolePermissionsSchema.safeParse({
      role_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(false);
  });
});
