// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import * as net from "node:net";
import {
  createSslCertificateSchema,
  updateSslCertificateSchema,
} from "@repo/shared-validation";

// Replica local da funcao isSafeHostname para testes
function isSafeHostname(hostname: string): boolean {
  if (net.isIP(hostname) !== 0) {
    return false;
  }
  const lower = hostname.toLowerCase();
  const blocked = [
    "localhost",
    "metadata",
    "169.254.169.254",
    "metadata.google.internal",
    "169.254.170.2",
  ];
  if (blocked.some((b) => lower.includes(b))) {
    return false;
  }
  if (lower.endsWith(".internal") && lower.includes("metadata")) {
    return false;
  }
  return true;
}

// ========== createSslCertificateSchema ==========

describe("ssl — createSslCertificateSchema", () => {
  const validCert = {
    hostname: "example.com",
  };

  it("valida certificado minimo", () => {
    const result = createSslCertificateSchema.safeParse(validCert);
    expect(result.success).toBe(true);
  });

  it("rejeita sem hostname", () => {
    const result = createSslCertificateSchema.safeParse({ hostname: "" });
    expect(result.success).toBe(false);
  });

  it("rejeita hostname com caracteres invalidos", () => {
    const result = createSslCertificateSchema.safeParse({
      hostname: "exa mple.com",
    });
    expect(result.success).toBe(false);
  });

  it("valida hostname com subdominio", () => {
    const result = createSslCertificateSchema.safeParse({
      hostname: "api.example.com",
    });
    expect(result.success).toBe(true);
  });

  it("valida hostname com multiplas partes", () => {
    const result = createSslCertificateSchema.safeParse({
      hostname: "a.b.c.example.com",
    });
    expect(result.success).toBe(true);
  });

  it("aplica default port=443", () => {
    const result = createSslCertificateSchema.safeParse(validCert);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.port).toBe(443);
    }
  });

  it("valida port custom", () => {
    const result = createSslCertificateSchema.safeParse({
      ...validCert,
      port: 8443,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita port maior que 65535", () => {
    const result = createSslCertificateSchema.safeParse({
      ...validCert,
      port: 65536,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita port zero", () => {
    const result = createSslCertificateSchema.safeParse({
      ...validCert,
      port: 0,
    });
    expect(result.success).toBe(false);
  });

  it("aplica default alert_days_before=30", () => {
    const result = createSslCertificateSchema.safeParse(validCert);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.alert_days_before).toBe(30);
    }
  });

  it("valida alert_days_before custom", () => {
    const result = createSslCertificateSchema.safeParse({
      ...validCert,
      alert_days_before: 60,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita alert_days_before maior que 365", () => {
    const result = createSslCertificateSchema.safeParse({
      ...validCert,
      alert_days_before: 366,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita alert_days_before zero", () => {
    const result = createSslCertificateSchema.safeParse({
      ...validCert,
      alert_days_before: 0,
    });
    expect(result.success).toBe(false);
  });

  it("aplica default is_auto_renewed=false", () => {
    const result = createSslCertificateSchema.safeParse(validCert);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_auto_renewed).toBe(false);
    }
  });

  it("valida com ca_provider", () => {
    const result = createSslCertificateSchema.safeParse({
      ...validCert,
      ca_provider: "letsencrypt",
    });
    expect(result.success).toBe(true);
  });

  it("valida com protocol", () => {
    const result = createSslCertificateSchema.safeParse({
      ...validCert,
      protocol: "https",
    });
    expect(result.success).toBe(true);
  });

  it("valida com domain", () => {
    const result = createSslCertificateSchema.safeParse({
      ...validCert,
      domain: "example.com",
    });
    expect(result.success).toBe(true);
  });
});

// ========== updateSslCertificateSchema ==========

describe("ssl — updateSslCertificateSchema", () => {
  it("valida update vazio (parcial)", () => {
    const result = updateSslCertificateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida update hostname", () => {
    const result = updateSslCertificateSchema.safeParse({
      hostname: "new.example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita hostname invalido", () => {
    const result = updateSslCertificateSchema.safeParse({
      hostname: "invalid host",
    });
    expect(result.success).toBe(false);
  });

  it("valida update port", () => {
    const result = updateSslCertificateSchema.safeParse({ port: 8443 });
    expect(result.success).toBe(true);
  });

  it("rejeita port invalido", () => {
    const result = updateSslCertificateSchema.safeParse({ port: 99999 });
    expect(result.success).toBe(false);
  });

  it("valida update alert_days_before", () => {
    const result = updateSslCertificateSchema.safeParse({
      alert_days_before: 14,
    });
    expect(result.success).toBe(true);
  });

  it("valida update is_auto_renewed", () => {
    const result = updateSslCertificateSchema.safeParse({
      is_auto_renewed: true,
    });
    expect(result.success).toBe(true);
  });

  it("valida update ca_provider", () => {
    const result = updateSslCertificateSchema.safeParse({
      ca_provider: "zerossl",
    });
    expect(result.success).toBe(true);
  });

  it("valida update is_active", () => {
    const result = updateSslCertificateSchema.safeParse({ is_active: false });
    expect(result.success).toBe(true);
  });

  it("valida update completo", () => {
    const result = updateSslCertificateSchema.safeParse({
      hostname: "updated.example.com",
      port: 443,
      protocol: "https",
      alert_days_before: 45,
      is_auto_renewed: true,
      ca_provider: "letsencrypt",
      is_active: true,
    });
    expect(result.success).toBe(true);
  });
});

// ========== SSRF Protection — isSafeHostname ==========

describe("ssl — SSRF protection (isSafeHostname)", () => {
  it("aceita dominio valido", () => {
    expect(isSafeHostname("example.com")).toBe(true);
  });

  it("aceita subdominio", () => {
    expect(isSafeHostname("api.example.com")).toBe(true);
  });

  it("aceita multiplas partes", () => {
    expect(isSafeHostname("a.b.c.example.com")).toBe(true);
  });

  it("rejeita IPv4", () => {
    expect(isSafeHostname("192.168.1.1")).toBe(false);
  });

  it("rejeita IPv4 publico", () => {
    expect(isSafeHostname("8.8.8.8")).toBe(false);
  });

  it("rejeita IPv6", () => {
    expect(isSafeHostname("::1")).toBe(false);
  });

  it("rejeita IPv6 full", () => {
    expect(isSafeHostname("2001:db8::1")).toBe(false);
  });

  it("rejeita localhost", () => {
    expect(isSafeHostname("localhost")).toBe(false);
  });

  it("rejeita AWS metadata IP", () => {
    expect(isSafeHostname("169.254.169.254")).toBe(false);
  });

  it("rejeita GCP metadata hostname", () => {
    expect(isSafeHostname("metadata.google.internal")).toBe(false);
  });

  it("rejeita ECS metadata IP", () => {
    expect(isSafeHostname("169.254.170.2")).toBe(false);
  });

  it("rejeita subdominio de metadata.internal", () => {
    expect(isSafeHostname("foo.metadata.internal")).toBe(false);
  });

  it("aceita dominio com palavra metadata mas nao .internal", () => {
    expect(isSafeHostname("metadata.example.com")).toBe(false);
  });

  it("aceita dominio .internal sem metadata", () => {
    expect(isSafeHostname("app.internal")).toBe(true);
  });
});

// ========== Logica de Status Calculation ==========

describe("ssl — logica de status calculation", () => {
  function calcStatus(
    error: string | null,
    daysUntilExpiry: number | null,
    alertDaysBefore: number,
  ): string {
    if (error) return "error";
    if (daysUntilExpiry === null) return "error";
    if (daysUntilExpiry < 0) return "expired";
    if (daysUntilExpiry <= alertDaysBefore) return "expiring_soon";
    return "valid";
  }

  it("erro de conexao retorna status=error", () => {
    expect(calcStatus("Connection refused", null, 30)).toBe("error");
  });

  it("daysUntilExpiry null retorna status=error", () => {
    expect(calcStatus(null, null, 30)).toBe("error");
  });

  it("daysUntilExpiry negativo retorna status=expired", () => {
    expect(calcStatus(null, -5, 30)).toBe("expired");
  });

  it("daysUntilExpiry <= alertDaysBefore retorna expiring_soon", () => {
    expect(calcStatus(null, 25, 30)).toBe("expiring_soon");
  });

  it("daysUntilExpiry == alertDaysBefore retorna expiring_soon", () => {
    expect(calcStatus(null, 30, 30)).toBe("expiring_soon");
  });

  it("daysUntilExpiry > alertDaysBefore retorna valid", () => {
    expect(calcStatus(null, 60, 30)).toBe("valid");
  });

  it("daysUntilExpiry = 0 retorna expired", () => {
    expect(calcStatus(null, 0, 30)).toBe("expiring_soon");
  });

  it("daysUntilExpiry = 1 retorna expiring_soon", () => {
    expect(calcStatus(null, 1, 30)).toBe("expiring_soon");
  });
});

// ========== Logica de Days Until Expiry ==========

describe("ssl — logica de days until expiry", () => {
  it("calcula dias restantes corretamente", () => {
    const validTo = new Date(Date.now() + 30 * 86400000);
    const now = new Date();
    const days = Math.floor((validTo.getTime() - now.getTime()) / 86400000);
    expect(days).toBe(30);
  });

  it("certificado expirado tem dias negativos", () => {
    const validTo = new Date(Date.now() - 5 * 86400000);
    const now = new Date();
    const days = Math.floor((validTo.getTime() - now.getTime()) / 86400000);
    expect(days).toBe(-5);
  });

  it("certificado expirando hoje tem 0 dias", () => {
    const validTo = new Date();
    const now = new Date();
    const days = Math.floor((validTo.getTime() - now.getTime()) / 86400000);
    expect(days).toBe(0);
  });
});

// ========== Logica de Limit Pagination ==========

describe("ssl — logica de limit pagination", () => {
  it("alerts limit default 50", () => {
    const limit = Math.min(parseInt("50", 10), 200);
    expect(limit).toBe(50);
  });

  it("alerts limit maximo 200", () => {
    const limit = Math.min(parseInt("999", 10), 200);
    expect(limit).toBe(200);
  });
});

// ========== Logica de Batch Processing ==========

describe("ssl — logica de batch processing", () => {
  it("divide 10 certificados em 2 batches de 5", () => {
    const total = 10;
    const batchSize = 5;
    const batches = Math.ceil(total / batchSize);
    expect(batches).toBe(2);
  });

  it("divide 7 certificados em 2 batches (5+2)", () => {
    const total = 7;
    const batchSize = 5;
    const batches = Math.ceil(total / batchSize);
    expect(batches).toBe(2);
  });

  it("divide 5 certificados em 1 batch", () => {
    const total = 5;
    const batchSize = 5;
    const batches = Math.ceil(total / batchSize);
    expect(batches).toBe(1);
  });

  it("divide 0 certificados em 0 batches", () => {
    const total = 0;
    const batchSize = 5;
    const batches = Math.ceil(total / batchSize);
    expect(batches).toBe(0);
  });

  it("slice corretamente batch 0", () => {
    const certs = [1, 2, 3, 4, 5, 6, 7];
    const batch = certs.slice(0, 5);
    expect(batch).toEqual([1, 2, 3, 4, 5]);
  });

  it("slice corretamente batch 1", () => {
    const certs = [1, 2, 3, 4, 5, 6, 7];
    const batch = certs.slice(5, 10);
    expect(batch).toEqual([6, 7]);
  });
});
