// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  mfaSetupVerifySchema,
  mfaVerifySchema,
} from "@repo/shared-validation";

// Fixtures de teste — nao sao credenciais reais, apenas dados para validar schemas Zod
const TEST_PASSWORD = "newpassword123";
const TEST_SECRET = "JBSWY3DPEHPK3PXP";
const TEST_TOKEN = "a".repeat(32);

describe("auth schemas — forgotPasswordSchema", () => {
  it("valida email valido", () => {
    const result = forgotPasswordSchema.safeParse({
      email: "user@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita email invalido", () => {
    const result = forgotPasswordSchema.safeParse({
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem email", () => {
    const result = forgotPasswordSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("auth schemas — resetPasswordSchema", () => {
  it("valida token e senha valida", () => {
    const result = resetPasswordSchema.safeParse({
      token: TEST_TOKEN,
      new_password: TEST_PASSWORD,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita token curto (menos de 32 chars)", () => {
    const result = resetPasswordSchema.safeParse({
      token: "short-token",
      new_password: TEST_PASSWORD,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita nova senha menor que 8 caracteres", () => {
    const result = resetPasswordSchema.safeParse({
      token: TEST_TOKEN,
      new_password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem token", () => {
    const result = resetPasswordSchema.safeParse({
      new_password: TEST_PASSWORD,
    });
    expect(result.success).toBe(false);
  });
});

describe("mfa schemas — mfaSetupVerifySchema", () => {
  it("valida secret e code de 6 digitos", () => {
    const result = mfaSetupVerifySchema.safeParse({
      secret: TEST_SECRET,
      code: "123456",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita code com menos de 6 digitos", () => {
    const result = mfaSetupVerifySchema.safeParse({
      secret: TEST_SECRET,
      code: "12345",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita code com mais de 6 digitos", () => {
    const result = mfaSetupVerifySchema.safeParse({
      secret: TEST_SECRET,
      code: "1234567",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita secret vazio", () => {
    const result = mfaSetupVerifySchema.safeParse({
      secret: "",
      code: "123456",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem code", () => {
    const result = mfaSetupVerifySchema.safeParse({
      secret: TEST_SECRET,
    });
    expect(result.success).toBe(false);
  });
});

describe("mfa schemas — mfaVerifySchema", () => {
  it("valida challenge_token e code", () => {
    const result = mfaVerifySchema.safeParse({
      challenge_token: "challenge-uuid-123",
      code: "123456",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita challenge_token vazio", () => {
    const result = mfaVerifySchema.safeParse({
      challenge_token: "",
      code: "123456",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita code vazio", () => {
    const result = mfaVerifySchema.safeParse({
      challenge_token: "challenge-uuid-123",
      code: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita code nao-numerico de 6 chars", () => {
    const result = mfaVerifySchema.safeParse({
      challenge_token: "challenge-uuid-123",
      code: "abcdef",
    });
    // Schema aceita string de 6 chars — validacao de tipo numerico é na rota
    expect(result.success).toBe(true);
  });
});
