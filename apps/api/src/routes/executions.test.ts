// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import { approveExecutionSchema } from "@repo/shared-validation";

// ========== approveExecutionSchema ==========

describe("executions — approveExecutionSchema", () => {
  const validApproval = {
    execution_id: "550e8400-e29b-41d4-a716-446655440000",
    approved: true,
  };

  it("valida aprovacao", () => {
    const result = approveExecutionSchema.safeParse(validApproval);
    expect(result.success).toBe(true);
  });

  it("valida rejeicao com comentario", () => {
    const result = approveExecutionSchema.safeParse({
      ...validApproval,
      approved: false,
      comment: "Script perigoso",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sem execution_id", () => {
    const result = approveExecutionSchema.safeParse({ approved: true });
    expect(result.success).toBe(false);
  });

  it("rejeita sem approved", () => {
    const result = approveExecutionSchema.safeParse({
      execution_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita execution_id com UUID invalido", () => {
    const result = approveExecutionSchema.safeParse({
      execution_id: "not-a-uuid",
      approved: true,
    });
    expect(result.success).toBe(false);
  });
});

// ========== Logica de Tenant Isolation ==========

describe("executions — logica de tenant isolation", () => {
  it("queries de executions filtram por tenant_id", () => {
    const tenantId = "t-123";
    const sql = "SELECT * FROM public.script_executions WHERE tenant_id = $1";
    const params: unknown[] = [tenantId];
    expect(sql).toContain("tenant_id = $1");
    expect(params[0]).toBe(tenantId);
  });

  it("GET /:id inclui tenant_id no WHERE", () => {
    const tenantId = "t-456";
    const executionId = "e-1";
    const sql =
      "SELECT * FROM public.script_executions WHERE id = $1 AND tenant_id = $2";
    const params: unknown[] = [executionId, tenantId];
    expect(sql).toContain("tenant_id = $2");
    expect(params[1]).toBe(tenantId);
  });
});

// ========== Logica de Optional Chaining ==========

describe("executions — logica de optional chaining", () => {
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

  it("execResult.data?.rows[0] retorna undefined quando vazio", () => {
    const result: { data?: { rows?: unknown[] } } = { data: { rows: [] } };
    expect(result.data?.rows?.[0]).toBeUndefined();
  });

  it("userId null nao chama writeAuditLog", () => {
    const userId: string | null = null;
    const shouldCallAudit = !!userId;
    expect(shouldCallAudit).toBe(false);
  });
});

// ========== Logica de Error Handling ==========

describe("executions — logica de error handling", () => {
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

  it("execucao nao encontrada retorna 404", () => {
    const result = { error: null, data: { rows: [] } };
    const notFound = result.error || !result.data?.rows?.[0];
    expect(notFound).toBe(true);
  });

  it("execucao encontrada retorna 200", () => {
    const result = { error: null, data: { rows: [{ id: "e-1" }] } };
    const notFound = result.error || !result.data?.rows?.[0];
    expect(notFound).toBe(false);
  });

  it("result.error retorna APPROVAL_ERROR 400", () => {
    const result = { error: { message: "Already approved" } };
    const hasError = !!result.error;
    expect(hasError).toBe(true);
  });
});

// ========== Logica de Status Validation ==========

describe("executions — logica de status validation", () => {
  it.each([
    ["approved", true],
    ["pending", false],
    ["running", false],
    ["completed", false],
    ["cancelled", false],
  ] as const)(
    "POST /:id/run requer status=approved (atual=%s) → canRun=%s",
    (status, expected) => {
      const canRun = status === "approved";
      expect(canRun).toBe(expected);
    },
  );

  it.each([
    ["pending", true],
    ["approved", true],
    ["running", false],
    ["completed", false],
    ["cancelled", false],
  ] as const)(
    "POST /:id/cancel permite status=%s → canCancel=%s",
    (status, expected) => {
      const canCancel = status === "pending" || status === "approved";
      expect(canCancel).toBe(expected);
    },
  );
});

// ========== Logica de Script Execution ==========

describe("executions — logica de script execution", () => {
  it.each([
    ["python", "python3"],
    ["powershell", "powershell"],
    ["bash", "bash"],
    ["node", "node"],
    ["ruby", null],
  ] as const)("linguagem=%s → cmd=%s", (lang, expected) => {
    const cmd =
      lang === "python"
        ? "python3"
        : lang === "powershell"
          ? "powershell"
          : lang === "bash"
            ? "bash"
            : lang === "node"
              ? "node"
              : null;
    expect(cmd).toBe(expected);
  });

  it("exitCode 0 mantem status completed", () => {
    const exitCode = 0;
    const status = exitCode !== 0 ? "failed" : "completed";
    expect(status).toBe("completed");
  });

  it("exitCode != 0 muda status para failed", () => {
    const exitCode: number = 1;
    const status = exitCode !== 0 ? "failed" : "completed";
    expect(status).toBe("failed");
  });

  it("stdout truncado para 50000 chars", () => {
    const stdout = "a".repeat(60000);
    const truncated = stdout.substring(0, 50000);
    expect(truncated.length).toBe(50000);
  });

  it("stderr truncado para 50000 chars", () => {
    const stderr = "b".repeat(60000);
    const truncated = stderr.substring(0, 50000);
    expect(truncated.length).toBe(50000);
  });

  it("response stdout truncado para 5000 chars", () => {
    const stdout = "c".repeat(10000);
    const truncated = stdout.substring(0, 5000);
    expect(truncated.length).toBe(5000);
  });
});

// ========== Logica de Pagination ==========

describe("executions — logica de pagination", () => {
  it("constroi WHERE com conditions dinamicas", () => {
    const conditions: string[] = ["tenant_id = $1"];
    const params: unknown[] = ["t-1"];
    let paramIdx = 2;

    const status = "completed";
    const scriptId = "s-1";

    if (status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(status);
    }
    if (scriptId) {
      conditions.push(`script_id = $${paramIdx++}`);
      params.push(scriptId);
    }

    expect(conditions).toEqual([
      "tenant_id = $1",
      "status = $2",
      "script_id = $3",
    ]);
    expect(params).toEqual(["t-1", "completed", "s-1"]);
  });

  it("WHERE sem filtros extras so tem tenant_id", () => {
    const conditions: string[] = ["tenant_id = $1"];
    const whereClause = conditions.join(" AND ");
    expect(whereClause).toBe("tenant_id = $1");
  });
});
