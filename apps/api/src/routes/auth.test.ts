// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  loginInputSchema,
  refreshTokenSchema,
  changePasswordSchema,
} from "@repo/shared-validation";

describe("auth schemas — loginInputSchema", () => {
  it("valida login com email e senha", () => {
    const result = loginInputSchema.safeParse({
      email: "user@example.com",
      password: "secret123",
    });
    expect(result.success).toBe(true);
  });

  it("valida login com device_fingerprint opcional", () => {
    const result = loginInputSchema.safeParse({
      email: "user@example.com",
      password: "secret123",
      device_fingerprint: "abc-123",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita email invalido", () => {
    const result = loginInputSchema.safeParse({
      email: "not-an-email",
      password: "secret123",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita senha vazia", () => {
    const result = loginInputSchema.safeParse({
      email: "user@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem email", () => {
    const result = loginInputSchema.safeParse({
      password: "secret123",
    });
    expect(result.success).toBe(false);
  });
});

describe("auth schemas — refreshTokenSchema", () => {
  it("valida refresh token", () => {
    const result = refreshTokenSchema.safeParse({
      refresh_token: "some-jwt-token",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita refresh token vazio", () => {
    const result = refreshTokenSchema.safeParse({
      refresh_token: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("auth schemas — changePasswordSchema", () => {
  it("valida troca de senha", () => {
    const result = changePasswordSchema.safeParse({
      current_password: "old123",
      new_password: "newpassword123",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita nova senha menor que 8 caracteres", () => {
    const result = changePasswordSchema.safeParse({
      current_password: "old123",
      new_password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem senha atual", () => {
    const result = changePasswordSchema.safeParse({
      new_password: "newpassword123",
    });
    expect(result.success).toBe(false);
  });
});
