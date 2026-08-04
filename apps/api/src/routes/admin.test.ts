// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import { z } from "zod";

// Replica dos schemas definidos em admin.ts (onboarding de tenant)
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
});

const updateTenantSchema = z.object({
  name: z.string().max(255).optional(),
  cnpj: z.string().max(18).nullable().optional(),
  contract_end_date: z.string().datetime().nullable().optional(),
  status: z.enum(["active", "inactive", "suspended"]).optional(),
  zabbix_host_group_id: z.string().min(1).optional(),
  zabbix_api_url: z.string().url().optional(),
  zabbix_api_token: z.string().min(1).optional(),
});

describe("admin schemas — createTenantSchema (onboarding)", () => {
  it("valida tenant com campos obrigatorios", () => {
    const result = createTenantSchema.safeParse({
      name: "Cliente Alpha LTDA",
      cluster_id: "cluster-01",
      cluster_host: "db.internal.local",
      cluster_database_name: "tenant_alpha",
      zabbix_host_group_id: "15",
      zabbix_api_url: "https://zabbix.example.com",
      zabbix_api_token: "secret-token-123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cluster_port).toBe(5432);
    }
  });

  it("valida tenant com todos os campos", () => {
    const result = createTenantSchema.safeParse({
      name: "Cliente Alpha LTDA",
      cnpj: "12.345.678/0001-90",
      contract_end_date: "2025-12-31T23:59:59Z",
      cluster_id: "cluster-01",
      cluster_host: "db.internal.local",
      cluster_database_name: "tenant_alpha",
      cluster_port: 5433,
      zabbix_host_group_id: "15",
      zabbix_api_url: "https://zabbix.example.com",
      zabbix_api_token: "secret-token-123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cluster_port).toBe(5433);
    }
  });

  it("rejeita sem name", () => {
    const result = createTenantSchema.safeParse({
      cluster_id: "cluster-01",
      cluster_host: "db.internal.local",
      cluster_database_name: "tenant_alpha",
      zabbix_host_group_id: "15",
      zabbix_api_url: "https://zabbix.example.com",
      zabbix_api_token: "secret-token-123",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita name vazio", () => {
    const result = createTenantSchema.safeParse({
      name: "",
      cluster_id: "cluster-01",
      cluster_host: "db.internal.local",
      cluster_database_name: "tenant_alpha",
      zabbix_host_group_id: "15",
      zabbix_api_url: "https://zabbix.example.com",
      zabbix_api_token: "secret-token-123",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita zabbix_api_url invalida", () => {
    const result = createTenantSchema.safeParse({
      name: "Cliente",
      cluster_id: "cluster-01",
      cluster_host: "db.internal.local",
      cluster_database_name: "tenant_alpha",
      zabbix_host_group_id: "15",
      zabbix_api_url: "not-a-url",
      zabbix_api_token: "secret-token-123",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem zabbix_api_token", () => {
    const result = createTenantSchema.safeParse({
      name: "Cliente",
      cluster_id: "cluster-01",
      cluster_host: "db.internal.local",
      cluster_database_name: "tenant_alpha",
      zabbix_host_group_id: "15",
      zabbix_api_url: "https://zabbix.example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita cluster_port fora do range", () => {
    const result = createTenantSchema.safeParse({
      name: "Cliente",
      cluster_id: "cluster-01",
      cluster_host: "db.internal.local",
      cluster_database_name: "tenant_alpha",
      cluster_port: 70000,
      zabbix_host_group_id: "15",
      zabbix_api_url: "https://zabbix.example.com",
      zabbix_api_token: "token",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita cluster_port zero", () => {
    const result = createTenantSchema.safeParse({
      name: "Cliente",
      cluster_id: "cluster-01",
      cluster_host: "db.internal.local",
      cluster_database_name: "tenant_alpha",
      cluster_port: 0,
      zabbix_host_group_id: "15",
      zabbix_api_url: "https://zabbix.example.com",
      zabbix_api_token: "token",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita contract_end_date nao-ISO", () => {
    const result = createTenantSchema.safeParse({
      name: "Cliente",
      cluster_id: "cluster-01",
      cluster_host: "db.internal.local",
      cluster_database_name: "tenant_alpha",
      zabbix_host_group_id: "15",
      zabbix_api_url: "https://zabbix.example.com",
      zabbix_api_token: "token",
      contract_end_date: "2025-12-31",
    });
    expect(result.success).toBe(false);
  });

  it("aceita cluster_port default 5432", () => {
    const result = createTenantSchema.safeParse({
      name: "Cliente",
      cluster_id: "cluster-01",
      cluster_host: "db.internal.local",
      cluster_database_name: "tenant_alpha",
      zabbix_host_group_id: "15",
      zabbix_api_url: "https://zabbix.example.com",
      zabbix_api_token: "token",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cluster_port).toBe(5432);
    }
  });
});

describe("admin schemas — updateTenantSchema", () => {
  it("valida update parcial (apenas name)", () => {
    const result = updateTenantSchema.safeParse({
      name: "Novo Nome",
    });
    expect(result.success).toBe(true);
  });

  it("valida update de status", () => {
    const result = updateTenantSchema.safeParse({
      status: "suspended",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita status invalido", () => {
    const result = updateTenantSchema.safeParse({
      status: "deleted",
    });
    expect(result.success).toBe(false);
  });

  it("valida update com cnpj null", () => {
    const result = updateTenantSchema.safeParse({
      cnpj: null,
    });
    expect(result.success).toBe(true);
  });

  it("valida update vazio (todos opcionais)", () => {
    const result = updateTenantSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejeita zabbix_api_url invalida no update", () => {
    const result = updateTenantSchema.safeParse({
      zabbix_api_url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });
});
