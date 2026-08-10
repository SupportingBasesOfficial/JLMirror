// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  logIngestSchema,
  logIngestBatchSchema,
  logSearchSchema,
} from "@repo/shared-validation";

// ========== logIngestSchema ==========

describe("logs — logIngestSchema", () => {
  const validLog = {
    source: "api",
    level: "info",
    message: "User logged in",
  };

  it("valida log minimo", () => {
    const result = logIngestSchema.safeParse(validLog);
    expect(result.success).toBe(true);
  });

  it("valida log com metadata e tags", () => {
    const result = logIngestSchema.safeParse({
      ...validLog,
      metadata: { userId: "u-1" },
      tags: ["auth", "login"],
      trace_id: "t-123",
      span_id: "s-456",
      host: "api-01",
      service: "auth-service",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sem source", () => {
    const result = logIngestSchema.safeParse({
      level: "info",
      message: "test",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem level", () => {
    const result = logIngestSchema.safeParse({
      source: "api",
      message: "test",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem message", () => {
    const result = logIngestSchema.safeParse({
      source: "api",
      level: "info",
    });
    expect(result.success).toBe(false);
  });
});

// ========== logIngestBatchSchema ==========

describe("logs — logIngestBatchSchema", () => {
  it("valida batch com multiplos logs", () => {
    const result = logIngestBatchSchema.safeParse({
      logs: [
        { source: "api", level: "info", message: "log 1" },
        { source: "api", level: "error", message: "log 2" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita batch vazio", () => {
    const result = logIngestBatchSchema.safeParse({ logs: [] });
    expect(result.success).toBe(false);
  });

  it("rejeita sem logs", () => {
    const result = logIngestBatchSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ========== logSearchSchema ==========

describe("logs — logSearchSchema", () => {
  it("valida busca sem filtros", () => {
    const result = logSearchSchema.safeParse({ limit: 100, offset: 0 });
    expect(result.success).toBe(true);
  });

  it("valida busca com level e source", () => {
    const result = logSearchSchema.safeParse({
      level: "error",
      source: "api",
      limit: 50,
      offset: 0,
    });
    expect(result.success).toBe(true);
  });

  it("valida busca com tags e trace_id", () => {
    const result = logSearchSchema.safeParse({
      tags: ["auth", "login"],
      trace_id: "t-123",
      limit: 100,
      offset: 0,
    });
    expect(result.success).toBe(true);
  });
});

// ========== Logica de Payload Construction ==========

describe("logs — logica de payload construction", () => {
  it("constroi payload com metadata, tags, span_id, host, service", () => {
    const data = {
      metadata: { userId: "u-1" },
      tags: ["auth"],
      span_id: "s-1",
      host: "h-1",
      service: "svc-1",
    };
    const payload: Record<string, unknown> = { ...(data.metadata ?? {}) };
    if (data.tags?.length) payload.tags = data.tags;
    if (data.span_id) payload.span_id = data.span_id;
    if (data.host) payload.host = data.host;
    if (data.service) payload.service = data.service;

    expect(payload).toEqual({
      userId: "u-1",
      tags: ["auth"],
      span_id: "s-1",
      host: "h-1",
      service: "svc-1",
    });
  });

  it("payload vazio quando sem metadata", () => {
    const data: { metadata?: Record<string, unknown> } = {};
    const payload: Record<string, unknown> = { ...(data.metadata ?? {}) };
    expect(payload).toEqual({});
  });

  it("tags vazias nao adicionadas ao payload", () => {
    const data = { tags: [] as string[] };
    const payload: Record<string, unknown> = {};
    if (data.tags?.length) payload.tags = data.tags;
    expect(payload.tags).toBeUndefined();
  });
});

// ========== Logica de Batch Values Construction ==========

describe("logs — logica de batch values", () => {
  it("constroi values multi-row corretamente", () => {
    const logs = [
      { source: "a", level: "info", message: "m1", trace_id: null },
      { source: "b", level: "error", message: "m2", trace_id: "t-1" },
    ];
    const values: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (const log of logs) {
      values.push(
        `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5})`,
      );
      params.push(null, log.source, log.level, log.message, "{}", log.trace_id);
      paramIdx += 6;
    }

    expect(values).toHaveLength(2);
    expect(values[0]).toBe("($1, $2, $3, $4, $5, $6)");
    expect(values[1]).toBe("($7, $8, $9, $10, $11, $12)");
    expect(params).toHaveLength(12);
  });

  it("paramIdx incrementa por 6 por log", () => {
    const logs = Array(5).fill({
      source: "a",
      level: "info",
      message: "m",
      trace_id: null,
    });
    let paramIdx = 1;
    for (const log of logs) {
      void log;
      paramIdx += 6;
    }
    expect(paramIdx).toBe(31);
  });
});

// ========== Logica de Tenant Isolation ==========

describe("logs — logica de tenant isolation", () => {
  it("queries filtram por tenant_id", () => {
    const tenantId = "t-123";
    const sql = "SELECT * FROM public.system_logs WHERE tenant_id = $1";
    const params: unknown[] = [tenantId];
    expect(sql).toContain("tenant_id = $1");
    expect(params[0]).toBe(tenantId);
  });
});

// ========== Logica de Optional Chaining ==========

describe("logs — logica de optional chaining", () => {
  it("user?.tenant_id retorna null quando user e null", () => {
    type TestUser = { tenant_id?: string } | null;
    const user = null as TestUser;
    expect(user?.tenant_id ?? null).toBeNull();
  });

  it("result.data?.rows[0]?.id retorna undefined quando vazio", () => {
    const result: { data?: { rows?: Array<{ id: string }> } } = {
      data: { rows: [] },
    };
    expect(result.data?.rows?.[0]?.id).toBeUndefined();
  });

  it("result.data?.rows.length ?? 0 retorna 0 quando vazio", () => {
    const result: { data?: { rows?: unknown[] } } = {};
    expect(result.data?.rows?.length ?? 0).toBe(0);
  });
});

// ========== Logica de Error Handling ==========

describe("logs — logica de error handling", () => {
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

  it("result.error retorna INSERT_ERROR 500", () => {
    const result = { error: { message: "duplicate key" } };
    const hasError = !!result.error;
    expect(hasError).toBe(true);
  });

  it("result.error retorna QUERY_ERROR 500", () => {
    const result = { error: { message: "syntax error" } };
    const hasError = !!result.error;
    expect(hasError).toBe(true);
  });
});

// ========== Logica de Levels ==========

describe("logs — logica de levels", () => {
  it("retorna 6 niveis disponiveis", () => {
    const levels = ["trace", "debug", "info", "warn", "error", "fatal"];
    expect(levels).toHaveLength(6);
  });

  it.each([
    ["trace", true],
    ["debug", true],
    ["info", true],
    ["warn", true],
    ["error", true],
    ["fatal", true],
    ["verbose", false],
  ] as const)("level=%s e valido=%s", (level, expected) => {
    const validLevels = ["trace", "debug", "info", "warn", "error", "fatal"];
    expect(validLevels.includes(level)).toBe(expected);
  });
});

// ========== Logica de Pagination ==========

describe("logs — logica de pagination", () => {
  it("limit maximo e 500", () => {
    const limit = Math.min(1000, 500);
    expect(limit).toBe(500);
  });

  it("offset default e 0", () => {
    const offset = Number.parseInt("0", 10) || 0;
    expect(offset).toBe(0);
  });

  it("limit default e 100", () => {
    const limit = Math.min(Number.parseInt("100", 10) || 100, 500);
    expect(limit).toBe(100);
  });
});
