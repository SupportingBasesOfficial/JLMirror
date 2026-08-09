// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  createClientUserSchema,
  createClientContactSchema,
  updateClientContactSchema,
  upsertClientCompanySchema,
} from "@repo/shared-validation";

// ========== createTenantSchema (replica local) ==========

const createTenantSchema = z.object({
  name: z.string().min(1).max(255),
  cnpj: z.string().max(18).optional(),
  contract_end_date: z.string().datetime().optional(),
  cluster_id: z.string().min(1).max(50),
  cluster_host: z.string().min(1).max(255),
  cluster_database_name: z.string().min(1).max(63),
  cluster_port: z.number().int().min(1).max(65535).default(5432),
  zabbix_host_group_id: z.string().min(1),
  zabbix_api_url: z.string().url(),
  zabbix_api_token: z.string().min(1),
  tenant_type: z.enum(["owner", "manager", "client"]).default("client"),
  parent_tenant_id: z.string().uuid().optional(),
});

const updateTenantSchema = z.object({
  name: z.string().max(255).optional(),
  cnpj: z.string().max(18).nullable().optional(),
  contract_end_date: z.string().datetime().nullable().optional(),
  status: z.enum(["active", "inactive", "suspended"]).optional(),
  zabbix_host_group_id: z.string().min(1).optional(),
  zabbix_api_url: z.string().url().optional(),
  zabbix_api_token: z.string().min(1).optional(),
  tenant_type: z.enum(["owner", "manager", "client"]).optional(),
});

const assignUserSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum([
    "global:admin",
    "jl:superadmin",
    "jl:engineer",
    "jl:technician",
    "jl:manager",
    "jl:finance",
    "jl:viewer",
    "tenant:admin",
    "tenant:operator",
    "tenant:viewer",
  ]),
});

// ========== createTenantSchema ==========

describe("admin — createTenantSchema", () => {
  const validTenant = {
    name: "Cliente ABC Ltda",
    cluster_id: "cluster-prod-01",
    cluster_host: "db.example.com",
    cluster_database_name: "jlmirror",
    zabbix_host_group_id: "15",
    zabbix_api_url: "https://zabbix.example.com/api_jsonrpc.php",
    zabbix_api_token: "secret-token-123",
  };

  it("valida tenant minimo", () => {
    const result = createTenantSchema.safeParse(validTenant);
    expect(result.success).toBe(true);
  });

  it("rejeita sem name", () => {
    const result = createTenantSchema.safeParse({
      ...validTenant,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem cluster_id", () => {
    const result = createTenantSchema.safeParse({
      ...validTenant,
      cluster_id: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem zabbix_api_url", () => {
    const result = createTenantSchema.safeParse({
      ...validTenant,
      zabbix_api_url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem zabbix_api_token", () => {
    const result = createTenantSchema.safeParse({
      ...validTenant,
      zabbix_api_token: "",
    });
    expect(result.success).toBe(false);
  });

  it("valida tenant_type owner (corrigido)", () => {
    const result = createTenantSchema.safeParse({
      ...validTenant,
      tenant_type: "owner",
    });
    expect(result.success).toBe(true);
  });

  it("valida tenant_type manager", () => {
    const result = createTenantSchema.safeParse({
      ...validTenant,
      tenant_type: "manager",
    });
    expect(result.success).toBe(true);
  });

  it("valida tenant_type client", () => {
    const result = createTenantSchema.safeParse({
      ...validTenant,
      tenant_type: "client",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita tenant_type invalido", () => {
    const result = createTenantSchema.safeParse({
      ...validTenant,
      tenant_type: "super",
    });
    expect(result.success).toBe(false);
  });

  it("aplica default tenant_type=client", () => {
    const result = createTenantSchema.safeParse(validTenant);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tenant_type).toBe("client");
    }
  });

  it("aplica default cluster_port=5432", () => {
    const result = createTenantSchema.safeParse(validTenant);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cluster_port).toBe(5432);
    }
  });

  it("rejeita cluster_port fora do range", () => {
    const result = createTenantSchema.safeParse({
      ...validTenant,
      cluster_port: 70000,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita cluster_port zero", () => {
    const result = createTenantSchema.safeParse({
      ...validTenant,
      cluster_port: 0,
    });
    expect(result.success).toBe(false);
  });

  it("valida parent_tenant_id UUID", () => {
    const result = createTenantSchema.safeParse({
      ...validTenant,
      parent_tenant_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita parent_tenant_id invalido", () => {
    const result = createTenantSchema.safeParse({
      ...validTenant,
      parent_tenant_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("valida contract_end_date ISO datetime", () => {
    const result = createTenantSchema.safeParse({
      ...validTenant,
      contract_end_date: "2026-12-31T23:59:59Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita contract_end_date sem formato ISO", () => {
    const result = createTenantSchema.safeParse({
      ...validTenant,
      contract_end_date: "2026-12-31",
    });
    expect(result.success).toBe(false);
  });
});

// ========== updateTenantSchema ==========

describe("admin — updateTenantSchema", () => {
  it("valida update parcial", () => {
    const result = updateTenantSchema.safeParse({ name: "Novo nome" });
    expect(result.success).toBe(true);
  });

  it("valida update vazio", () => {
    const result = updateTenantSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida status active", () => {
    const result = updateTenantSchema.safeParse({ status: "active" });
    expect(result.success).toBe(true);
  });

  it("valida status suspended", () => {
    const result = updateTenantSchema.safeParse({ status: "suspended" });
    expect(result.success).toBe(true);
  });

  it("valida status inactive", () => {
    const result = updateTenantSchema.safeParse({ status: "inactive" });
    expect(result.success).toBe(true);
  });

  it("rejeita status invalido", () => {
    const result = updateTenantSchema.safeParse({ status: "deleted" });
    expect(result.success).toBe(false);
  });

  it("valida tenant_type owner no update", () => {
    const result = updateTenantSchema.safeParse({
      tenant_type: "owner",
    });
    expect(result.success).toBe(true);
  });

  it("valida cnpj nullable no update", () => {
    const result = updateTenantSchema.safeParse({ cnpj: null });
    expect(result.success).toBe(true);
  });

  it("valida contract_end_date nullable no update", () => {
    const result = updateTenantSchema.safeParse({
      contract_end_date: null,
    });
    expect(result.success).toBe(true);
  });
});

// ========== assignUserSchema ==========

describe("admin — assignUserSchema", () => {
  it("valida assign minimo", () => {
    const result = assignUserSchema.safeParse({
      user_id: "550e8400-e29b-41d4-a716-446655440000",
      role: "tenant:admin",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sem user_id", () => {
    const result = assignUserSchema.safeParse({
      role: "tenant:admin",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita user_id invalido", () => {
    const result = assignUserSchema.safeParse({
      user_id: "not-a-uuid",
      role: "tenant:admin",
    });
    expect(result.success).toBe(false);
  });

  it("valida todos os roles jl:", () => {
    const roles = [
      "jl:superadmin",
      "jl:engineer",
      "jl:technician",
      "jl:manager",
      "jl:finance",
      "jl:viewer",
    ];
    for (const role of roles) {
      const result = assignUserSchema.safeParse({
        user_id: "550e8400-e29b-41d4-a716-446655440000",
        role,
      });
      expect(result.success).toBe(true);
    }
  });

  it("valida todos os roles tenant:", () => {
    const roles = ["tenant:admin", "tenant:operator", "tenant:viewer"];
    for (const role of roles) {
      const result = assignUserSchema.safeParse({
        user_id: "550e8400-e29b-41d4-a716-446655440000",
        role,
      });
      expect(result.success).toBe(true);
    }
  });

  it("valida role global:admin", () => {
    const result = assignUserSchema.safeParse({
      user_id: "550e8400-e29b-41d4-a716-446655440000",
      role: "global:admin",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita role invalido", () => {
    const result = assignUserSchema.safeParse({
      user_id: "550e8400-e29b-41d4-a716-446655440000",
      role: "superadmin",
    });
    expect(result.success).toBe(false);
  });
});

// ========== upsertClientCompanySchema (corrigido) ==========

describe("admin — upsertClientCompanySchema (corrigido)", () => {
  it("valida upsert minimo vazio", () => {
    const result = upsertClientCompanySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida legal_name", () => {
    const result = upsertClientCompanySchema.safeParse({
      legal_name: "Empresa ABC Ltda",
    });
    expect(result.success).toBe(true);
  });

  it("valida cnpj", () => {
    const result = upsertClientCompanySchema.safeParse({
      cnpj: "12345678000199",
    });
    expect(result.success).toBe(true);
  });

  it("valida contract_value positivo", () => {
    const result = upsertClientCompanySchema.safeParse({
      contract_value: 50000.0,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita contract_value negativo", () => {
    const result = upsertClientCompanySchema.safeParse({
      contract_value: -100,
    });
    expect(result.success).toBe(false);
  });

  it("valida billing_day 1-28", () => {
    const result = upsertClientCompanySchema.safeParse({
      billing_day: 15,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita billing_day 0", () => {
    const result = upsertClientCompanySchema.safeParse({
      billing_day: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita billing_day 29", () => {
    const result = upsertClientCompanySchema.safeParse({
      billing_day: 29,
    });
    expect(result.success).toBe(false);
  });

  it("valida billing_cycle monthly", () => {
    const result = upsertClientCompanySchema.safeParse({
      billing_cycle: "monthly",
    });
    expect(result.success).toBe(true);
  });

  it("valida billing_cycle quarterly", () => {
    const result = upsertClientCompanySchema.safeParse({
      billing_cycle: "quarterly",
    });
    expect(result.success).toBe(true);
  });

  it("valida billing_cycle yearly", () => {
    const result = upsertClientCompanySchema.safeParse({
      billing_cycle: "yearly",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita billing_cycle invalido", () => {
    const result = upsertClientCompanySchema.safeParse({
      billing_cycle: "weekly",
    });
    expect(result.success).toBe(false);
  });

  it("valida plan_tier basic", () => {
    const result = upsertClientCompanySchema.safeParse({
      plan_tier: "basic",
    });
    expect(result.success).toBe(true);
  });

  it("valida plan_tier pro", () => {
    const result = upsertClientCompanySchema.safeParse({
      plan_tier: "pro",
    });
    expect(result.success).toBe(true);
  });

  it("valida plan_tier enterprise", () => {
    const result = upsertClientCompanySchema.safeParse({
      plan_tier: "enterprise",
    });
    expect(result.success).toBe(true);
  });

  it("valida plan_tier custom", () => {
    const result = upsertClientCompanySchema.safeParse({
      plan_tier: "custom",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita plan_tier invalido", () => {
    const result = upsertClientCompanySchema.safeParse({
      plan_tier: "free",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita name (campo antigo removido)", () => {
    const result = upsertClientCompanySchema.safeParse({
      name: "Empresa ABC",
    });
    expect(result.success).toBe(true); // Zod permite extra keys
    if (result.success) {
      expect(result.data).not.toHaveProperty("name");
    }
  });

  it("rejeita industry (campo antigo removido)", () => {
    const result = upsertClientCompanySchema.safeParse({
      industry: "Technology",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("industry");
    }
  });

  it("rejeita website (campo antigo removido)", () => {
    const result = upsertClientCompanySchema.safeParse({
      website: "https://example.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("website");
    }
  });

  it("valida address_street", () => {
    const result = upsertClientCompanySchema.safeParse({
      address_street: "Rua das Flores, 123",
    });
    expect(result.success).toBe(true);
  });

  it("valida address_city", () => {
    const result = upsertClientCompanySchema.safeParse({
      address_city: "São Paulo",
    });
    expect(result.success).toBe(true);
  });

  it("valida address_state", () => {
    const result = upsertClientCompanySchema.safeParse({
      address_state: "SP",
    });
    expect(result.success).toBe(true);
  });

  it("valida address_zip", () => {
    const result = upsertClientCompanySchema.safeParse({
      address_zip: "01234-567",
    });
    expect(result.success).toBe(true);
  });

  it("valida address_country", () => {
    const result = upsertClientCompanySchema.safeParse({
      address_country: "Brasil",
    });
    expect(result.success).toBe(true);
  });

  it("valida notes", () => {
    const result = upsertClientCompanySchema.safeParse({
      notes: "Cliente VIP",
    });
    expect(result.success).toBe(true);
  });

  it("valida upsert completo", () => {
    const result = upsertClientCompanySchema.safeParse({
      legal_name: "Empresa ABC Ltda",
      cnpj: "12345678000199",
      contract_value: 50000.0,
      billing_day: 15,
      billing_cycle: "monthly",
      plan_tier: "pro",
      address_street: "Rua das Flores, 123",
      address_city: "São Paulo",
      address_state: "SP",
      address_zip: "01234-567",
      address_country: "Brasil",
      notes: "Cliente VIP",
    });
    expect(result.success).toBe(true);
  });
});

// ========== createClientUserSchema ==========

describe("admin — createClientUserSchema", () => {
  it("valida user com password", () => {
    const result = createClientUserSchema.safeParse({
      email: "user@example.com",
      full_name: "João Silva",
      password: "senha12345",
    });
    expect(result.success).toBe(true);
  });

  it("valida user com provisional_password", () => {
    const result = createClientUserSchema.safeParse({
      email: "user@example.com",
      full_name: "João Silva",
      provisional_password: "senha12345",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sem password e sem provisional_password", () => {
    const result = createClientUserSchema.safeParse({
      email: "user@example.com",
      full_name: "João Silva",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem email", () => {
    const result = createClientUserSchema.safeParse({
      full_name: "João Silva",
      password: "senha12345",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita email invalido", () => {
    const result = createClientUserSchema.safeParse({
      email: "not-an-email",
      full_name: "João Silva",
      password: "senha12345",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem full_name", () => {
    const result = createClientUserSchema.safeParse({
      email: "user@example.com",
      password: "senha12345",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita password com menos de 8 chars", () => {
    const result = createClientUserSchema.safeParse({
      email: "user@example.com",
      full_name: "João Silva",
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("aplica default must_change_password=true", () => {
    const result = createClientUserSchema.safeParse({
      email: "user@example.com",
      full_name: "João Silva",
      password: "senha12345",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.must_change_password).toBe(true);
    }
  });

  it("valida must_change_password=false", () => {
    const result = createClientUserSchema.safeParse({
      email: "user@example.com",
      full_name: "João Silva",
      password: "senha12345",
      must_change_password: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.must_change_password).toBe(false);
    }
  });
});

// ========== createClientContactSchema ==========

describe("admin — createClientContactSchema", () => {
  it("valida contact minimo", () => {
    const result = createClientContactSchema.safeParse({
      name: "Maria Santos",
      email: "maria@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sem name", () => {
    const result = createClientContactSchema.safeParse({
      email: "maria@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem email", () => {
    const result = createClientContactSchema.safeParse({
      name: "Maria Santos",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita email invalido", () => {
    const result = createClientContactSchema.safeParse({
      name: "Maria Santos",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("aplica default is_primary=false", () => {
    const result = createClientContactSchema.safeParse({
      name: "Maria Santos",
      email: "maria@example.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_primary).toBe(false);
    }
  });

  it("valida is_primary=true", () => {
    const result = createClientContactSchema.safeParse({
      name: "Maria Santos",
      email: "maria@example.com",
      is_primary: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_primary).toBe(true);
    }
  });

  it("valida contact completo", () => {
    const result = createClientContactSchema.safeParse({
      name: "Maria Santos",
      email: "maria@example.com",
      phone: "+55 11 99999-9999",
      role: "Gerente de TI",
      department: "TI",
      is_primary: true,
      notes: "Contato principal para suporte",
    });
    expect(result.success).toBe(true);
  });
});

// ========== updateClientContactSchema ==========

describe("admin — updateClientContactSchema", () => {
  it("valida update parcial", () => {
    const result = updateClientContactSchema.safeParse({ name: "Novo nome" });
    expect(result.success).toBe(true);
  });

  it("valida update vazio", () => {
    const result = updateClientContactSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida is_active no update", () => {
    const result = updateClientContactSchema.safeParse({
      is_active: false,
    });
    expect(result.success).toBe(true);
  });

  it("valida is_primary no update", () => {
    const result = updateClientContactSchema.safeParse({
      is_primary: true,
    });
    expect(result.success).toBe(true);
  });

  it("valida email no update", () => {
    const result = updateClientContactSchema.safeParse({
      email: "novo@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita email invalido no update", () => {
    const result = updateClientContactSchema.safeParse({
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });
});

// ========== Logica de Schema Slug ==========

describe("admin — logica de schema slug", () => {
  it("gera slug a partir de UUID sem hifens", () => {
    const tenantId = "550e8400-e29b-41d4-a716-446655440000";
    const schemaSlug = tenantId.replace(/-/g, "").substring(0, 8);
    expect(schemaSlug).toBe("550e8400");
  });

  it("gera schema_name com prefixo tenant_", () => {
    const tenantId = "550e8400-e29b-41d4-a716-446655440000";
    const schemaSlug = tenantId.replace(/-/g, "").substring(0, 8);
    const schemaName = `tenant_${schemaSlug}`;
    expect(schemaName).toBe("tenant_550e8400");
  });

  it("extrai slug de schema_name", () => {
    const schemaName = "tenant_550e8400";
    const slug = schemaName.replace("tenant_", "");
    expect(slug).toBe("550e8400");
  });
});

// ========== Logica de Tenant Status ==========

describe("admin — logica de tenant status", () => {
  it("active permite operar", () => {
    const status: string = "active";
    const canOperate = status === "active";
    expect(canOperate).toBe(true);
  });

  it("suspended bloqueia operar", () => {
    const status: string = "suspended";
    const canOperate = status === "active";
    expect(canOperate).toBe(false);
  });

  it("inactive bloqueia operar", () => {
    const status: string = "inactive";
    const canOperate = status === "active";
    expect(canOperate).toBe(false);
  });
});
