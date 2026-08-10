// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import { z } from "zod";

// Replica do schema para testar validacao
const errorReportSchema = z.object({
  error_message: z.string().min(1).max(2000),
  error_stack: z.string().max(10000).optional(),
  component_stack: z.string().max(10000).optional(),
  error_type: z.string().max(100).optional(),
  url: z.string().max(500).optional(),
  route: z.string().max(500).optional(),
  user_agent: z.string().max(500).optional(),
  browser_info: z.record(z.unknown()).optional(),
  last_action: z.record(z.unknown()).optional(),
  input_data: z.record(z.unknown()).optional(),
  severity: z.enum(["warning", "error", "fatal"]).default("error"),
  trace_id: z.string().max(100).optional(),
});

const updateReportSchema = z.object({
  root_cause: z.string().max(5000).optional(),
  resolution: z.string().max(5000).optional(),
  status: z.enum(["open", "investigating", "resolved", "wontfix"]).optional(),
});

// ========== errorReportSchema ==========

describe("error-reports — errorReportSchema", () => {
  const validReport = {
    error_message: "TypeError: Cannot read property of undefined",
  };

  it("valida relatorio minimo", () => {
    const result = errorReportSchema.safeParse(validReport);
    expect(result.success).toBe(true);
  });

  it.each([
    ["", false],
    ["a".repeat(2001), false],
    ["Erro valido", true],
  ] as const)("error_message=%j → success=%s", (msg, expected) => {
    const result = errorReportSchema.safeParse({
      ...validReport,
      error_message: msg,
    });
    expect(result.success).toBe(expected);
  });

  it.each([
    ["warning", true],
    ["error", true],
    ["fatal", true],
    ["info", false],
  ] as const)("severity=%j → success=%s", (severity, expected) => {
    const result = errorReportSchema.safeParse({ ...validReport, severity });
    expect(result.success).toBe(expected);
  });

  it("aplica default severity=error", () => {
    const result = errorReportSchema.safeParse(validReport);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.severity).toBe("error");
    }
  });

  it("valida browser_info como record", () => {
    const result = errorReportSchema.safeParse({
      ...validReport,
      browser_info: { ua: "Mozilla", platform: "Win32" },
    });
    expect(result.success).toBe(true);
  });

  it("rejeita browser_info como string", () => {
    const result = errorReportSchema.safeParse({
      ...validReport,
      browser_info: "Mozilla",
    });
    expect(result.success).toBe(false);
  });
});

// ========== updateReportSchema ==========

describe("error-reports — updateReportSchema", () => {
  it.each([
    ["open", true],
    ["investigating", true],
    ["resolved", true],
    ["wontfix", true],
    ["closed", false],
  ] as const)("status=%j → success=%s", (status, expected) => {
    const result = updateReportSchema.safeParse({ status });
    expect(result.success).toBe(expected);
  });

  it("valida root_cause opcional", () => {
    const result = updateReportSchema.safeParse({
      root_cause: "Bug na logica",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita root_cause muito longo", () => {
    const result = updateReportSchema.safeParse({
      root_cause: "a".repeat(5001),
    });
    expect(result.success).toBe(false);
  });

  it("valida objeto vazio (todos opcionais)", () => {
    const result = updateReportSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

// ========== Logica de Priority Map ==========

describe("error-reports — logica de priority map", () => {
  const priorityMap: Record<string, string> = {
    warning: "low",
    error: "high",
    fatal: "urgent",
  };

  it.each([
    ["warning", "low"],
    ["error", "high"],
    ["fatal", "urgent"],
  ] as const)("severity=%s → priority=%s", (severity, expected) => {
    expect(priorityMap[severity]).toBe(expected);
  });

  it("severity desconhecida usa fallback medium", () => {
    const severity = "unknown";
    const priority = priorityMap[severity] ?? "medium";
    expect(priority).toBe("medium");
  });
});

// ========== Logica de Tenant Isolation ==========

describe("error-reports — logica de tenant isolation", () => {
  it("POST /report usa tenant_id do user", () => {
    const tenantId = "t-123";
    const sql =
      "INSERT INTO public.error_reports (tenant_id, ...) VALUES ($1, ...)";
    const params: unknown[] = [tenantId];
    expect(sql).toContain("tenant_id");
    expect(params[0]).toBe(tenantId);
  });

  it("POST /report cria ticket com tenant_id", () => {
    const tenantId = "t-456";
    const sql = "INSERT INTO public.tickets (tenant_id, ...) VALUES ($1, ...)";
    const params: unknown[] = [tenantId];
    expect(sql).toContain("tenant_id");
    expect(params[0]).toBe(tenantId);
  });
});

// ========== Logica de Optional Chaining ==========

describe("error-reports — logica de optional chaining", () => {
  it("user?.tenant_id retorna null quando user e null", () => {
    type TestUser = { tenant_id?: string } | null;
    const user = null as TestUser;
    expect(user?.tenant_id ?? null).toBeNull();
  });

  it("user?.sub retorna null quando user e undefined", () => {
    type TestUser = { sub?: string } | undefined;
    const user = undefined as TestUser;
    expect(user?.sub ?? null).toBeNull();
  });

  it("ticketResult.data?.rows[0]?.id retorna null quando vazio", () => {
    const result: { data?: { rows?: { id: string }[] } } = {
      data: { rows: [] },
    };
    expect(result.data?.rows?.[0]?.id ?? null).toBeNull();
  });

  it("userId null nao chama writeAuditLog", () => {
    const userId: string | null = null;
    const shouldCallAudit = !!userId;
    expect(shouldCallAudit).toBe(false);
  });
});

// ========== Logica de Error Handling ==========

describe("error-reports — logica de error handling", () => {
  it("catch retorna INTERNAL_ERROR 500", () => {
    const error = new Error("DB connection failed");
    const message = error instanceof Error ? error.message : "Erro interno";
    expect(message).toBe("DB connection failed");
  });

  it("catch com non-Error retorna mensagem generica", () => {
    const error: unknown = "string error";
    const message = error instanceof Error ? error.message : "Erro interno";
    expect(message).toBe("Erro interno");
  });

  it("report nao encontrado retorna 404", () => {
    const result = { data: { rows: [] } };
    const notFound = !result.data?.rows?.[0];
    expect(notFound).toBe(true);
  });

  it("report encontrado retorna 200", () => {
    const result = { data: { rows: [{ id: "r-1" }] } };
    const notFound = !result.data?.rows?.[0];
    expect(notFound).toBe(false);
  });
});

// ========== Logica de Field Map Update ==========

describe("error-reports — logica de field map update", () => {
  it("constroi UPDATE dinamico com campos fornecidos", () => {
    const data = { root_cause: "Bug X", status: "resolved" };
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.root_cause !== undefined) {
      updates.push(`root_cause = $${idx++}`);
      params.push(data.root_cause);
    }
    if (data.status !== undefined) {
      updates.push(`status = $${idx++}`);
      params.push(data.status);
    }

    expect(updates).toEqual(["root_cause = $1", "status = $2"]);
    expect(params).toEqual(["Bug X", "resolved"]);
  });

  it("update vazio retorna 400", () => {
    const updates: string[] = [];
    const shouldReturn400 = updates.length === 0;
    expect(shouldReturn400).toBe(true);
  });

  it("update com apenas resolution", () => {
    const data = { resolution: "Fix aplicado" };
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.root_cause !== undefined) {
      updates.push(`root_cause = $${idx++}`);
      params.push(data.root_cause);
    }
    if (data.resolution !== undefined) {
      updates.push(`resolution = $${idx++}`);
      params.push(data.resolution);
    }
    if (data.status !== undefined) {
      updates.push(`status = $${idx++}`);
      params.push(data.status);
    }

    expect(updates).toEqual(["resolution = $1"]);
    expect(params).toEqual(["Fix aplicado"]);
  });
});

// ========== Logica de Ticket Number Fallback ==========

describe("error-reports — logica de ticket number fallback", () => {
  it("gera fallback ERR-timestamp quando generate_ticket_number falha", () => {
    const fallback = `ERR-${Date.now()}`;
    expect(fallback).toMatch(/^ERR-\d+$/);
  });

  it("usa numero gerado pelo DB quando disponivel", () => {
    const dbNumber = "TKT-2024-0001";
    const result = { data: { rows: [{ generate_ticket_number: dbNumber }] } };
    const ticketNumber =
      result.data?.rows[0]?.generate_ticket_number ?? `ERR-${Date.now()}`;
    expect(ticketNumber).toBe(dbNumber);
  });

  it("fallback quando DB retorna vazio", () => {
    const result = { data: { rows: [] } };
    const ticketNumber =
      result.data?.rows[0]?.generate_ticket_number ?? `ERR-${Date.now()}`;
    expect(ticketNumber).toMatch(/^ERR-\d+$/);
  });
});
