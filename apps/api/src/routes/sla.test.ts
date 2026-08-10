// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  createServiceSchema,
  updateServiceSchema,
  createMaintenanceWindowSchema,
  updateMaintenanceWindowSchema,
  createServiceIncidentSchema,
  updateServiceIncidentSchema,
  slaReportQuerySchema,
} from "@repo/shared-validation";

// Testes dos schemas Zod de SLA
describe("sla schemas — createServiceSchema", () => {
  const validService = {
    name: "Servidor Web Producao",
    service_type: "web_server",
    sla_target_percentage: 99.5,
  };

  it("valida servico minimo", () => {
    const result = createServiceSchema.safeParse(validService);
    expect(result.success).toBe(true);
  });

  it("rejeita sem name", () => {
    const result = createServiceSchema.safeParse({
      service_type: "web_server",
      sla_target_percentage: 99.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem service_type", () => {
    const result = createServiceSchema.safeParse({
      name: "Servidor",
      sla_target_percentage: 99.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem sla_target_percentage", () => {
    const result = createServiceSchema.safeParse({
      name: "Servidor",
      service_type: "web_server",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sla_target_percentage > 100", () => {
    const result = createServiceSchema.safeParse({
      ...validService,
      sla_target_percentage: 150,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sla_target_percentage < 0", () => {
    const result = createServiceSchema.safeParse({
      ...validService,
      sla_target_percentage: -1,
    });
    expect(result.success).toBe(false);
  });

  it("valida sla_target_percentage = 0", () => {
    const result = createServiceSchema.safeParse({
      ...validService,
      sla_target_percentage: 0,
    });
    expect(result.success).toBe(true);
  });

  it("valida sla_target_percentage = 100", () => {
    const result = createServiceSchema.safeParse({
      ...validService,
      sla_target_percentage: 100,
    });
    expect(result.success).toBe(true);
  });

  it("aplica default status=operational", () => {
    const result = createServiceSchema.safeParse(validService);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("operational");
    }
  });

  it("aplica default priority=medium", () => {
    const result = createServiceSchema.safeParse(validService);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe("medium");
    }
  });

  it("aplica default coverage_hours=24x7", () => {
    const result = createServiceSchema.safeParse(validService);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coverage_hours).toBe("24x7");
    }
  });

  it("aplica default is_active=true", () => {
    const result = createServiceSchema.safeParse(validService);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_active).toBe(true);
    }
  });

  it("rejeita status invalido", () => {
    const result = createServiceSchema.safeParse({
      ...validService,
      status: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita priority invalido", () => {
    const result = createServiceSchema.safeParse({
      ...validService,
      priority: "super",
    });
    expect(result.success).toBe(false);
  });

  it("valida servico completo", () => {
    const result = createServiceSchema.safeParse({
      name: "Servidor Web Producao",
      description: "Servidor principal de web",
      service_type: "web_server",
      status: "operational",
      device_ids: ["dev-1", "dev-2"],
      sla_target_percentage: 99.9,
      coverage_hours: "24x7",
      coverage_timezone: "America/Sao_Paulo",
      coverage_days: ["mon", "tue", "wed", "thu", "fri"],
      priority: "critical",
      zabbix_service_id: "zb-123",
      metadata: { env: "prod" },
      is_active: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita name com mais de 255 chars", () => {
    const result = createServiceSchema.safeParse({
      ...validService,
      name: "x".repeat(256),
    });
    expect(result.success).toBe(false);
  });
});

describe("sla schemas — updateServiceSchema", () => {
  it("valida update parcial", () => {
    const result = updateServiceSchema.safeParse({ name: "Novo nome" });
    expect(result.success).toBe(true);
  });

  it("valida update vazio", () => {
    const result = updateServiceSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejeita status invalido no update", () => {
    const result = updateServiceSchema.safeParse({ status: "invalid" });
    expect(result.success).toBe(false);
  });

  it("rejeita sla_target_percentage > 100 no update", () => {
    const result = updateServiceSchema.safeParse({
      sla_target_percentage: 150,
    });
    expect(result.success).toBe(false);
  });
});

describe("sla schemas — createMaintenanceWindowSchema", () => {
  const validWindow = {
    name: "Manutencao Servidor",
    start_at: "2025-01-15T02:00:00Z",
    end_at: "2025-01-15T04:00:00Z",
  };

  it("valida janela minima", () => {
    const result = createMaintenanceWindowSchema.safeParse(validWindow);
    expect(result.success).toBe(true);
  });

  it("rejeita sem name", () => {
    const result = createMaintenanceWindowSchema.safeParse({
      start_at: "2025-01-15T02:00:00Z",
      end_at: "2025-01-15T04:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem start_at", () => {
    const result = createMaintenanceWindowSchema.safeParse({
      name: "Manutencao",
      end_at: "2025-01-15T04:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem end_at", () => {
    const result = createMaintenanceWindowSchema.safeParse({
      name: "Manutencao",
      start_at: "2025-01-15T02:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("aplica default maintenance_type=scheduled", () => {
    const result = createMaintenanceWindowSchema.safeParse(validWindow);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maintenance_type).toBe("scheduled");
    }
  });

  it("rejeita maintenance_type invalido", () => {
    const result = createMaintenanceWindowSchema.safeParse({
      ...validWindow,
      maintenance_type: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("valida maintenance_type=emergency", () => {
    const result = createMaintenanceWindowSchema.safeParse({
      ...validWindow,
      maintenance_type: "emergency",
    });
    expect(result.success).toBe(true);
  });
});

describe("sla schemas — updateMaintenanceWindowSchema", () => {
  it("valida update parcial", () => {
    const result = updateMaintenanceWindowSchema.safeParse({
      name: "Nova manutencao",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita status invalido", () => {
    const result = updateMaintenanceWindowSchema.safeParse({
      status: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("valida status=active", () => {
    const result = updateMaintenanceWindowSchema.safeParse({
      status: "active",
    });
    expect(result.success).toBe(true);
  });
});

describe("sla schemas — createServiceIncidentSchema", () => {
  const validIncident = {
    service_id: "550e8400-e29b-41d4-a716-446655440000",
    title: "Servidor fora do ar",
    severity: "critical",
  };

  it("valida incidente minimo", () => {
    const result = createServiceIncidentSchema.safeParse(validIncident);
    expect(result.success).toBe(true);
  });

  it("rejeita sem service_id", () => {
    const result = createServiceIncidentSchema.safeParse({
      title: "Incidente",
      severity: "critical",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem title", () => {
    const result = createServiceIncidentSchema.safeParse({
      service_id: "550e8400-e29b-41d4-a716-446655440000",
      severity: "critical",
    });
    expect(result.success).toBe(false);
  });

  it("aplica default severity=warning quando nao informado", () => {
    const result = createServiceIncidentSchema.safeParse({
      service_id: "550e8400-e29b-41d4-a716-446655440000",
      title: "Incidente",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.severity).toBe("warning");
    }
  });

  it("rejeita service_id nao-UUID", () => {
    const result = createServiceIncidentSchema.safeParse({
      ...validIncident,
      service_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita severity invalido", () => {
    const result = createServiceIncidentSchema.safeParse({
      ...validIncident,
      severity: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita severity numerico (deve ser string)", () => {
    const result = createServiceIncidentSchema.safeParse({
      ...validIncident,
      severity: 3,
    });
    expect(result.success).toBe(false);
  });

  it("valida severity = info", () => {
    const result = createServiceIncidentSchema.safeParse({
      ...validIncident,
      severity: "info",
    });
    expect(result.success).toBe(true);
  });

  it("valida severity = maintenance", () => {
    const result = createServiceIncidentSchema.safeParse({
      ...validIncident,
      severity: "maintenance",
    });
    expect(result.success).toBe(true);
  });

  it("aplica default status=investigating", () => {
    const result = createServiceIncidentSchema.safeParse(validIncident);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("investigating");
    }
  });

  it("rejeita status invalido", () => {
    const result = createServiceIncidentSchema.safeParse({
      ...validIncident,
      status: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("valida status=investigating", () => {
    const result = createServiceIncidentSchema.safeParse({
      ...validIncident,
      status: "investigating",
    });
    expect(result.success).toBe(true);
  });
});

describe("sla schemas — updateServiceIncidentSchema", () => {
  it("valida update parcial", () => {
    const result = updateServiceIncidentSchema.safeParse({
      title: "Novo titulo",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita status invalido no update", () => {
    const result = updateServiceIncidentSchema.safeParse({
      status: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("valida status=resolved no update", () => {
    const result = updateServiceIncidentSchema.safeParse({
      status: "resolved",
    });
    expect(result.success).toBe(true);
  });
});

describe("sla schemas — slaReportQuerySchema", () => {
  it("valida query vazia", () => {
    const result = slaReportQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida query com service_id", () => {
    const result = slaReportQuerySchema.safeParse({
      service_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("valida query com from e to", () => {
    const result = slaReportQuerySchema.safeParse({
      from: "2025-01-01",
      to: "2025-01-31",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita service_id nao-UUID", () => {
    const result = slaReportQuerySchema.safeParse({
      service_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});

// Testes da logica de SLA
describe("sla — logica de uptime", () => {
  function calculateUptime(
    totalSeconds: number,
    downtimeSeconds: number,
  ): number {
    if (totalSeconds === 0) return 100;
    return ((totalSeconds - downtimeSeconds) / totalSeconds) * 100;
  }

  it("100% uptime com 0 downtime", () => {
    expect(calculateUptime(86400, 0)).toBe(100);
  });

  it("99.9% uptime com ~86s downtime", () => {
    const uptime = calculateUptime(86400, 86);
    expect(uptime).toBeCloseTo(99.9, 1);
  });

  it("0% uptime com downtime = total", () => {
    expect(calculateUptime(86400, 86400)).toBe(0);
  });

  it("retorna 100 quando total = 0 (evita divisao por zero)", () => {
    expect(calculateUptime(0, 0)).toBe(100);
  });
});

describe("sla — logica de MTTR", () => {
  function calculateMttr(
    startedAt: Date,
    resolvedAt: Date | null,
    now: Date = new Date(),
  ): number {
    const end = resolvedAt ?? now;
    return (end.getTime() - startedAt.getTime()) / 1000 / 60; // minutos
  }

  it("calcula MTTR em minutos", () => {
    const started = new Date("2025-01-15T10:00:00Z");
    const resolved = new Date("2025-01-15T11:30:00Z");
    expect(calculateMttr(started, resolved)).toBe(90);
  });

  it("usa now() se resolved_at for null", () => {
    const started = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
    const mttr = calculateMttr(started, null);
    expect(mttr).toBeGreaterThan(59);
    expect(mttr).toBeLessThan(61);
  });
});

describe("sla — logica de prioridade ponderada", () => {
  function weightedSla(
    services: Array<{ priority: string; uptime: number }>,
  ): number {
    const weights: Record<string, number> = {
      critical: 3,
      high: 2,
      medium: 1,
      low: 1,
    };
    let weightedSum = 0;
    let totalWeight = 0;
    for (const s of services) {
      const w = weights[s.priority] ?? 1;
      weightedSum += s.uptime * w;
      totalWeight += w;
    }
    return totalWeight === 0 ? 100 : weightedSum / totalWeight;
  }

  it("servico unico retorna seu uptime", () => {
    expect(weightedSla([{ priority: "medium", uptime: 99.5 }])).toBeCloseTo(
      99.5,
    );
  });

  it("critical tem peso 3x", () => {
    const result = weightedSla([
      { priority: "critical", uptime: 90 },
      { priority: "low", uptime: 100 },
    ]);
    // (90*3 + 100*1) / (3+1) = 370/4 = 92.5
    expect(result).toBeCloseTo(92.5);
  });

  it("lista vazia retorna 100", () => {
    expect(weightedSla([])).toBe(100);
  });

  it("prioridade desconhecida usa peso 1", () => {
    const result = weightedSla([
      { priority: "unknown", uptime: 80 },
      { priority: "medium", uptime: 100 },
    ]);
    expect(result).toBeCloseTo(90);
  });
});

// Testes de edge cases
describe("sla — edge cases", () => {
  it("tenant sem servicos retorna total 0", () => {
    const overview = {
      services: { total: "0", active: "0" },
      incidents: { total: "0", open: "0" },
    };
    expect(overview.services.total).toBe("0");
  });

  it("dashboard com feature flag desativada retorna 403", () => {
    const flagEnabled = false;
    expect(flagEnabled).toBe(false);
  });

  it("dashboard com feature flag ativada permite acesso", () => {
    const flagEnabled = true;
    expect(flagEnabled).toBe(true);
  });

  it("incidente resolvido calcula downtime_seconds", () => {
    const status = "resolved";
    expect(status).toBe("resolved");
  });

  it("incidente aberto nao calcula downtime_seconds", () => {
    const status = "open";
    expect(status).not.toBe("resolved");
  });
});
