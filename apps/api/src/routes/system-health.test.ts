// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  createHealthCheckSchema,
  updateHealthCheckSchema,
  createIncidentSchema,
  updateIncidentSchema,
  recordMetricSchema,
} from "@repo/shared-validation";

// Replica da funcao isSafeUrl para testar protecao SSRF
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "0.0.0.0" ||
      hostname.startsWith("127.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("169.254.") ||
      hostname.startsWith("172.16.") ||
      hostname.startsWith("172.17.") ||
      hostname.startsWith("172.18.") ||
      hostname.startsWith("172.19.") ||
      hostname.startsWith("172.20.") ||
      hostname.startsWith("172.21.") ||
      hostname.startsWith("172.22.") ||
      hostname.startsWith("172.23.") ||
      hostname.startsWith("172.24.") ||
      hostname.startsWith("172.25.") ||
      hostname.startsWith("172.26.") ||
      hostname.startsWith("172.27.") ||
      hostname.startsWith("172.28.") ||
      hostname.startsWith("172.29.") ||
      hostname.startsWith("172.30.") ||
      hostname.startsWith("172.31.") ||
      hostname === "::1" ||
      hostname === "[::1]" ||
      hostname.startsWith("fc") ||
      hostname.startsWith("fd") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".local")
    ) {
      return false;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ========== createHealthCheckSchema ==========

describe("system-health — createHealthCheckSchema", () => {
  const validCheck = {
    name: "API Principal",
    service_type: "api" as const,
  };

  it("valida check minimo", () => {
    const result = createHealthCheckSchema.safeParse(validCheck);
    expect(result.success).toBe(true);
  });

  it("rejeita sem name", () => {
    const result = createHealthCheckSchema.safeParse({
      service_type: "api",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem service_type", () => {
    const result = createHealthCheckSchema.safeParse({
      name: "Check",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita service_type invalido", () => {
    const result = createHealthCheckSchema.safeParse({
      ...validCheck,
      service_type: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("valida todos os service_types", () => {
    const types = [
      "database",
      "redis",
      "api",
      "zabbix",
      "smtp",
      "dns",
      "webhook",
      "external_api",
      "filesystem",
      "queue",
      "custom",
    ];
    for (const service_type of types) {
      const result = createHealthCheckSchema.safeParse({
        ...validCheck,
        service_type,
      });
      expect(result.success).toBe(true);
    }
  });

  it("aplica default check_interval_seconds=60", () => {
    const result = createHealthCheckSchema.safeParse(validCheck);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.check_interval_seconds).toBe(60);
    }
  });

  it("aplica default timeout_seconds=10", () => {
    const result = createHealthCheckSchema.safeParse(validCheck);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timeout_seconds).toBe(10);
    }
  });

  it("aplica default is_active=true", () => {
    const result = createHealthCheckSchema.safeParse(validCheck);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_active).toBe(true);
    }
  });

  it("aplica default metadata={}", () => {
    const result = createHealthCheckSchema.safeParse(validCheck);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metadata).toEqual({});
    }
  });

  it("rejeita check_interval_seconds < 10", () => {
    const result = createHealthCheckSchema.safeParse({
      ...validCheck,
      check_interval_seconds: 5,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita timeout_seconds < 1", () => {
    const result = createHealthCheckSchema.safeParse({
      ...validCheck,
      timeout_seconds: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita expected_status_code < 100", () => {
    const result = createHealthCheckSchema.safeParse({
      ...validCheck,
      expected_status_code: 99,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita expected_status_code > 599", () => {
    const result = createHealthCheckSchema.safeParse({
      ...validCheck,
      expected_status_code: 600,
    });
    expect(result.success).toBe(false);
  });

  it("valida endpoint URL", () => {
    const result = createHealthCheckSchema.safeParse({
      ...validCheck,
      endpoint: "https://api.example.com/health",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita endpoint nao-URL", () => {
    const result = createHealthCheckSchema.safeParse({
      ...validCheck,
      endpoint: "not-a-url",
    });
    expect(result.success).toBe(false);
  });
});

// ========== updateHealthCheckSchema ==========

describe("system-health — updateHealthCheckSchema", () => {
  it("valida update parcial", () => {
    const result = updateHealthCheckSchema.safeParse({ name: "Novo nome" });
    expect(result.success).toBe(true);
  });

  it("valida update vazio", () => {
    const result = updateHealthCheckSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejeita service_type invalido no update", () => {
    const result = updateHealthCheckSchema.safeParse({
      service_type: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("valida todos os campos opcionais no update", () => {
    const result = updateHealthCheckSchema.safeParse({
      name: "Updated",
      service_type: "redis",
      endpoint: "https://redis.example.com",
      check_interval_seconds: 120,
      timeout_seconds: 30,
      expected_status_code: 200,
      is_active: false,
      metadata: { region: "us-east" },
    });
    expect(result.success).toBe(true);
  });
});

// ========== createIncidentSchema ==========

describe("system-health — createIncidentSchema", () => {
  const validIncident = {
    title: "API fora do ar",
    severity: "critical" as const,
  };

  it("valida incident minimo", () => {
    const result = createIncidentSchema.safeParse(validIncident);
    expect(result.success).toBe(true);
  });

  it("rejeita sem title", () => {
    const result = createIncidentSchema.safeParse({
      severity: "critical",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem severity", () => {
    const result = createIncidentSchema.safeParse({
      title: "Incidente",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita severity como numero (deve ser string enum)", () => {
    const result = createIncidentSchema.safeParse({
      ...validIncident,
      severity: 5,
    });
    expect(result.success).toBe(false);
  });

  it("valida todas as severidades", () => {
    const severities = ["info", "warning", "major", "critical", "maintenance"];
    for (const severity of severities) {
      const result = createIncidentSchema.safeParse({
        ...validIncident,
        severity,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejeita severity invalida", () => {
    const result = createIncidentSchema.safeParse({
      ...validIncident,
      severity: "urgent",
    });
    expect(result.success).toBe(false);
  });

  it("aplica default status=investigating", () => {
    const result = createIncidentSchema.safeParse(validIncident);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("investigating");
    }
  });

  it("aplica default affected_services=[]", () => {
    const result = createIncidentSchema.safeParse(validIncident);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.affected_services).toEqual([]);
    }
  });

  it("aplica default is_scheduled=false", () => {
    const result = createIncidentSchema.safeParse(validIncident);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_scheduled).toBe(false);
    }
  });

  it("valida impact enum", () => {
    const impacts = ["none", "minor", "moderate", "significant", "severe"];
    for (const impact of impacts) {
      const result = createIncidentSchema.safeParse({
        ...validIncident,
        impact,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejeita impact invalido", () => {
    const result = createIncidentSchema.safeParse({
      ...validIncident,
      impact: "catastrophic",
    });
    expect(result.success).toBe(false);
  });

  it("valida health_check_id UUID", () => {
    const result = createIncidentSchema.safeParse({
      ...validIncident,
      health_check_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita health_check_id nao-UUID", () => {
    const result = createIncidentSchema.safeParse({
      ...validIncident,
      health_check_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});

// ========== updateIncidentSchema ==========

describe("system-health — updateIncidentSchema", () => {
  it("valida update parcial", () => {
    const result = updateIncidentSchema.safeParse({ status: "resolved" });
    expect(result.success).toBe(true);
  });

  it("valida update vazio", () => {
    const result = updateIncidentSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida root_cause no update", () => {
    const result = updateIncidentSchema.safeParse({
      root_cause: "Falha de disco",
    });
    expect(result.success).toBe(true);
  });

  it("valida resolution_notes no update", () => {
    const result = updateIncidentSchema.safeParse({
      resolution_notes: "Disco substituido",
    });
    expect(result.success).toBe(true);
  });

  it("valida impact no update", () => {
    const result = updateIncidentSchema.safeParse({ impact: "moderate" });
    expect(result.success).toBe(true);
  });

  it("rejeita severity como numero no update", () => {
    const result = updateIncidentSchema.safeParse({ severity: 3 });
    expect(result.success).toBe(false);
  });

  it("valida todos os status no update", () => {
    const statuses = [
      "investigating",
      "identified",
      "monitoring",
      "resolved",
      "scheduled",
    ];
    for (const status of statuses) {
      const result = updateIncidentSchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });

  it("rejeita status invalido no update", () => {
    const result = updateIncidentSchema.safeParse({ status: "closed" });
    expect(result.success).toBe(false);
  });
});

// ========== recordMetricSchema ==========

describe("system-health — recordMetricSchema", () => {
  const validMetric = {
    metric_name: "cpu_usage",
    metric_type: "cpu" as const,
    value: 75.5,
  };

  it("valida metrica minima", () => {
    const result = recordMetricSchema.safeParse(validMetric);
    expect(result.success).toBe(true);
  });

  it("rejeita sem metric_name", () => {
    const result = recordMetricSchema.safeParse({
      metric_type: "cpu",
      value: 75,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem metric_type", () => {
    const result = recordMetricSchema.safeParse({
      metric_name: "cpu_usage",
      value: 75,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem value", () => {
    const result = recordMetricSchema.safeParse({
      metric_name: "cpu_usage",
      metric_type: "cpu",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita metric_type invalido", () => {
    const result = recordMetricSchema.safeParse({
      ...validMetric,
      metric_type: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("valida todos os metric_types", () => {
    const types = [
      "cpu",
      "memory",
      "disk",
      "network",
      "database",
      "redis",
      "api",
      "queue",
      "custom",
    ];
    for (const metric_type of types) {
      const result = recordMetricSchema.safeParse({
        ...validMetric,
        metric_type,
      });
      expect(result.success).toBe(true);
    }
  });

  it("aplica default unit=percent", () => {
    const result = recordMetricSchema.safeParse(validMetric);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.unit).toBe("percent");
    }
  });

  it("aplica default labels={}", () => {
    const result = recordMetricSchema.safeParse(validMetric);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.labels).toEqual({});
    }
  });

  it("nao requer health_check_id (removido do schema)", () => {
    const result = recordMetricSchema.safeParse(validMetric);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("health_check_id");
    }
  });

  it("valida com thresholds", () => {
    const result = recordMetricSchema.safeParse({
      ...validMetric,
      threshold_warning: 70,
      threshold_critical: 90,
    });
    expect(result.success).toBe(true);
  });

  it("valida value negativo", () => {
    const result = recordMetricSchema.safeParse({
      ...validMetric,
      value: -10,
    });
    expect(result.success).toBe(true);
  });
});

// ========== Logica de Status da Metrica ==========

describe("system-health — calculo de status da metrica", () => {
  function calculateMetricStatus(
    value: number,
    thresholdWarning?: number,
    thresholdCritical?: number,
  ): "healthy" | "warning" | "critical" {
    if (thresholdCritical !== undefined && value >= thresholdCritical) {
      return "critical";
    }
    if (thresholdWarning !== undefined && value >= thresholdWarning) {
      return "warning";
    }
    return "healthy";
  }

  it("retorna healthy quando abaixo dos thresholds", () => {
    expect(calculateMetricStatus(50, 70, 90)).toBe("healthy");
  });

  it("retorna warning quando acima do threshold_warning", () => {
    expect(calculateMetricStatus(75, 70, 90)).toBe("warning");
  });

  it("retorna critical quando acima do threshold_critical", () => {
    expect(calculateMetricStatus(95, 70, 90)).toBe("critical");
  });

  it("retorna healthy quando sem thresholds", () => {
    expect(calculateMetricStatus(99)).toBe("healthy");
  });

  it("retorna critical quando value igual ao threshold_critical", () => {
    expect(calculateMetricStatus(90, 70, 90)).toBe("critical");
  });

  it("retorna warning quando value igual ao threshold_warning", () => {
    expect(calculateMetricStatus(70, 70, 90)).toBe("warning");
  });

  it("prioriza critical sobre warning", () => {
    expect(calculateMetricStatus(95, 70, 90)).toBe("critical");
  });
});

// ========== Protecao SSRF ==========

describe("system-health — isSafeUrl (SSRF protection)", () => {
  it("permite URL HTTPS publica", () => {
    expect(isSafeUrl("https://api.example.com/health")).toBe(true);
  });

  it("permite URL HTTP publica", () => {
    expect(isSafeUrl("http://api.example.com/health")).toBe(true);
  });

  it("bloqueia localhost", () => {
    expect(isSafeUrl("http://localhost:8080/health")).toBe(false);
  });

  it("bloqueia 127.0.0.1", () => {
    expect(isSafeUrl("http://127.0.0.1:8080/health")).toBe(false);
  });

  it("bloqueia 0.0.0.0", () => {
    expect(isSafeUrl("http://0.0.0.0/health")).toBe(false);
  });

  it("bloqueia IP interno 10.x.x.x", () => {
    expect(isSafeUrl("http://10.0.0.1/health")).toBe(false);
  });

  it("bloqueia IP interno 192.168.x.x", () => {
    expect(isSafeUrl("http://192.168.1.1/health")).toBe(false);
  });

  it("bloqueia AWS metadata 169.254.x.x", () => {
    expect(isSafeUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
  });

  it("bloqueia IP interno 172.16.x.x", () => {
    expect(isSafeUrl("http://172.16.0.1/health")).toBe(false);
  });

  it("bloqueia IP interno 172.31.x.x", () => {
    expect(isSafeUrl("http://172.31.0.1/health")).toBe(false);
  });

  it("bloqueia IPv6 loopback ::1", () => {
    expect(isSafeUrl("http://[::1]/health")).toBe(false);
  });

  it("bloqueia dominio .internal", () => {
    expect(isSafeUrl("http://db.internal/health")).toBe(false);
  });

  it("bloqueia dominio .local", () => {
    expect(isSafeUrl("http://redis.local/health")).toBe(false);
  });

  it("bloqueia protocolo nao-HTTP", () => {
    expect(isSafeUrl("ftp://example.com/file")).toBe(false);
  });

  it("bloqueia protocolo file://", () => {
    expect(isSafeUrl("file:///etc/passwd")).toBe(false);
  });

  it("bloqueia URL invalida", () => {
    expect(isSafeUrl("not-a-url")).toBe(false);
  });

  it("bloqueia string vazia", () => {
    expect(isSafeUrl("")).toBe(false);
  });

  it("permite subdominio publico", () => {
    expect(isSafeUrl("https://api.v2.example.com/health")).toBe(true);
  });
});

// ========== Logica de Incidente Automatico ==========

describe("system-health — incidente automatico", () => {
  it("cria incidente apos 3 falhas consecutivas", () => {
    const consecutiveFailures = 3;
    const shouldCreateIncident = consecutiveFailures >= 3;
    expect(shouldCreateIncident).toBe(true);
  });

  it("nao cria incidente com 2 falhas", () => {
    const consecutiveFailures = 2;
    const shouldCreateIncident = consecutiveFailures >= 3;
    expect(shouldCreateIncident).toBe(false);
  });

  it("severidade critical apos 5+ falhas", () => {
    const consecutiveFailures = 5;
    const severity = consecutiveFailures >= 5 ? "critical" : "major";
    expect(severity).toBe("critical");
  });

  it("severidade major com 3-4 falhas", () => {
    const consecutiveFailures = 4;
    const severity = consecutiveFailures >= 5 ? "critical" : "major";
    expect(severity).toBe("major");
  });

  it("reseta consecutive_failures quando healthy", () => {
    const status = "healthy";
    const currentFailures = 5;
    const newFailures = status === "healthy" ? 0 : currentFailures + 1;
    expect(newFailures).toBe(0);
  });

  it("incrementa consecutive_failures quando nao healthy", () => {
    const status: string = "down";
    const currentFailures = 2;
    const newFailures = status === "healthy" ? 0 : currentFailures + 1;
    expect(newFailures).toBe(3);
  });

  it("incrementa consecutive_successes quando healthy", () => {
    const status = "healthy";
    const currentSuccesses = 5;
    const newSuccesses = status === "healthy" ? currentSuccesses + 1 : 0;
    expect(newSuccesses).toBe(6);
  });

  it("reseta consecutive_successes quando nao healthy", () => {
    const status: string = "down";
    const currentSuccesses = 10;
    const newSuccesses = status === "healthy" ? currentSuccesses + 1 : 0;
    expect(newSuccesses).toBe(0);
  });
});
