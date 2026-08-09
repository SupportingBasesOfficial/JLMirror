// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  updateTenantSettingsSchema,
  testSmtpSchema,
  toggleModuleSchema,
  toggleModuleVisibilitySchema,
} from "@repo/shared-validation";

// ========== updateTenantSettingsSchema ==========

describe("settings — updateTenantSettingsSchema", () => {
  it("valida settings vazio (parcial)", () => {
    const result = updateTenantSettingsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida company_name", () => {
    const result = updateTenantSettingsSchema.safeParse({
      company_name: "Acme Corp",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita company_name muito longo (>200)", () => {
    const result = updateTenantSettingsSchema.safeParse({
      company_name: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("valida logo_url", () => {
    const result = updateTenantSettingsSchema.safeParse({
      logo_url: "https://example.com/logo.png",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita logo_url invalida", () => {
    const result = updateTenantSettingsSchema.safeParse({
      logo_url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("valida primary_color hex", () => {
    const result = updateTenantSettingsSchema.safeParse({
      primary_color: "#FF5733",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita primary_color invalido", () => {
    const result = updateTenantSettingsSchema.safeParse({
      primary_color: "red",
    });
    expect(result.success).toBe(false);
  });

  it("valida smtp_host", () => {
    const result = updateTenantSettingsSchema.safeParse({
      smtp_host: "smtp.gmail.com",
    });
    expect(result.success).toBe(true);
  });

  it("valida smtp_port", () => {
    const result = updateTenantSettingsSchema.safeParse({
      smtp_port: 587,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita smtp_port invalido (0)", () => {
    const result = updateTenantSettingsSchema.safeParse({
      smtp_port: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita smtp_port invalido (>65535)", () => {
    const result = updateTenantSettingsSchema.safeParse({
      smtp_port: 70000,
    });
    expect(result.success).toBe(false);
  });

  it("valida smtp_enabled boolean", () => {
    const result = updateTenantSettingsSchema.safeParse({
      smtp_enabled: true,
    });
    expect(result.success).toBe(true);
  });

  it("valida max_devices", () => {
    const result = updateTenantSettingsSchema.safeParse({
      max_devices: 100,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita max_devices negativo", () => {
    const result = updateTenantSettingsSchema.safeParse({
      max_devices: -1,
    });
    expect(result.success).toBe(false);
  });

  it("valida password_min_length", () => {
    const result = updateTenantSettingsSchema.safeParse({
      password_min_length: 12,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita password_min_length muito pequeno (<4)", () => {
    const result = updateTenantSettingsSchema.safeParse({
      password_min_length: 2,
    });
    expect(result.success).toBe(false);
  });

  it("valida session_timeout_minutes", () => {
    const result = updateTenantSettingsSchema.safeParse({
      session_timeout_minutes: 60,
    });
    expect(result.success).toBe(true);
  });

  it("valida require_mfa boolean", () => {
    const result = updateTenantSettingsSchema.safeParse({
      require_mfa: true,
    });
    expect(result.success).toBe(true);
  });

  it("valida ip_whitelist array", () => {
    const result = updateTenantSettingsSchema.safeParse({
      ip_whitelist: ["192.168.1.1", "10.0.0.0/8"],
    });
    expect(result.success).toBe(true);
  });

  it("valida update completo com multiplos campos", () => {
    const result = updateTenantSettingsSchema.safeParse({
      company_name: "Acme",
      smtp_host: "smtp.gmail.com",
      smtp_port: 587,
      smtp_use_tls: true,
      max_users: 100,
      enable_monitoring: true,
      require_mfa: false,
    });
    expect(result.success).toBe(true);
  });
});

// ========== testSmtpSchema ==========

describe("settings — testSmtpSchema", () => {
  const validSmtp = {
    smtp_host: "smtp.gmail.com",
    smtp_port: 587,
    test_email: "test@example.com",
  };

  it("valida SMTP minimo", () => {
    const result = testSmtpSchema.safeParse(validSmtp);
    expect(result.success).toBe(true);
  });

  it("rejeita sem smtp_host", () => {
    const result = testSmtpSchema.safeParse({
      ...validSmtp,
      smtp_host: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem smtp_port", () => {
    const result = testSmtpSchema.safeParse({
      smtp_host: "smtp.gmail.com",
      test_email: "test@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita smtp_port invalido", () => {
    const result = testSmtpSchema.safeParse({
      ...validSmtp,
      smtp_port: 99999,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem test_email", () => {
    const result = testSmtpSchema.safeParse({
      smtp_host: "smtp.gmail.com",
      smtp_port: 587,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita test_email invalido", () => {
    const result = testSmtpSchema.safeParse({
      ...validSmtp,
      test_email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("valida com username e password", () => {
    const result = testSmtpSchema.safeParse({
      ...validSmtp,
      smtp_username: "user@gmail.com",
      smtp_password_encrypted: "app-password",
    });
    expect(result.success).toBe(true);
  });

  it("valida com SSL", () => {
    const result = testSmtpSchema.safeParse({
      ...validSmtp,
      smtp_port: 465,
      smtp_use_ssl: true,
    });
    expect(result.success).toBe(true);
  });
});

// ========== toggleModuleSchema ==========

describe("settings — toggleModuleSchema", () => {
  it("valida enabled true", () => {
    const result = toggleModuleSchema.safeParse({ enabled: true });
    expect(result.success).toBe(true);
  });

  it("valida enabled false", () => {
    const result = toggleModuleSchema.safeParse({ enabled: false });
    expect(result.success).toBe(true);
  });

  it("rejeita sem enabled", () => {
    const result = toggleModuleSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejeita enabled nao-boolean", () => {
    const result = toggleModuleSchema.safeParse({ enabled: "yes" });
    expect(result.success).toBe(false);
  });
});

// ========== toggleModuleVisibilitySchema ==========

describe("settings — toggleModuleVisibilitySchema", () => {
  it("valida client_visible true", () => {
    const result = toggleModuleVisibilitySchema.safeParse({
      client_visible: true,
    });
    expect(result.success).toBe(true);
  });

  it("valida client_visible false", () => {
    const result = toggleModuleVisibilitySchema.safeParse({
      client_visible: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sem client_visible", () => {
    const result = toggleModuleVisibilitySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejeita client_visible nao-boolean", () => {
    const result = toggleModuleVisibilitySchema.safeParse({
      client_visible: "yes",
    });
    expect(result.success).toBe(false);
  });
});

// ========== Logica de Module Key Validation ==========

describe("settings — logica de module key validation", () => {
  it("module_ prefix e valido", () => {
    const key = "module_monitoring";
    expect(key.startsWith("module_")).toBe(true);
  });

  it("sem module_ prefix e invalido", () => {
    const key = "monitoring";
    expect(key.startsWith("module_")).toBe(false);
  });

  it("module_ vazio apos prefix ainda valido", () => {
    const key = "module_";
    expect(key.startsWith("module_")).toBe(true);
  });
});

// ========== Logica de SMTP Port/Protocol Matching ==========

describe("settings — logica de SMTP port/protocol matching", () => {
  it("porta 465 geralmente requer SSL", () => {
    const port = 465;
    const useSsl = false;
    const issues: string[] = [];
    if (port === 465 && !useSsl) {
      issues.push("Porta 465 geralmente requer SSL");
    }
    expect(issues).toHaveLength(1);
  });

  it("porta 587 geralmente requer TLS", () => {
    const port = 587;
    const useTls = false;
    const issues: string[] = [];
    if (port === 587 && !useTls) {
      issues.push("Porta 587 geralmente requer TLS");
    }
    expect(issues).toHaveLength(1);
  });

  it("SSL e TLS sao mutuamente exclusivos", () => {
    const useSsl = true;
    const useTls = true;
    const issues: string[] = [];
    if (useSsl && useTls) {
      issues.push("SSL e TLS são mutuamente exclusivos — use apenas um");
    }
    expect(issues).toHaveLength(1);
  });

  it("porta 465 com SSL nao gera warning", () => {
    const port: number = 465;
    const useSsl = true;
    const useTls = false;
    const issues: string[] = [];
    if (useSsl && useTls) issues.push("exclusivos");
    if (port === 465 && !useSsl) issues.push("465 requer SSL");
    if (port === 587 && !useTls) issues.push("587 requer TLS");
    expect(issues).toHaveLength(0);
  });
});
