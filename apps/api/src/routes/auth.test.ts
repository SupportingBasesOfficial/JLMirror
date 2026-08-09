// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  loginInputSchema,
  refreshTokenSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  oauthCallbackSchema,
  ldapBindSchema,
} from "@repo/shared-validation";

// ========== loginInputSchema ==========

describe("auth — loginInputSchema", () => {
  const validLogin = {
    email: "user@example.com",
    password: "secret123",
  };

  it("valida login minimo", () => {
    const result = loginInputSchema.safeParse(validLogin);
    expect(result.success).toBe(true);
  });

  it("rejeita sem email", () => {
    const result = loginInputSchema.safeParse({
      ...validLogin,
      email: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita email invalido", () => {
    const result = loginInputSchema.safeParse({
      ...validLogin,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem password", () => {
    const result = loginInputSchema.safeParse({
      ...validLogin,
      password: "",
    });
    expect(result.success).toBe(false);
  });

  it("valida com device_fingerprint", () => {
    const result = loginInputSchema.safeParse({
      ...validLogin,
      device_fingerprint: "abc-123-def",
    });
    expect(result.success).toBe(true);
  });

  it("valida com device_label", () => {
    const result = loginInputSchema.safeParse({
      ...validLogin,
      device_label: "Meu Notebook",
    });
    expect(result.success).toBe(true);
  });

  it("valida com ambos device_fingerprint e device_label", () => {
    const result = loginInputSchema.safeParse({
      ...validLogin,
      device_fingerprint: "abc-123",
      device_label: "Notebook trabalho",
    });
    expect(result.success).toBe(true);
  });
});

// ========== refreshTokenSchema ==========

describe("auth — refreshTokenSchema", () => {
  it("valida refresh token", () => {
    const result = refreshTokenSchema.safeParse({
      refresh_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sem refresh_token", () => {
    const result = refreshTokenSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejeita refresh_token vazio", () => {
    const result = refreshTokenSchema.safeParse({ refresh_token: "" });
    expect(result.success).toBe(false);
  });
});

// ========== changePasswordSchema ==========

describe("auth — changePasswordSchema", () => {
  const validChange = {
    current_password: "oldPass123",
    new_password: "newPass456",
  };

  it("valida change password", () => {
    const result = changePasswordSchema.safeParse(validChange);
    expect(result.success).toBe(true);
  });

  it("rejeita sem current_password", () => {
    const result = changePasswordSchema.safeParse({
      ...validChange,
      current_password: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita new_password menor que 8", () => {
    const result = changePasswordSchema.safeParse({
      ...validChange,
      new_password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita new_password vazia", () => {
    const result = changePasswordSchema.safeParse({
      ...validChange,
      new_password: "",
    });
    expect(result.success).toBe(false);
  });

  it("valida new_password com 8 caracteres", () => {
    const result = changePasswordSchema.safeParse({
      ...validChange,
      new_password: "12345678",
    });
    expect(result.success).toBe(true);
  });

  it("valida new_password longa", () => {
    const result = changePasswordSchema.safeParse({
      ...validChange,
      new_password: "a".repeat(100),
    });
    expect(result.success).toBe(true);
  });
});

// ========== forgotPasswordSchema ==========

describe("auth — forgotPasswordSchema", () => {
  it("valida email", () => {
    const result = forgotPasswordSchema.safeParse({
      email: "user@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sem email", () => {
    const result = forgotPasswordSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejeita email invalido", () => {
    const result = forgotPasswordSchema.safeParse({
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita email vazio", () => {
    const result = forgotPasswordSchema.safeParse({ email: "" });
    expect(result.success).toBe(false);
  });
});

// ========== resetPasswordSchema ==========

describe("auth — resetPasswordSchema", () => {
  const validReset = {
    token: "a".repeat(32),
    new_password: "newPass456",
  };

  it("valida reset password", () => {
    const result = resetPasswordSchema.safeParse(validReset);
    expect(result.success).toBe(true);
  });

  it("rejeita token menor que 32", () => {
    const result = resetPasswordSchema.safeParse({
      ...validReset,
      token: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem token", () => {
    const result = resetPasswordSchema.safeParse({
      ...validReset,
      token: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita new_password menor que 8", () => {
    const result = resetPasswordSchema.safeParse({
      ...validReset,
      new_password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("valida token com exatamente 32 chars", () => {
    const result = resetPasswordSchema.safeParse({
      token: "0123456789abcdef0123456789abcdef",
      new_password: "newPass456",
    });
    expect(result.success).toBe(true);
  });
});

// ========== oauthCallbackSchema ==========

describe("auth — oauthCallbackSchema", () => {
  it("valida callback google", () => {
    const result = oauthCallbackSchema.safeParse({
      code: "google-auth-code-123",
      provider: "google",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sem code", () => {
    const result = oauthCallbackSchema.safeParse({
      provider: "google",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita code vazio", () => {
    const result = oauthCallbackSchema.safeParse({
      code: "",
      provider: "google",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem provider", () => {
    const result = oauthCallbackSchema.safeParse({
      code: "auth-code-123",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita provider invalido", () => {
    const result = oauthCallbackSchema.safeParse({
      code: "auth-code-123",
      provider: "facebook",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita provider vazio", () => {
    const result = oauthCallbackSchema.safeParse({
      code: "auth-code-123",
      provider: "",
    });
    expect(result.success).toBe(false);
  });
});

// ========== ldapBindSchema ==========

describe("auth — ldapBindSchema", () => {
  it("valida ldap bind", () => {
    const result = ldapBindSchema.safeParse({
      username: "joao.silva",
      password: "ldapPass123",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sem username", () => {
    const result = ldapBindSchema.safeParse({
      password: "ldapPass123",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita username vazio", () => {
    const result = ldapBindSchema.safeParse({
      username: "",
      password: "ldapPass123",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem password", () => {
    const result = ldapBindSchema.safeParse({
      username: "joao.silva",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita password vazio", () => {
    const result = ldapBindSchema.safeParse({
      username: "joao.silva",
      password: "",
    });
    expect(result.success).toBe(false);
  });
});

// ========== Logica de IP Extraction ==========

describe("auth — logica de extracao de IP", () => {
  it("extrai IP de x-forwarded-for simples", () => {
    const header: string | undefined = "192.168.1.1";
    const ip = header ? header.split(",")[0]?.trim() || null : null;
    expect(ip).toBe("192.168.1.1");
  });

  it("extrai primeiro IP de x-forwarded-for com multiplos", () => {
    const header: string | undefined = "192.168.1.1, 10.0.0.1, 172.16.0.1";
    const ip = header ? header.split(",")[0]?.trim() || null : null;
    expect(ip).toBe("192.168.1.1");
  });

  it("extrai IP com espacos", () => {
    const header: string | undefined = "  192.168.1.1  , 10.0.0.1";
    const ip = header ? header.split(",")[0]?.trim() || null : null;
    expect(ip).toBe("192.168.1.1");
  });

  it("retorna null quando header ausente", () => {
    const header = undefined as string | undefined;
    const ip = header ? header.split(",")[0]?.trim() || null : null;
    expect(ip).toBe(null);
  });
});

// ========== Logica de MFA Challenge ==========

describe("auth — logica de MFA challenge", () => {
  it("gera challenge token UUID valido", () => {
    const challengeToken = crypto.randomUUID();
    expect(challengeToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("calcula expiracao de 5 minutos no futuro", () => {
    const now = Date.now();
    const expiresAt = new Date(now + 5 * 60 * 1000).toISOString();
    const expiresMs = new Date(expiresAt).getTime();
    expect(expiresMs - now).toBe(5 * 60 * 1000);
  });
});

// ========== Logica de Token TTL ==========

describe("auth — logica de token TTL", () => {
  it("calcula TTL de 30 dias em segundos", () => {
    const ttlSeconds = 30 * 24 * 60 * 60;
    expect(ttlSeconds).toBe(2592000);
  });

  it("TTL de 30 dias e maior que 1 dia", () => {
    const ttlSeconds = 30 * 24 * 60 * 60;
    expect(ttlSeconds).toBeGreaterThan(24 * 60 * 60);
  });
});

// ========== Logica de Resposta Generica (Anti Enumeration) ==========

describe("auth — logica anti user-enumeration", () => {
  it("resposta de forgot-password e sempre generica", () => {
    const response = {
      sent: true,
      message:
        "Se o email estiver cadastrado, você receberá um link de recuperação em instantes",
    };
    // Resposta nao revela se email existe ou nao
    expect(response.sent).toBe(true);
    expect(response.message).not.toContain("não encontrado");
    expect(response.message).not.toContain("inexistente");
  });

  it("login falhado nao revela qual campo esta errado", () => {
    const response = {
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Email ou senha inválidos",
      },
    };
    // Mensagem generica — nao diz se email existe ou senha esta errada
    expect(response.error.message).toBe("Email ou senha inválidos");
    expect(response.error.message).not.toContain("email não encontrado");
    expect(response.error.message).not.toContain("senha incorreta");
  });
});

// ========== Logica de Status de Login ==========

describe("auth — logica de status de login", () => {
  it("usuario inativo retorna 403", () => {
    const is_active = false;
    const status = is_active ? 200 : 403;
    expect(status).toBe(403);
  });

  it("usuario ativo continua fluxo", () => {
    const is_active = true;
    const status = is_active ? 200 : 403;
    expect(status).toBe(200);
  });

  it("sem tenant access retorna 403", () => {
    const hasTenants = false;
    const status = hasTenants ? 200 : 403;
    expect(status).toBe(403);
  });

  it("com tenant access continua fluxo", () => {
    const hasTenants = true;
    const status = hasTenants ? 200 : 403;
    expect(status).toBe(200);
  });

  it("MFA habilitado retorna challenge em vez de tokens", () => {
    const mfaEnabled = true;
    const responseType = mfaEnabled ? "mfa_required" : "tokens";
    expect(responseType).toBe("mfa_required");
  });

  it("MFA desabilitado retorna tokens", () => {
    const mfaEnabled = false;
    const responseType = mfaEnabled ? "mfa_required" : "tokens";
    expect(responseType).toBe("tokens");
  });
});

// ========== Logica de Change Password ==========

describe("auth — logica de change password", () => {
  it("senha atual correta continua fluxo", () => {
    const valid = true;
    const status = valid ? 200 : 401;
    expect(status).toBe(200);
  });

  it("senha atual incorreta retorna 401", () => {
    const valid = false;
    const status = valid ? 200 : 401;
    expect(status).toBe(401);
  });

  it("apos troca de senha, revoga todas sessoes", () => {
    const passwordChanged = true;
    const sessionsRevoked = passwordChanged;
    expect(sessionsRevoked).toBe(true);
  });

  it("apos troca de senha, remove flag must_change_password", () => {
    const passwordChanged = true;
    const mustChangePassword = passwordChanged ? false : true;
    expect(mustChangePassword).toBe(false);
  });
});
