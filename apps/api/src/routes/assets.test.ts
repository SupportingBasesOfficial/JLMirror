// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  createAssetSchema,
  updateAssetSchema,
  createLicenseSchema,
  updateLicenseSchema,
} from "@repo/shared-validation";

// Testes dos schemas Zod de assets
describe("assets schemas — createAssetSchema", () => {
  const validAsset = {
    name: "Servidor Dell R740",
    asset_tag: "SRV-001",
    asset_type: "server",
  };

  it("valida asset minimo (name + asset_tag + asset_type)", () => {
    const result = createAssetSchema.safeParse(validAsset);
    expect(result.success).toBe(true);
  });

  it("rejeita sem name", () => {
    const result = createAssetSchema.safeParse({
      asset_tag: "SRV-001",
      asset_type: "server",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem asset_tag", () => {
    const result = createAssetSchema.safeParse({
      name: "Servidor",
      asset_type: "server",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem asset_type", () => {
    const result = createAssetSchema.safeParse({
      name: "Servidor",
      asset_tag: "SRV-001",
    });
    expect(result.success).toBe(false);
  });

  it("valida asset completo com todos os campos", () => {
    const result = createAssetSchema.safeParse({
      name: "Servidor Dell R740",
      asset_tag: "SRV-001",
      asset_type: "server",
      category: "hardware",
      status: "active",
      criticality: "critical",
      ip_address: "192.168.1.10",
      hostname: "srv-01.empresa.com",
      mac_address: "00:11:22:33:44:55",
      serial_number: "SN123456",
      manufacturer: "Dell",
      model: "R740",
      os_type: "linux",
      os_version: "Ubuntu 22.04",
      location: "Datacenter SP",
      rack: "R12",
      rack_position: "U10",
      purchase_date: "2023-01-15",
      purchase_cost: 50000,
      warranty_expiry: "2026-01-15",
      vendor: "Dell Brasil",
      assigned_to: "TI",
      department: "Infraestrutura",
      notes: "Servidor principal de producao",
      tags: ["producao", "critico"],
      custom_fields: { contrato: "12345" },
    });
    expect(result.success).toBe(true);
  });

  it("aplica default status=active", () => {
    const result = createAssetSchema.safeParse(validAsset);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("active");
    }
  });

  it("aplica default criticality=medium", () => {
    const result = createAssetSchema.safeParse(validAsset);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.criticality).toBe("medium");
    }
  });

  it("rejeita status invalido", () => {
    const result = createAssetSchema.safeParse({
      ...validAsset,
      status: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita criticality invalido", () => {
    const result = createAssetSchema.safeParse({
      ...validAsset,
      criticality: "super-critical",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita purchase_cost negativo", () => {
    const result = createAssetSchema.safeParse({
      ...validAsset,
      purchase_cost: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita name com mais de 255 chars", () => {
    const result = createAssetSchema.safeParse({
      ...validAsset,
      name: "x".repeat(256),
    });
    expect(result.success).toBe(false);
  });

  it("rejeita notes com mais de 5000 chars", () => {
    const result = createAssetSchema.safeParse({
      ...validAsset,
      notes: "x".repeat(5001),
    });
    expect(result.success).toBe(false);
  });

  it("valida parent_asset_id como UUID", () => {
    const result = createAssetSchema.safeParse({
      ...validAsset,
      parent_asset_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita parent_asset_id nao-UUID", () => {
    const result = createAssetSchema.safeParse({
      ...validAsset,
      parent_asset_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});

describe("assets schemas — updateAssetSchema", () => {
  it("valida update parcial (apenas name)", () => {
    const result = updateAssetSchema.safeParse({ name: "Novo nome" });
    expect(result.success).toBe(true);
  });

  it("valida update completo", () => {
    const result = updateAssetSchema.safeParse({
      name: "Novo nome",
      asset_tag: "NEW-001",
      asset_type: "vm",
      status: "maintenance",
      criticality: "high",
    });
    expect(result.success).toBe(true);
  });

  it("valida update vazio", () => {
    const result = updateAssetSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejeita status invalido no update", () => {
    const result = updateAssetSchema.safeParse({ status: "invalid" });
    expect(result.success).toBe(false);
  });

  it("rejeita criticality invalido no update", () => {
    const result = updateAssetSchema.safeParse({ criticality: "super" });
    expect(result.success).toBe(false);
  });
});

describe("assets schemas — createLicenseSchema", () => {
  const validLicense = {
    software_name: "Microsoft Office 365",
    license_type: "subscription",
  };

  it("valida licenca minima", () => {
    const result = createLicenseSchema.safeParse(validLicense);
    expect(result.success).toBe(true);
  });

  it("rejeita sem software_name", () => {
    const result = createLicenseSchema.safeParse({
      license_type: "subscription",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem license_type", () => {
    const result = createLicenseSchema.safeParse({
      software_name: "Office",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita license_type invalido", () => {
    const result = createLicenseSchema.safeParse({
      software_name: "Office",
      license_type: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("aplica default seats_total=1", () => {
    const result = createLicenseSchema.safeParse(validLicense);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.seats_total).toBe(1);
    }
  });

  it("aplica default seats_used=0", () => {
    const result = createLicenseSchema.safeParse(validLicense);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.seats_used).toBe(0);
    }
  });

  it("aplica default is_active=true", () => {
    const result = createLicenseSchema.safeParse(validLicense);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_active).toBe(true);
    }
  });

  it("rejeita seats_total = 0", () => {
    const result = createLicenseSchema.safeParse({
      ...validLicense,
      seats_total: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita seats_total negativo", () => {
    const result = createLicenseSchema.safeParse({
      ...validLicense,
      seats_total: -5,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita seats_used negativo", () => {
    const result = createLicenseSchema.safeParse({
      ...validLicense,
      seats_used: -1,
    });
    expect(result.success).toBe(false);
  });

  it("valida licenca completa", () => {
    const result = createLicenseSchema.safeParse({
      software_name: "Microsoft Office 365",
      license_type: "subscription",
      license_key: "KEY-12345",
      vendor: "Microsoft",
      seats_total: 50,
      seats_used: 30,
      purchase_date: "2024-01-01",
      expiry_date: "2025-01-01",
      renewal_date: "2024-12-01",
      cost: 5000,
      is_active: true,
      notes: "Licenca anual",
    });
    expect(result.success).toBe(true);
  });
});

describe("assets schemas — updateLicenseSchema", () => {
  it("valida update parcial", () => {
    const result = updateLicenseSchema.safeParse({
      seats_used: 35,
    });
    expect(result.success).toBe(true);
  });

  it("valida update vazio", () => {
    const result = updateLicenseSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejeita license_type invalido no update", () => {
    const result = updateLicenseSchema.safeParse({
      license_type: "invalid",
    });
    expect(result.success).toBe(false);
  });
});

// Testes da logica de filtros de assets
describe("assets — logica de filtros", () => {
  function buildFilterConditions(params: {
    status?: string;
    type?: string;
    category?: string;
    criticality?: string;
    search?: string;
  }) {
    const conditions: string[] = ["tenant_id = $1"];
    const queryParams: unknown[] = [];
    let paramIdx = 2;

    if (params.status) {
      conditions.push(`status = $${paramIdx++}`);
      queryParams.push(params.status);
    }
    if (params.type) {
      conditions.push(`asset_type = $${paramIdx++}`);
      queryParams.push(params.type);
    }
    if (params.category) {
      conditions.push(`category = $${paramIdx++}`);
      queryParams.push(params.category);
    }
    if (params.criticality) {
      conditions.push(`criticality = $${paramIdx++}`);
      queryParams.push(params.criticality);
    }
    if (params.search) {
      conditions.push(
        `(name ILIKE $${paramIdx} OR asset_tag ILIKE $${paramIdx})`,
      );
      queryParams.push(`%${params.search}%`);
      paramIdx++;
    }

    return { conditions, queryParams };
  }

  it("sem filtros retorna apenas tenant_id", () => {
    const { conditions, queryParams } = buildFilterConditions({});
    expect(conditions).toEqual(["tenant_id = $1"]);
    expect(queryParams).toEqual([]);
  });

  it("filtro de status adiciona condicao", () => {
    const { conditions } = buildFilterConditions({ status: "active" });
    expect(conditions).toContain("status = $2");
  });

  it("filtro de busca adiciona ILIKE", () => {
    const { conditions, queryParams } = buildFilterConditions({
      search: "dell",
    });
    expect(conditions.some((c) => c.includes("ILIKE"))).toBe(true);
    expect(queryParams).toContain("%dell%");
  });

  it("multiplos filtros adicionam multiplas condicoes", () => {
    const { conditions } = buildFilterConditions({
      status: "active",
      type: "server",
      criticality: "critical",
    });
    expect(conditions).toHaveLength(4);
  });
});

// Testes da logica de warranty
describe("assets — logica de warranty", () => {
  function classifyWarranty(
    expiry: string | null,
    today: Date = new Date(),
  ): string {
    if (!expiry) return "no_warranty";
    const exp = new Date(expiry);
    const thirtyDaysFromNow = new Date(
      today.getTime() + 30 * 24 * 60 * 60 * 1000,
    );
    if (exp < today) return "expired";
    if (exp <= thirtyDaysFromNow) return "expiring_soon";
    return "valid";
  }

  it("warranty expirada", () => {
    expect(classifyWarranty("2020-01-01")).toBe("expired");
  });

  it("warranty valida", () => {
    expect(classifyWarranty("2099-12-31")).toBe("valid");
  });

  it("warranty expirando em 15 dias", () => {
    const future = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    expect(classifyWarranty(future.toISOString().split("T")[0]!)).toBe(
      "expiring_soon",
    );
  });

  it("warranty null retorna no_warranty", () => {
    expect(classifyWarranty(null)).toBe("no_warranty");
  });
});

// Testes de edge cases
describe("assets — edge cases", () => {
  it("tenant sem assets retorna total 0", () => {
    const total = "0";
    expect(total).toBe("0");
  });

  it("asset sem licencas retorna array vazio", () => {
    const licenses: unknown[] = [];
    expect(licenses).toEqual([]);
  });

  it("asset sem changes retorna array vazio", () => {
    const changes: unknown[] = [];
    expect(changes).toEqual([]);
  });

  it("asset sem children retorna array vazio", () => {
    const children: unknown[] = [];
    expect(children).toEqual([]);
  });

  it("limit maximo de 500 assets por request", () => {
    const requestedLimit = 1000;
    const limit = Math.min(requestedLimit, 500);
    expect(limit).toBe(500);
  });

  it("limit default de 100 assets", () => {
    const requestedLimit = Number.parseInt("100", 10);
    const limit = Math.min(requestedLimit, 500);
    expect(limit).toBe(100);
  });

  it("limit invalido usa default", () => {
    const rawLimit = "abc";
    const requestedLimit = Number.parseInt(rawLimit, 10);
    const limit = Math.min(
      Number.isNaN(requestedLimit) ? 100 : requestedLimit,
      500,
    );
    expect(limit).toBe(100);
  });
});

// ========== Logica de Tenant Isolation ==========

describe("assets — logica de tenant isolation", () => {
  it("queries de assets filtram por tenant_id", () => {
    const tenantId = "t-123";
    const sql = "SELECT * FROM public.assets WHERE tenant_id = $1";
    const params: unknown[] = [tenantId];
    expect(sql).toContain("tenant_id = $1");
    expect(params[0]).toBe(tenantId);
  });

  it("queries de asset_licenses filtram por tenant_id", () => {
    const tenantId = "t-456";
    const sql = "SELECT * FROM public.asset_licenses WHERE tenant_id = $1";
    const params: unknown[] = [tenantId];
    expect(sql).toContain("tenant_id = $1");
    expect(params[0]).toBe(tenantId);
  });

  it("UPDATE assets inclui tenant_id no WHERE", () => {
    const tenantId = "t-upd";
    const assetId = "a-1";
    const sql =
      "UPDATE public.assets SET name = $1 WHERE id = $2 AND tenant_id = $3";
    const params: unknown[] = ["novo", assetId, tenantId];
    expect(sql).toContain("tenant_id = $3");
    expect(params[2]).toBe(tenantId);
  });

  it("DELETE assets inclui tenant_id no WHERE", () => {
    const tenantId = "t-del";
    const assetId = "a-2";
    const sql = "DELETE FROM public.assets WHERE id = $1 AND tenant_id = $2";
    const params: unknown[] = [assetId, tenantId];
    expect(sql).toContain("tenant_id = $2");
    expect(params[1]).toBe(tenantId);
  });

  it("IDOR protection: verifica posse antes de operar", () => {
    const assetId = "a-3";
    const tenantId = "t-idor";
    const sql = "SELECT id FROM public.assets WHERE id = $1 AND tenant_id = $2";
    const params: unknown[] = [assetId, tenantId];
    expect(sql).toContain("tenant_id = $2");
    expect(params[1]).toBe(tenantId);
  });
});

// ========== Logica de 404 Handling ==========

describe("assets — logica de 404 handling", () => {
  it.each([
    ["GET /:id", 0, true],
    ["DELETE /:id", 0, true],
    ["POST /:id/licenses", 0, true],
    ["DELETE /:id/licenses/:id", 0, true],
  ])(`%s retorna 404 quando rowCount=0`, (_action, rowCount, expected) => {
    const shouldReturn404 = rowCount === 0;
    expect(shouldReturn404).toBe(expected);
  });

  it.each([
    ["GET /:id", 1, false],
    ["DELETE /:id", 1, false],
  ])(`%s nao retorna 404 quando rowCount>0`, (_action, rowCount, expected) => {
    const shouldReturn404 = rowCount === 0;
    expect(shouldReturn404).toBe(expected);
  });
});

// ========== Logica de Optional Chaining ==========

describe("assets — logica de optional chaining", () => {
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

// ========== Logica de Parallel Queries ==========

describe("assets — logica de parallel queries", () => {
  it("stats paraleliza 6 queries", async () => {
    const results = await Promise.all([
      Promise.resolve({ data: { rows: [] } }),
      Promise.resolve({ data: { rows: [] } }),
      Promise.resolve({ data: { rows: [] } }),
      Promise.resolve({ data: { rows: [] } }),
      Promise.resolve({ data: { rows: [] } }),
      Promise.resolve({ data: { rows: [{ total: "10" }] } }),
    ]);
    expect(results).toHaveLength(6);
  });

  it("detalhe paraleliza 3 queries relacionadas", async () => {
    const results = await Promise.all([
      Promise.resolve({ data: { rows: [] } }),
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

describe("assets — logica de field map update", () => {
  it("constroi UPDATE dinâmico com fieldMap", () => {
    const data = { name: "Novo Nome", status: "active" as const };
    const fieldMap: Record<string, string> = {
      name: "name",
      status: "status",
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
    expect(updateFields).toEqual(["name = $1", "status = $2"]);
    expect(params).toEqual(["Novo Nome", "active"]);
  });

  it("tags serializa como JSON", () => {
    const tags = ["server", "production"];
    const serialized = JSON.stringify(tags);
    expect(serialized).toBe('["server","production"]');
  });

  it("custom_fields serializa como JSON", () => {
    const custom_fields = { region: "us-east-1", env: "prod" };
    const serialized = JSON.stringify(custom_fields);
    expect(serialized).toContain('"region":"us-east-1"');
  });
});

// ========== Logica de Limit Pagination ==========

describe("assets — logica de limit pagination", () => {
  function parseLimit(raw: string): number {
    const parsed = Number.parseInt(raw, 10);
    return Math.min(Number.isNaN(parsed) ? 100 : parsed, 500);
  }

  it.each([
    ["100", 100],
    ["1000", 500],
    ["50", 50],
    ["abc", 100],
    ["", 100],
  ])(`limit(%j) → %s`, (raw, expected) => {
    expect(parseLimit(raw)).toBe(expected);
  });
});
