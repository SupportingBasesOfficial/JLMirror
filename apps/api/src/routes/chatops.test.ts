// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import { chatopsConfigSchema } from "@repo/shared-validation";

// ========== chatopsConfigSchema ==========

describe("chatops — chatopsConfigSchema", () => {
  const validConfig = {
    platform: "slack" as const,
  };

  it("valida config minima (slack)", () => {
    const result = chatopsConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it("valida config minima (teams)", () => {
    const result = chatopsConfigSchema.safeParse({ platform: "teams" });
    expect(result.success).toBe(true);
  });

  it("rejeita platform invalido", () => {
    const result = chatopsConfigSchema.safeParse({ platform: "discord" });
    expect(result.success).toBe(false);
  });

  it("rejeita sem platform", () => {
    const result = chatopsConfigSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("valida com slack_verification_token", () => {
    const result = chatopsConfigSchema.safeParse({
      ...validConfig,
      slack_verification_token: "verify-token-123",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita slack_verification_token muito longo (>200)", () => {
    const result = chatopsConfigSchema.safeParse({
      ...validConfig,
      slack_verification_token: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("valida com slack_signing_secret", () => {
    const result = chatopsConfigSchema.safeParse({
      ...validConfig,
      slack_signing_secret: "signing-secret-abc",
    });
    expect(result.success).toBe(true);
  });

  it("valida com slack_bot_token", () => {
    const result = chatopsConfigSchema.safeParse({
      ...validConfig,
      slack_bot_token: "xoxb-bot-token",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita slack_bot_token muito longo (>500)", () => {
    const result = chatopsConfigSchema.safeParse({
      ...validConfig,
      slack_bot_token: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("valida com teams_app_id", () => {
    const result = chatopsConfigSchema.safeParse({
      platform: "teams",
      teams_app_id: "app-id-123",
    });
    expect(result.success).toBe(true);
  });

  it("valida com teams_app_password", () => {
    const result = chatopsConfigSchema.safeParse({
      platform: "teams",
      teams_app_password: "app-password-secret",
    });
    expect(result.success).toBe(true);
  });

  it("valida com enabled_commands", () => {
    const result = chatopsConfigSchema.safeParse({
      ...validConfig,
      enabled_commands: ["status", "ack", "resolve"],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita enabled_commands com item muito longo (>50)", () => {
    const result = chatopsConfigSchema.safeParse({
      ...validConfig,
      enabled_commands: ["a".repeat(51)],
    });
    expect(result.success).toBe(false);
  });

  it("valida is_active boolean", () => {
    const result = chatopsConfigSchema.safeParse({
      ...validConfig,
      is_active: true,
    });
    expect(result.success).toBe(true);
  });

  it("valida config completa", () => {
    const result = chatopsConfigSchema.safeParse({
      platform: "slack",
      slack_verification_token: "token",
      slack_signing_secret: "secret",
      slack_bot_token: "xoxb-token",
      enabled_commands: ["status", "ack", "resolve", "incidents"],
      is_active: true,
    });
    expect(result.success).toBe(true);
  });
});

// ========== Logica de Command Parsing ==========

describe("chatops — logica de command parsing", () => {
  it("parse comando simples", () => {
    const text = "status";
    const args = text.trim().split(/\s+/).filter(Boolean);
    expect(args).toEqual(["status"]);
  });

  it("parse comando com argumentos", () => {
    const text = "ack INC-123 acknowledged by user";
    const args = text.trim().split(/\s+/).filter(Boolean);
    expect(args).toEqual(["ack", "INC-123", "acknowledged", "by", "user"]);
  });

  it("parse comando vazio", () => {
    const text = "";
    const args = text.trim().split(/\s+/).filter(Boolean);
    expect(args).toEqual([]);
  });

  it("parse comando com espacos extras", () => {
    const text = "  status   all  ";
    const args = text.trim().split(/\s+/).filter(Boolean);
    expect(args).toEqual(["status", "all"]);
  });

  it("remove barra inicial do comando", () => {
    const command = "/status";
    const cleaned = command.replace(/^\//, "");
    expect(cleaned).toBe("status");
  });

  it("nao remove barra se nao estiver no inicio", () => {
    const command = "ack/resolve";
    const cleaned = command.replace(/^\//, "");
    expect(cleaned).toBe("ack/resolve");
  });
});

// ========== Logica de Token Masking ==========

describe("chatops — logica de token masking", () => {
  it("mascara slack_bot_token existente", () => {
    const row: { slack_bot_token: string | null } = {
      slack_bot_token: "xoxb-secret-token-123",
    };
    if (row.slack_bot_token) {
      row.slack_bot_token = "***";
    }
    expect(row.slack_bot_token).toBe("***");
  });

  it("nao mascara slack_bot_token null", () => {
    const row: { slack_bot_token: string | null } = { slack_bot_token: null };
    if (row.slack_bot_token) {
      row.slack_bot_token = "***";
    }
    expect(row.slack_bot_token).toBeNull();
  });
});
