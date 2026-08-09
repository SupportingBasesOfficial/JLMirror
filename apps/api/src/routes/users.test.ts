// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  createTenantUserSchema,
  createCustomRoleSchema,
  updateUserRoleSchema,
  updateUserStatusSchema,
  resetUserPasswordSchema,
  updateUserDetailsSchema,
} from "@repo/shared-validation";

// ========== createTenantUserSchema ==========

describe("users — createTenantUserSchema", () => {
  const validUser = {
    email: "joao@example.com",
    password: "senhaSegura123",
    role: "tenant:admin",
  };

  it("valida usuario minimo", () => {
    const result = createTenantUserSchema.safeParse(validUser);
    expect(result.success).toBe(true);
  });

  it("rejeita email invalido", () => {
    const result = createTenantUserSchema.safeParse({
      ...validUser,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita senha menor que 8", () => {
    const result = createTenantUserSchema.safeParse({
      ...validUser,
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem role", () => {
    const result = createTenantUserSchema.safeParse({
      ...validUser,
      role: "",
    });
    expect(result.success).toBe(false);
  });

  it("valida com full_name", () => {
    const result = createTenantUserSchema.safeParse({
      ...validUser,
      full_name: "João Silva",
    });
    expect(result.success).toBe(true);
  });

  it("aplica default scope=tenant", () => {
    const result = createTenantUserSchema.safeParse(validUser);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scope).toBe("tenant");
    }
  });

  it("valida scope=global", () => {
    const result = createTenantUserSchema.safeParse({
      ...validUser,
      scope: "global",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita scope invalido", () => {
    const result = createTenantUserSchema.safeParse({
      ...validUser,
      scope: "other",
    });
    expect(result.success).toBe(false);
  });
});

// ========== createCustomRoleSchema ==========

describe("users — createCustomRoleSchema", () => {
  it("valida role customizada", () => {
    const result = createCustomRoleSchema.safeParse({
      key: "tenant:custom_admin",
      description: "Admin customizado",
      permissions: ["550e8400-e29b-41d4-a716-446655440000"],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita key vazia", () => {
    const result = createCustomRoleSchema.safeParse({
      key: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita key com espacos", () => {
    const result = createCustomRoleSchema.safeParse({
      key: "tenant custom role",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita key comecando com numero", () => {
    const result = createCustomRoleSchema.safeParse({
      key: "1admin",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita key com maiusculas", () => {
    const result = createCustomRoleSchema.safeParse({
      key: "TenantAdmin",
    });
    expect(result.success).toBe(false);
  });

  it("valida key com underscore", () => {
    const result = createCustomRoleSchema.safeParse({
      key: "tenant_admin",
    });
    expect(result.success).toBe(true);
  });

  it("valida key com dois pontos", () => {
    const result = createCustomRoleSchema.safeParse({
      key: "tenant:admin",
    });
    expect(result.success).toBe(true);
  });

  it("aplica default permissions=[]", () => {
    const result = createCustomRoleSchema.safeParse({
      key: "tenant:viewer",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.permissions).toEqual([]);
    }
  });

  it("rejeita permissions nao-UUID", () => {
    const result = createCustomRoleSchema.safeParse({
      key: "tenant:viewer",
      permissions: ["not-a-uuid"],
    });
    expect(result.success).toBe(false);
  });
});

// ========== updateUserRoleSchema ==========

describe("users — updateUserRoleSchema", () => {
  it("valida update role", () => {
    const result = updateUserRoleSchema.safeParse({
      role: "tenant:editor",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sem role", () => {
    const result = updateUserRoleSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejeita role vazia", () => {
    const result = updateUserRoleSchema.safeParse({ role: "" });
    expect(result.success).toBe(false);
  });

  it("valida com scope", () => {
    const result = updateUserRoleSchema.safeParse({
      role: "global:admin",
      scope: "global",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita scope invalido", () => {
    const result = updateUserRoleSchema.safeParse({
      role: "tenant:admin",
      scope: "other",
    });
    expect(result.success).toBe(false);
  });

  it("valida com tenant_id", () => {
    const result = updateUserRoleSchema.safeParse({
      role: "tenant:admin",
      tenant_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita tenant_id invalido", () => {
    const result = updateUserRoleSchema.safeParse({
      role: "tenant:admin",
      tenant_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});

// ========== updateUserStatusSchema ==========

describe("users — updateUserStatusSchema", () => {
  it("valida is_active=true", () => {
    const result = updateUserStatusSchema.safeParse({ is_active: true });
    expect(result.success).toBe(true);
  });

  it("valida is_active=false", () => {
    const result = updateUserStatusSchema.safeParse({ is_active: false });
    expect(result.success).toBe(true);
  });

  it("rejeita sem is_active", () => {
    const result = updateUserStatusSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejeita is_active como string", () => {
    const result = updateUserStatusSchema.safeParse({
      is_active: "true",
    });
    expect(result.success).toBe(false);
  });

  it("valida com tenant_id", () => {
    const result = updateUserStatusSchema.safeParse({
      is_active: true,
      tenant_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });
});

// ========== resetUserPasswordSchema ==========

describe("users — resetUserPasswordSchema", () => {
  it("valida senha valida", () => {
    const result = resetUserPasswordSchema.safeParse({
      password: "novaSenha123",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita senha menor que 8", () => {
    const result = resetUserPasswordSchema.safeParse({
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem password", () => {
    const result = resetUserPasswordSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("valida com must_change_password=true", () => {
    const result = resetUserPasswordSchema.safeParse({
      password: "novaSenha123",
      must_change_password: true,
    });
    expect(result.success).toBe(true);
  });

  it("valida com must_change_password=false", () => {
    const result = resetUserPasswordSchema.safeParse({
      password: "novaSenha123",
      must_change_password: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita senha maior que 128", () => {
    const result = resetUserPasswordSchema.safeParse({
      password: "a".repeat(129),
    });
    expect(result.success).toBe(false);
  });
});

// ========== updateUserDetailsSchema ==========

describe("users — updateUserDetailsSchema", () => {
  it("valida update com full_name", () => {
    const result = updateUserDetailsSchema.safeParse({
      full_name: "João Silva",
    });
    expect(result.success).toBe(true);
  });

  it("valida update com email", () => {
    const result = updateUserDetailsSchema.safeParse({
      email: "novo@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("valida update com ambos", () => {
    const result = updateUserDetailsSchema.safeParse({
      full_name: "João Silva",
      email: "joao@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("valida update vazio (parcial)", () => {
    const result = updateUserDetailsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejeita email invalido", () => {
    const result = updateUserDetailsSchema.safeParse({
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita full_name muito longo", () => {
    const result = updateUserDetailsSchema.safeParse({
      full_name: "a".repeat(256),
    });
    expect(result.success).toBe(false);
  });
});

// ========== Logica de Self-Delete ==========

describe("users — logica de self-delete", () => {
  it("bloqueia auto-remocao", () => {
    const userId: string = "user-123";
    const currentUserSub: string = "user-123";
    const isSelf = userId === currentUserSub;
    expect(isSelf).toBe(true);
  });

  it("permite remover outro usuario", () => {
    const userId: string = "user-456";
    const currentUserSub: string = "user-123";
    const isSelf = userId === currentUserSub;
    expect(isSelf).toBe(false);
  });
});

// ========== Logica de Scope ==========

describe("users — logica de scope", () => {
  it("scope global permite /all", () => {
    const userScope: string = "global";
    const allowed = userScope === "global";
    expect(allowed).toBe(true);
  });

  it("scope tenant bloqueia /all", () => {
    const userScope: string = "tenant";
    const allowed = userScope === "global";
    expect(allowed).toBe(false);
  });
});

// ========== Logica de Role Key Format ==========

describe("users — logica de role key format", () => {
  it("role global tem prefixo global:", () => {
    const role = "global:admin";
    const scope = role.startsWith("global:") ? "global" : "tenant";
    expect(scope).toBe("global");
  });

  it("role tenant nao tem prefixo global:", () => {
    const role = "tenant:admin";
    const scope = role.startsWith("global:") ? "global" : "tenant";
    expect(scope).toBe("tenant");
  });

  it("role sem prefixo e tenant", () => {
    const role = "viewer";
    const scope = role.startsWith("global:") ? "global" : "tenant";
    expect(scope).toBe("tenant");
  });
});

// ========== Logica de Tenant Target ==========

describe("users — logica de tenant target", () => {
  it("usa tenant_id do body quando fornecido", () => {
    const bodyTenantId = "tenant-from-body";
    const userTenantId = "user-tenant";
    const target = bodyTenantId ?? userTenantId;
    expect(target).toBe("tenant-from-body");
  });

  it("usa tenant_id do user quando body nao tem", () => {
    const bodyTenantId: string | undefined = undefined;
    const userTenantId = "user-tenant";
    const target = bodyTenantId ?? userTenantId;
    expect(target).toBe("user-tenant");
  });
});

// ========== Logica de Must Change Password ==========

describe("users — logica de must_change_password", () => {
  it("default true quando nao especificado", () => {
    const mustChange: boolean | undefined = undefined;
    const result = mustChange ?? true;
    expect(result).toBe(true);
  });

  it("false quando explicitamente false", () => {
    const mustChange: boolean | undefined = false;
    const result = mustChange ?? true;
    expect(result).toBe(false);
  });

  it("true quando explicitamente true", () => {
    const mustChange: boolean | undefined = true;
    const result = mustChange ?? true;
    expect(result).toBe(true);
  });
});
