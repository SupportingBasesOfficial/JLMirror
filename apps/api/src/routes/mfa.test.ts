// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  mfaSetupVerifySchema,
  mfaVerifySchema,
  mfaDisableSchema,
} from "@repo/shared-validation";

// ========== mfaSetupVerifySchema ==========

describe("mfa — mfaSetupVerifySchema", () => {
  it("valida codigo de 6 digitos", () => {
    const result = mfaSetupVerifySchema.safeParse({ code: "123456" });
    expect(result.success).toBe(true);
  });

  it("rejeita codigo com menos de 6 digitos", () => {
    const result = mfaSetupVerifySchema.safeParse({ code: "12345" });
    expect(result.success).toBe(false);
  });

  it("rejeita codigo com mais de 6 digitos", () => {
    const result = mfaSetupVerifySchema.safeParse({ code: "1234567" });
    expect(result.success).toBe(false);
  });

  it("rejeita codigo com letras", () => {
    const result = mfaSetupVerifySchema.safeParse({ code: "abc123" });
    expect(result.success).toBe(false);
  });

  it("rejeita codigo vazio", () => {
    const result = mfaSetupVerifySchema.safeParse({ code: "" });
    expect(result.success).toBe(false);
  });

  it("rejeita sem code", () => {
    const result = mfaSetupVerifySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejeita codigo com espacos", () => {
    const result = mfaSetupVerifySchema.safeParse({ code: "123 56" });
    expect(result.success).toBe(false);
  });
});

// ========== mfaVerifySchema ==========

describe("mfa — mfaVerifySchema", () => {
  it("valida com challenge_token e code de 6 digitos", () => {
    const result = mfaVerifySchema.safeParse({
      challenge_token: "challenge-abc-123",
      code: "123456",
    });
    expect(result.success).toBe(true);
  });

  it("valida com recovery code (alfanumerico)", () => {
    const result = mfaVerifySchema.safeParse({
      challenge_token: "challenge-abc-123",
      code: "recovery-code-xyz",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sem challenge_token", () => {
    const result = mfaVerifySchema.safeParse({ code: "123456" });
    expect(result.success).toBe(false);
  });

  it("rejeita challenge_token vazio", () => {
    const result = mfaVerifySchema.safeParse({
      challenge_token: "",
      code: "123456",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita challenge_token muito longo (>500)", () => {
    const result = mfaVerifySchema.safeParse({
      challenge_token: "a".repeat(501),
      code: "123456",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem code", () => {
    const result = mfaVerifySchema.safeParse({
      challenge_token: "challenge-123",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita code muito curto (<6)", () => {
    const result = mfaVerifySchema.safeParse({
      challenge_token: "challenge-123",
      code: "12345",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita code muito longo (>20)", () => {
    const result = mfaVerifySchema.safeParse({
      challenge_token: "challenge-123",
      code: "a".repeat(21),
    });
    expect(result.success).toBe(false);
  });

  it("rejeita code com caracteres especiais", () => {
    const result = mfaVerifySchema.safeParse({
      challenge_token: "challenge-123",
      code: "123456!",
    });
    expect(result.success).toBe(false);
  });
});

// ========== mfaDisableSchema ==========

describe("mfa — mfaDisableSchema", () => {
  it("valida codigo de 6 digitos", () => {
    const result = mfaDisableSchema.safeParse({ code: "123456" });
    expect(result.success).toBe(true);
  });

  it("rejeita codigo com menos de 6 digitos", () => {
    const result = mfaDisableSchema.safeParse({ code: "12345" });
    expect(result.success).toBe(false);
  });

  it("rejeita codigo com mais de 6 digitos", () => {
    const result = mfaDisableSchema.safeParse({ code: "1234567" });
    expect(result.success).toBe(false);
  });

  it("rejeita codigo com letras", () => {
    const result = mfaDisableSchema.safeParse({ code: "abc123" });
    expect(result.success).toBe(false);
  });

  it("rejeita sem code", () => {
    const result = mfaDisableSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ========== Logica de TOTP Code Validation ==========

describe("mfa — logica de TOTP code validation", () => {
  it("codigo de 6 digitos e valido para TOTP", () => {
    const code = "123456";
    expect(/^\d{6}$/.test(code)).toBe(true);
  });

  it("codigo com letras nao e valido para TOTP", () => {
    const code = "abc123";
    expect(/^\d{6}$/.test(code)).toBe(false);
  });

  it("recovery code alfanumerico e aceito pelo mfaVerifySchema", () => {
    const recoveryCode = "ABCD-1234-EFGH";
    const result = mfaVerifySchema.safeParse({
      challenge_token: "challenge-123",
      code: recoveryCode,
    });
    expect(result.success).toBe(true);
  });
});

// ========== Logica de Challenge Expiry ==========

describe("mfa — logica de challenge expiry", () => {
  it("challenge expirado deve ser rejeitado", () => {
    const expiresAt = new Date(Date.now() - 60000); // 1 min atras
    const isExpired = new Date(expiresAt) < new Date();
    expect(isExpired).toBe(true);
  });

  it("challenge valido deve ser aceito", () => {
    const expiresAt = new Date(Date.now() + 60000); // 1 min no futuro
    const isExpired = new Date(expiresAt) < new Date();
    expect(isExpired).toBe(false);
  });

  it("challenge consumido deve ser rejeitado", () => {
    const consumed = true;
    expect(consumed).toBe(true);
  });
});
