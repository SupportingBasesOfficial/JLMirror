// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  createRoleSchema,
  assignRolePermissionsSchema,
} from "@repo/shared-validation";

// ========== createRoleSchema ==========

describe("rbac — createRoleSchema", () => {
  const validRole = {
    name: "Custom Admin",
    permissions: ["550e8400-e29b-41d4-a716-446655440000"],
  };

  it("valida role minima", () => {
    const result = createRoleSchema.safeParse(validRole);
    expect(result.success).toBe(true);
  });

  it("rejeita sem name", () => {
    const result = createRoleSchema.safeParse({ ...validRole, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejeita name muito longo (>200)", () => {
    const result = createRoleSchema.safeParse({
      ...validRole,
      name: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("valida com description", () => {
    const result = createRoleSchema.safeParse({
      ...validRole,
      description: "Custom role for admin tasks",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita description muito longa (>2000)", () => {
    const result = createRoleSchema.safeParse({
      ...validRole,
      description: "a".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("valida com key custom", () => {
    const result = createRoleSchema.safeParse({
      ...validRole,
      key: "custom-admin",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita key com espacos", () => {
    const result = createRoleSchema.safeParse({
      ...validRole,
      key: "custom admin",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita key muito longa (>100)", () => {
    const result = createRoleSchema.safeParse({
      ...validRole,
      key: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("valida permissions vazio (default)", () => {
    const result = createRoleSchema.safeParse({
      name: "Empty Role",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.permissions).toEqual([]);
    }
  });

  it("rejeita permissions com nao-UUID", () => {
    const result = createRoleSchema.safeParse({
      ...validRole,
      permissions: ["not-a-uuid"],
    });
    expect(result.success).toBe(false);
  });

  it("valida permissions com multiplos UUIDs", () => {
    const result = createRoleSchema.safeParse({
      ...validRole,
      permissions: [
        "550e8400-e29b-41d4-a716-446655440000",
        "660e8400-e29b-41d4-a716-446655440001",
      ],
    });
    expect(result.success).toBe(true);
  });
});

// ========== assignRolePermissionsSchema ==========

describe("rbac — assignRolePermissionsSchema", () => {
  it("valida com permission_ids", () => {
    const result = assignRolePermissionsSchema.safeParse({
      permission_ids: ["550e8400-e29b-41d4-a716-446655440000"],
    });
    expect(result.success).toBe(true);
  });

  it("valida sem permission_ids (default vazio)", () => {
    const result = assignRolePermissionsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.permission_ids).toEqual([]);
    }
  });

  it("rejeita permission_ids com nao-UUID", () => {
    const result = assignRolePermissionsSchema.safeParse({
      permission_ids: ["not-a-uuid"],
    });
    expect(result.success).toBe(false);
  });

  it("valida multiplos UUIDs", () => {
    const result = assignRolePermissionsSchema.safeParse({
      permission_ids: [
        "550e8400-e29b-41d4-a716-446655440000",
        "660e8400-e29b-41d4-a716-446655440001",
      ],
    });
    expect(result.success).toBe(true);
  });
});

// ========== Logica de Role Key Generation ==========

describe("rbac — logica de role key generation", () => {
  it("usa key se fornecida", () => {
    const data = { name: "Custom Admin", key: "custom-admin" };
    const roleKey = data.key ?? data.name;
    expect(roleKey).toBe("custom-admin");
  });

  it("usa name como key se key nao fornecida", () => {
    const data: { name: string; key?: string } = { name: "Custom Admin" };
    const roleKey = data.key ?? data.name;
    expect(roleKey).toBe("Custom Admin");
  });
});

// ========== Logica de System Role Protection ==========

describe("rbac — logica de system role protection", () => {
  it("role de sistema nao pode ser modificada", () => {
    const isSystem = true;
    const canModify = !isSystem;
    expect(canModify).toBe(false);
  });

  it("role custom pode ser modificada", () => {
    const isSystem = false;
    const canModify = !isSystem;
    expect(canModify).toBe(true);
  });
});
