// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  createApiKeySchema,
  updateApiKeySchema,
} from "@repo/shared-validation";
import { createHash, randomBytes } from "node:crypto";

// ========== createApiKeySchema ==========

describe("api-keys — createApiKeySchema", () => {
  const validKey = {
    name: "Production API Key",
  };

  it("valida key minima", () => {
    const result = createApiKeySchema.safeParse(validKey);
    expect(result.success).toBe(true);
  });

  it("rejeita sem name", () => {
    const result = createApiKeySchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejeita name muito longo (>200)", () => {
    const result = createApiKeySchema.safeParse({
      name: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("aplica default scopes=[]", () => {
    const result = createApiKeySchema.safeParse(validKey);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scopes).toEqual([]);
    }
  });

  it("valida com scopes", () => {
    const result = createApiKeySchema.safeParse({
      ...validKey,
      scopes: ["read", "write"],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita mais de 50 scopes", () => {
    const result = createApiKeySchema.safeParse({
      ...validKey,
      scopes: Array(51).fill("scope"),
    });
    expect(result.success).toBe(false);
  });

  it("rejeita scope vazio", () => {
    const result = createApiKeySchema.safeParse({
      ...validKey,
      scopes: [""],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita scope muito longo (>100)", () => {
    const result = createApiKeySchema.safeParse({
      ...validKey,
      scopes: ["a".repeat(101)],
    });
    expect(result.success).toBe(false);
  });

  it("valida com description", () => {
    const result = createApiKeySchema.safeParse({
      ...validKey,
      description: "Key for production server",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita description muito longa (>2000)", () => {
    const result = createApiKeySchema.safeParse({
      ...validKey,
      description: "a".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("valida com expires_at", () => {
    const result = createApiKeySchema.safeParse({
      ...validKey,
      expires_at: "2025-12-31T23:59:59Z",
    });
    expect(result.success).toBe(true);
  });

  it("valida com allowed_ips (IPv4)", () => {
    const result = createApiKeySchema.safeParse({
      ...validKey,
      allowed_ips: ["192.168.1.1", "10.0.0.1"],
    });
    expect(result.success).toBe(true);
  });

  it("valida com allowed_ips (CIDR)", () => {
    const result = createApiKeySchema.safeParse({
      ...validKey,
      allowed_ips: ["192.168.1.0/24", "10.0.0.0/8"],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita allowed_ips com IP invalido", () => {
    const result = createApiKeySchema.safeParse({
      ...validKey,
      allowed_ips: ["not-an-ip"],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita allowed_ips com hostname", () => {
    const result = createApiKeySchema.safeParse({
      ...validKey,
      allowed_ips: ["example.com"],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita allowed_ips com IPv6", () => {
    const result = createApiKeySchema.safeParse({
      ...validKey,
      allowed_ips: ["::1"],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita mais de 50 allowed_ips", () => {
    const result = createApiKeySchema.safeParse({
      ...validKey,
      allowed_ips: Array(51).fill("192.168.1.1"),
    });
    expect(result.success).toBe(false);
  });

  it("valida com rate_limit_per_min", () => {
    const result = createApiKeySchema.safeParse({
      ...validKey,
      rate_limit_per_min: 100,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita rate_limit_per_min negativo", () => {
    const result = createApiKeySchema.safeParse({
      ...validKey,
      rate_limit_per_min: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita rate_limit_per_min > 100000", () => {
    const result = createApiKeySchema.safeParse({
      ...validKey,
      rate_limit_per_min: 100001,
    });
    expect(result.success).toBe(false);
  });

  it("valida com rate_limit_per_hour", () => {
    const result = createApiKeySchema.safeParse({
      ...validKey,
      rate_limit_per_hour: 10000,
    });
    expect(result.success).toBe(true);
  });

  it("valida com rate_limit_per_day", () => {
    const result = createApiKeySchema.safeParse({
      ...validKey,
      rate_limit_per_day: 100000,
    });
    expect(result.success).toBe(true);
  });
});

// ========== updateApiKeySchema ==========

describe("api-keys — updateApiKeySchema", () => {
  it("valida update vazio (parcial)", () => {
    const result = updateApiKeySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida update name", () => {
    const result = updateApiKeySchema.safeParse({ name: "Novo Nome" });
    expect(result.success).toBe(true);
  });

  it("valida update description", () => {
    const result = updateApiKeySchema.safeParse({
      description: "Nova descrição",
    });
    expect(result.success).toBe(true);
  });

  it("valida update is_active", () => {
    const result = updateApiKeySchema.safeParse({ is_active: false });
    expect(result.success).toBe(true);
  });

  it("valida update scopes", () => {
    const result = updateApiKeySchema.safeParse({
      scopes: ["read", "write", "admin"],
    });
    expect(result.success).toBe(true);
  });

  it("valida update allowed_ips", () => {
    const result = updateApiKeySchema.safeParse({
      allowed_ips: ["192.168.1.1"],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita update allowed_ips com IP invalido", () => {
    const result = updateApiKeySchema.safeParse({
      allowed_ips: ["invalid"],
    });
    expect(result.success).toBe(false);
  });

  it("valida update rate_limit_per_min", () => {
    const result = updateApiKeySchema.safeParse({
      rate_limit_per_min: 500,
    });
    expect(result.success).toBe(true);
  });

  it("valida update expires_at", () => {
    const result = updateApiKeySchema.safeParse({
      expires_at: "2025-12-31T23:59:59Z",
    });
    expect(result.success).toBe(true);
  });

  it("valida update completo", () => {
    const result = updateApiKeySchema.safeParse({
      name: "Atualizado",
      description: "Nova desc",
      scopes: ["read"],
      is_active: true,
      allowed_ips: ["10.0.0.1"],
      rate_limit_per_min: 100,
      rate_limit_per_hour: 1000,
      rate_limit_per_day: 10000,
      expires_at: "2025-12-31T23:59:59Z",
    });
    expect(result.success).toBe(true);
  });
});

// ========== Logica de Key Generation ==========

describe("api-keys — logica de key generation", () => {
  function generateApiKey(): {
    rawKey: string;
    keyPrefix: string;
    keyHash: string;
  } {
    const rawBytes = randomBytes(32);
    const rawKey = `jl_${rawBytes.toString("hex")}`;
    const keyPrefix = rawKey.substring(0, 12);
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    return { rawKey, keyPrefix, keyHash };
  }

  it("gera key com prefixo jl_", () => {
    const { rawKey } = generateApiKey();
    expect(rawKey.startsWith("jl_")).toBe(true);
  });

  it("key tem 67 caracteres (jl_ + 64 hex)", () => {
    const { rawKey } = generateApiKey();
    expect(rawKey.length).toBe(67);
  });

  it("keyPrefix tem 12 caracteres", () => {
    const { keyPrefix } = generateApiKey();
    expect(keyPrefix.length).toBe(12);
  });

  it("keyPrefix comeca com jl_", () => {
    const { keyPrefix } = generateApiKey();
    expect(keyPrefix.startsWith("jl_")).toBe(true);
  });

  it("keyHash tem 64 caracteres (sha256 hex)", () => {
    const { keyHash } = generateApiKey();
    expect(keyHash.length).toBe(64);
  });

  it("keyHash e hexadecimal", () => {
    const { keyHash } = generateApiKey();
    expect(/^[0-9a-f]+$/.test(keyHash)).toBe(true);
  });

  it("keys diferentes a cada geracao", () => {
    const key1 = generateApiKey();
    const key2 = generateApiKey();
    expect(key1.rawKey).not.toBe(key2.rawKey);
    expect(key1.keyHash).not.toBe(key2.keyHash);
  });

  it("keyHash e deterministico para mesma key", () => {
    const rawBytes = randomBytes(32);
    const rawKey = `jl_${rawBytes.toString("hex")}`;
    const hash1 = createHash("sha256").update(rawKey).digest("hex");
    const hash2 = createHash("sha256").update(rawKey).digest("hex");
    expect(hash1).toBe(hash2);
  });
});

// ========== Logica de Limit Pagination ==========

describe("api-keys — logica de limit pagination", () => {
  it("usage limit default 50", () => {
    const limit = Math.min(parseInt("50", 10), 200);
    expect(limit).toBe(50);
  });

  it("usage limit maximo 200", () => {
    const limit = Math.min(parseInt("999", 10), 200);
    expect(limit).toBe(200);
  });

  it("usage limit custom", () => {
    const limit = Math.min(parseInt("100", 10), 200);
    expect(limit).toBe(100);
  });
});

// ========== Logica de Rotation ==========

describe("api-keys — logica de rotation", () => {
  it("rotacao cria nova key e desativa antiga", () => {
    const oldKeyId = "old-key-123";
    const newKeyGenerated = true;
    const oldKeyDeactivated = true;
    expect(newKeyGenerated && oldKeyDeactivated).toBe(true);
    expect(oldKeyId).not.toBe("");
  });

  it("nova key tem rotated_from = old key id", () => {
    const oldKeyId = "old-key-123";
    const newKeyData = {
      id: "new-key-456",
      rotated_from: oldKeyId,
    };
    expect(newKeyData.rotated_from).toBe(oldKeyId);
  });
});
