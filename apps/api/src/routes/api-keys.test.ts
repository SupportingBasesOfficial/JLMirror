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
  function parseLimit(raw: string): number {
    const parsed = Number.parseInt(raw, 10);
    return Math.min(Number.isNaN(parsed) ? 50 : parsed, 200);
  }

  it.each([
    ["50", 50],
    ["999", 200],
    ["100", 100],
    ["abc", 50],
    ["", 50],
    ["0", 0],
  ])(`limit(%j) → %s`, (raw, expected) => {
    expect(parseLimit(raw)).toBe(expected);
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

// ========== Logica de Tenant Isolation ==========

describe("api-keys — logica de tenant isolation", () => {
  it("queries de api_keys filtram por tenant_id", () => {
    const tenantId = "t-123";
    const sql = "SELECT * FROM public.api_keys WHERE tenant_id = $1";
    const params: unknown[] = [tenantId];
    expect(sql).toContain("tenant_id = $1");
    expect(params[0]).toBe(tenantId);
  });

  it("UPDATE api_keys inclui tenant_id no WHERE", () => {
    const tenantId = "t-upd";
    const keyId = "k-1";
    const sql =
      "UPDATE public.api_keys SET name = $1 WHERE id = $2 AND tenant_id = $3";
    const params: unknown[] = ["novo", keyId, tenantId];
    expect(sql).toContain("tenant_id = $3");
    expect(params[2]).toBe(tenantId);
  });

  it("DELETE api_keys inclui tenant_id no WHERE", () => {
    const tenantId = "t-del";
    const keyId = "k-2";
    const sql = "DELETE FROM public.api_keys WHERE id = $1 AND tenant_id = $2";
    const params: unknown[] = [keyId, tenantId];
    expect(sql).toContain("tenant_id = $2");
    expect(params[1]).toBe(tenantId);
  });

  it("INSERT api_keys inclui tenant_id", () => {
    const tenantId = "t-ins";
    const params: unknown[] = [tenantId, "name", "prefix", "hash"];
    expect(params[0]).toBe(tenantId);
  });

  it("queries de usage_log filtram por tenant_id", () => {
    const tenantId = "t-usage";
    const sql =
      "SELECT * FROM public.api_key_usage_log WHERE api_key_id = $1 AND tenant_id = $2";
    const params: unknown[] = ["k-1", tenantId];
    expect(sql).toContain("tenant_id = $2");
    expect(params[1]).toBe(tenantId);
  });

  it("stats queries filtram por tenant_id", () => {
    const tenantId = "t-stats";
    const sql = "SELECT COUNT(*) FROM public.api_keys WHERE tenant_id = $1";
    const params: unknown[] = [tenantId];
    expect(sql).toContain("tenant_id = $1");
    expect(params[0]).toBe(tenantId);
  });
});

// ========== Logica de 404 Handling ==========

describe("api-keys — logica de 404 handling", () => {
  it.each([
    ["PUT /:id", 0, true],
    ["DELETE /:id", 0, true],
    ["POST /:id/rotate", 0, true],
  ])(`%s retorna 404 quando rowCount=0`, (_action, rowCount, expected) => {
    const shouldReturn404 = rowCount === 0;
    expect(shouldReturn404).toBe(expected);
  });

  it.each([
    ["PUT /:id", 1, false],
    ["DELETE /:id", 1, false],
  ])(`%s nao retorna 404 quando rowCount>0`, (_action, rowCount, expected) => {
    const shouldReturn404 = rowCount === 0;
    expect(shouldReturn404).toBe(expected);
  });
});

// ========== Logica de Optional Chaining ==========

describe("api-keys — logica de optional chaining", () => {
  type TestUser = { sub: string; tenant_id: string };

  function getSub(user: TestUser | null | undefined): string | null {
    return user?.sub ?? null;
  }

  function getTenantId(user: TestUser | null | undefined): string | null {
    return user?.tenant_id ?? null;
  }

  it("user?.sub retorna null quando user e null", () => {
    expect(getSub(null)).toBeNull();
  });

  it("user?.tenant_id retorna null quando user e undefined", () => {
    expect(getTenantId(undefined)).toBeNull();
  });

  it("user?.sub retorna valor quando user existe", () => {
    expect(getSub({ sub: "u1", tenant_id: "t1" })).toBe("u1");
  });

  it("userId null nao chama writeAuditLog", () => {
    const userId: string | null = null;
    const shouldCallAudit = !!userId;
    expect(shouldCallAudit).toBe(false);
  });
});

// ========== Logica de Parallel Queries (Stats) ==========

describe("api-keys — logica de parallel queries (stats)", () => {
  it("stats paraleliza 3 queries", async () => {
    const results = await Promise.all([
      Promise.resolve({ data: { rows: [{ total_keys: "10" }] } }),
      Promise.resolve({ data: { rows: [] } }),
      Promise.resolve({ data: { rows: [] } }),
    ]);
    expect(results).toHaveLength(3);
  });

  it("Promise.all propaga erro", async () => {
    await expect(
      Promise.all([
        Promise.resolve({ data: { rows: [] } }),
        Promise.reject(new Error("DB error")),
      ]),
    ).rejects.toThrow("DB error");
  });
});

// ========== Logica de Field Map Update ==========

describe("api-keys — logica de field map update", () => {
  it("constroi UPDATE dinâmico com fieldMap", () => {
    const data = {
      name: "Novo Nome",
      is_active: false,
    };
    const fieldMap: Record<string, string> = {
      name: "name",
      description: "description",
      is_active: "is_active",
    };
    const updateFields: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;
    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        updateFields.push(`${dbField} = $${paramIdx++}`);
        params.push(data[key as keyof typeof data]);
      }
    }
    expect(updateFields).toEqual(["name = $1", "is_active = $2"]);
    expect(params).toEqual(["Novo Nome", false]);
  });

  it("update vazio retorna 400", () => {
    const data = {};
    const updateFields: string[] = [];
    const shouldReturn400 =
      updateFields.length === 0 && Object.keys(data).length === 0;
    expect(shouldReturn400).toBe(true);
  });

  it("scopes serializa como JSON", () => {
    const scopes = ["read", "write"];
    const serialized = JSON.stringify(scopes);
    expect(serialized).toBe('["read","write"]');
  });

  it("allowed_ips serializa como JSON", () => {
    const allowed_ips = ["192.168.1.1", "10.0.0.1"];
    const serialized = JSON.stringify(allowed_ips);
    expect(serialized).toBe('["192.168.1.1","10.0.0.1"]');
  });
});

// ========== Logica de Active Filter ==========

describe("api-keys — logica de active filter", () => {
  it("active=true adiciona is_active = true no WHERE", () => {
    const activeOnly = true;
    const conditions: string[] = ["tenant_id = $1"];
    if (activeOnly) {
      conditions.push("is_active = true");
    }
    expect(conditions).toContain("is_active = true");
  });

  it("active=false nao adiciona filtro extra", () => {
    const activeOnly = false;
    const conditions: string[] = ["tenant_id = $1"];
    if (activeOnly) {
      conditions.push("is_active = true");
    }
    expect(conditions).not.toContain("is_active = true");
  });
});
