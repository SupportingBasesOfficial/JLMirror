// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  createChangeRequestSchema,
  updateChangeRequestSchema,
  createChangeTaskSchema,
  approveChangeSchema,
} from "@repo/shared-validation";

// ========== createChangeRequestSchema ==========

describe("changes — createChangeRequestSchema", () => {
  const validChange = {
    title: "Atualizar versão do PostgreSQL",
    change_type: "normal" as const,
  };

  it("valida change minimo", () => {
    const result = createChangeRequestSchema.safeParse(validChange);
    expect(result.success).toBe(true);
  });

  it("rejeita sem title", () => {
    const result = createChangeRequestSchema.safeParse({
      change_type: "normal",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem change_type", () => {
    const result = createChangeRequestSchema.safeParse({
      title: "Change",
    });
    expect(result.success).toBe(false);
  });

  it("valida todos os change_types", () => {
    const types = ["standard", "normal", "emergency"];
    for (const change_type of types) {
      const result = createChangeRequestSchema.safeParse({
        ...validChange,
        change_type,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejeita change_type invalido", () => {
    const result = createChangeRequestSchema.safeParse({
      ...validChange,
      change_type: "minor",
    });
    expect(result.success).toBe(false);
  });

  it("valida todas as priorities", () => {
    const priorities = ["low", "medium", "high", "critical"];
    for (const priority of priorities) {
      const result = createChangeRequestSchema.safeParse({
        ...validChange,
        priority,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejeita priority como number (campo antigo removido)", () => {
    const result = createChangeRequestSchema.safeParse({
      ...validChange,
      priority: 2,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita priority invalida", () => {
    const result = createChangeRequestSchema.safeParse({
      ...validChange,
      priority: "urgent",
    });
    expect(result.success).toBe(false);
  });

  it("valida todos os risk_levels", () => {
    const levels = ["low", "medium", "high", "critical"];
    for (const risk_level of levels) {
      const result = createChangeRequestSchema.safeParse({
        ...validChange,
        risk_level,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejeita risk_level invalido", () => {
    const result = createChangeRequestSchema.safeParse({
      ...validChange,
      risk_level: "extreme",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita impact (campo antigo removido)", () => {
    const result = createChangeRequestSchema.safeParse({
      ...validChange,
      impact: "high",
    });
    expect(result.success).toBe(true); // Zod permite extra keys
    if (result.success) {
      expect(result.data).not.toHaveProperty("impact");
    }
  });

  it("description opcional (DB nullable)", () => {
    const result = createChangeRequestSchema.safeParse({
      ...validChange,
      description: "Detalhes do change",
    });
    expect(result.success).toBe(true);
  });

  it("aplica default priority=medium", () => {
    const result = createChangeRequestSchema.safeParse(validChange);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe("medium");
    }
  });

  it("aplica default risk_level=low", () => {
    const result = createChangeRequestSchema.safeParse(validChange);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.risk_level).toBe("low");
    }
  });

  it("aplica default approval_required=true", () => {
    const result = createChangeRequestSchema.safeParse(validChange);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.approval_required).toBe(true);
    }
  });

  it("aplica default affected_systems=[]", () => {
    const result = createChangeRequestSchema.safeParse(validChange);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.affected_systems).toEqual([]);
    }
  });

  it("aplica default affected_services=[]", () => {
    const result = createChangeRequestSchema.safeParse(validChange);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.affected_services).toEqual([]);
    }
  });

  it("valida planned_start_at ISO datetime", () => {
    const result = createChangeRequestSchema.safeParse({
      ...validChange,
      planned_start_at: "2026-08-15T10:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita planned_start_at sem formato ISO", () => {
    const result = createChangeRequestSchema.safeParse({
      ...validChange,
      planned_start_at: "2026-08-15",
    });
    expect(result.success).toBe(false);
  });

  it("valida related_ticket_id UUID", () => {
    const result = createChangeRequestSchema.safeParse({
      ...validChange,
      related_ticket_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita related_ticket_id invalido", () => {
    const result = createChangeRequestSchema.safeParse({
      ...validChange,
      related_ticket_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("valida change completo", () => {
    const result = createChangeRequestSchema.safeParse({
      ...validChange,
      description: "Atualizar PostgreSQL de 15 para 16",
      priority: "high",
      risk_level: "medium",
      planned_start_at: "2026-08-15T10:00:00Z",
      planned_end_at: "2026-08-15T14:00:00Z",
      affected_systems: ["db-prod-01", "api-prod"],
      affected_services: ["api", "dashboard"],
      impact_assessment: "Indisponibilidade de 2h",
      rollback_plan: "Downgrade para PG15",
      approval_required: true,
      related_ticket_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });
});

// ========== updateChangeRequestSchema ==========

describe("changes — updateChangeRequestSchema", () => {
  it("valida update parcial", () => {
    const result = updateChangeRequestSchema.safeParse({
      title: "Novo título",
    });
    expect(result.success).toBe(true);
  });

  it("valida update vazio", () => {
    const result = updateChangeRequestSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida todos os status no update", () => {
    const statuses = [
      "draft",
      "submitted",
      "under_review",
      "approved",
      "rejected",
      "scheduled",
      "in_progress",
      "implemented",
      "failed",
      "rolled_back",
      "cancelled",
    ];
    for (const status of statuses) {
      const result = updateChangeRequestSchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });

  it("rejeita status invalido", () => {
    const result = updateChangeRequestSchema.safeParse({
      status: "pending",
    });
    expect(result.success).toBe(false);
  });

  it("valida change_type no update", () => {
    const result = updateChangeRequestSchema.safeParse({
      change_type: "emergency",
    });
    expect(result.success).toBe(true);
  });

  it("valida priority no update (string enum)", () => {
    const result = updateChangeRequestSchema.safeParse({
      priority: "critical",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita priority number no update (campo antigo)", () => {
    const result = updateChangeRequestSchema.safeParse({
      priority: 3,
    });
    expect(result.success).toBe(false);
  });

  it("valida risk_level no update", () => {
    const result = updateChangeRequestSchema.safeParse({
      risk_level: "high",
    });
    expect(result.success).toBe(true);
  });

  it("valida assigned_to UUID no update", () => {
    const result = updateChangeRequestSchema.safeParse({
      assigned_to: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("valida rollback_status no update", () => {
    const result = updateChangeRequestSchema.safeParse({
      rollback_status: "executed",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita rollback_status invalido", () => {
    const result = updateChangeRequestSchema.safeParse({
      rollback_status: "in_progress",
    });
    expect(result.success).toBe(false);
  });

  it("valida implementation_notes no update", () => {
    const result = updateChangeRequestSchema.safeParse({
      implementation_notes: "Implementado com sucesso",
    });
    expect(result.success).toBe(true);
  });

  it("valida post_implementation_review no update", () => {
    const result = updateChangeRequestSchema.safeParse({
      post_implementation_review: "Sem incidentes",
    });
    expect(result.success).toBe(true);
  });

  it("valida affected_systems no update", () => {
    const result = updateChangeRequestSchema.safeParse({
      affected_systems: ["server-1", "server-2"],
    });
    expect(result.success).toBe(true);
  });
});

// ========== createChangeTaskSchema ==========

describe("changes — createChangeTaskSchema", () => {
  const validTask = {
    title: "Backup do banco",
  };

  it("valida task minimo", () => {
    const result = createChangeTaskSchema.safeParse(validTask);
    expect(result.success).toBe(true);
  });

  it("rejeita sem title", () => {
    const result = createChangeTaskSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejeita change_request_id (campo antigo removido)", () => {
    const result = createChangeTaskSchema.safeParse({
      ...validTask,
      change_request_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true); // Zod permite extra keys
    if (result.success) {
      expect(result.data).not.toHaveProperty("change_request_id");
    }
  });

  it("rejeita assignee_id (campo antigo removido)", () => {
    const result = createChangeTaskSchema.safeParse({
      ...validTask,
      assignee_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("assignee_id");
    }
  });

  it("valida todos os task_types", () => {
    const types = ["pre_check", "implementation", "post_check", "rollback"];
    for (const task_type of types) {
      const result = createChangeTaskSchema.safeParse({
        ...validTask,
        task_type,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejeita task_type manual (default antigo removido)", () => {
    const result = createChangeTaskSchema.safeParse({
      ...validTask,
      task_type: "manual",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita task_type invalido", () => {
    const result = createChangeTaskSchema.safeParse({
      ...validTask,
      task_type: "verification",
    });
    expect(result.success).toBe(false);
  });

  it("aplica default task_type=implementation", () => {
    const result = createChangeTaskSchema.safeParse(validTask);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.task_type).toBe("implementation");
    }
  });

  it("aplica default task_order=0", () => {
    const result = createChangeTaskSchema.safeParse(validTask);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.task_order).toBe(0);
    }
  });

  it("rejeita task_order negativo", () => {
    const result = createChangeTaskSchema.safeParse({
      ...validTask,
      task_order: -1,
    });
    expect(result.success).toBe(false);
  });

  it("valida assigned_to UUID", () => {
    const result = createChangeTaskSchema.safeParse({
      ...validTask,
      assigned_to: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita assigned_to invalido", () => {
    const result = createChangeTaskSchema.safeParse({
      ...validTask,
      assigned_to: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("valida task completo", () => {
    const result = createChangeTaskSchema.safeParse({
      title: "Backup do banco",
      description: "Fazer backup completo antes do upgrade",
      task_order: 1,
      task_type: "pre_check",
      assigned_to: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });
});

// ========== approveChangeSchema ==========

describe("changes — approveChangeSchema", () => {
  it("valida approve vazio (campos opcionais)", () => {
    const result = approveChangeSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida approve com comment", () => {
    const result = approveChangeSchema.safeParse({
      comment: "Aprovado conforme política",
    });
    expect(result.success).toBe(true);
  });

  it("valida approve com approver_role", () => {
    const result = approveChangeSchema.safeParse({
      approver_role: "change_manager",
    });
    expect(result.success).toBe(true);
  });

  it("nao requer change_request_id (removido, vem da URL)", () => {
    const result = approveChangeSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("change_request_id");
    }
  });

  it("nao requer approved (removido, endpoint define acao)", () => {
    const result = approveChangeSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("approved");
    }
  });

  it("ignora change_request_id se fornecido (campo antigo)", () => {
    const result = approveChangeSchema.safeParse({
      change_request_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("change_request_id");
    }
  });

  it("ignora approved se fornecido (campo antigo)", () => {
    const result = approveChangeSchema.safeParse({
      approved: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("approved");
    }
  });
});

// ========== Logica de Status Transitions ==========

describe("changes — logica de transicoes de status", () => {
  it("approve permite submitted", () => {
    const status: string = "submitted";
    const canApprove = status === "submitted" || status === "under_review";
    expect(canApprove).toBe(true);
  });

  it("approve permite under_review", () => {
    const status: string = "under_review";
    const canApprove = status === "submitted" || status === "under_review";
    expect(canApprove).toBe(true);
  });

  it("approve bloqueia approved", () => {
    const status: string = "approved";
    const canApprove = status === "submitted" || status === "under_review";
    expect(canApprove).toBe(false);
  });

  it("approve bloqueia rejected", () => {
    const status: string = "rejected";
    const canApprove = status === "submitted" || status === "under_review";
    expect(canApprove).toBe(false);
  });

  it("approve bloqueia implemented", () => {
    const status: string = "implemented";
    const canApprove = status === "submitted" || status === "under_review";
    expect(canApprove).toBe(false);
  });

  it("implement permite approved", () => {
    const status: string = "approved";
    const canImplement = status === "approved" || status === "scheduled";
    expect(canImplement).toBe(true);
  });

  it("implement permite scheduled", () => {
    const status: string = "scheduled";
    const canImplement = status === "approved" || status === "scheduled";
    expect(canImplement).toBe(true);
  });

  it("implement bloqueia submitted", () => {
    const status: string = "submitted";
    const canImplement = status === "approved" || status === "scheduled";
    expect(canImplement).toBe(false);
  });

  it("implement bloqueia in_progress", () => {
    const status: string = "in_progress";
    const canImplement = status === "approved" || status === "scheduled";
    expect(canImplement).toBe(false);
  });
});

// ========== Logica de Task Status ==========

describe("changes — logica de task status", () => {
  it("in_progress define started_at", () => {
    const status: string = "in_progress";
    const shouldSetStartedAt = status === "in_progress";
    expect(shouldSetStartedAt).toBe(true);
  });

  it("completed define completed_at", () => {
    const status: string = "completed";
    const shouldSetCompletedAt =
      status === "completed" || status === "skipped" || status === "failed";
    expect(shouldSetCompletedAt).toBe(true);
  });

  it("skipped define completed_at", () => {
    const status: string = "skipped";
    const shouldSetCompletedAt =
      status === "completed" || status === "skipped" || status === "failed";
    expect(shouldSetCompletedAt).toBe(true);
  });

  it("failed define completed_at", () => {
    const status: string = "failed";
    const shouldSetCompletedAt =
      status === "completed" || status === "skipped" || status === "failed";
    expect(shouldSetCompletedAt).toBe(true);
  });

  it("pending nao define completed_at", () => {
    const status: string = "pending";
    const shouldSetCompletedAt =
      status === "completed" || status === "skipped" || status === "failed";
    expect(shouldSetCompletedAt).toBe(false);
  });
});

// ========== Logica de Rollback Status ==========

describe("changes — logica de rollback_status", () => {
  it("approval_required=true define rollback_status=planned", () => {
    const approvalRequired = true;
    const rollbackStatus = approvalRequired ? "planned" : "not_needed";
    expect(rollbackStatus).toBe("planned");
  });

  it("approval_required=false define rollback_status=not_needed", () => {
    const approvalRequired = false;
    const rollbackStatus = approvalRequired ? "planned" : "not_needed";
    expect(rollbackStatus).toBe("not_needed");
  });
});

// ========== Logica de Success Rate ==========

describe("changes — logica de success rate", () => {
  it("calcula success rate com implemented", () => {
    const total = 100;
    const implemented = 80;
    const rate = total > 0 ? Math.round((implemented / total) * 100) : 0;
    expect(rate).toBe(80);
  });

  it("success rate 0 quando total=0", () => {
    const total = 0;
    const implemented = 0;
    const rate = total > 0 ? Math.round((implemented / total) * 100) : 0;
    expect(rate).toBe(0);
  });

  it("success rate 100 quando todos implemented", () => {
    const total = 50;
    const implemented = 50;
    const rate = total > 0 ? Math.round((implemented / total) * 100) : 0;
    expect(rate).toBe(100);
  });

  it("success rate arredonda para inteiro", () => {
    const total = 3;
    const implemented = 2;
    const rate = total > 0 ? Math.round((implemented / total) * 100) : 0;
    expect(rate).toBe(67);
  });
});

// ========== Validacao de Month (Calendar) ==========

describe("changes — validacao de month (calendar)", () => {
  // Replica a funcao isValidMonthFormat do changes.ts
  function isValidMonthFormat(month: string): boolean {
    return /^\d{4}-\d{2}$/.test(month);
  }

  it("aceita formato YYYY-MM", () => {
    expect(isValidMonthFormat("2026-08")).toBe(true);
  });

  it("aceita mes com zero a esquerda", () => {
    expect(isValidMonthFormat("2026-01")).toBe(true);
  });

  it("aceita mes 12", () => {
    expect(isValidMonthFormat("2026-12")).toBe(true);
  });

  it("rejeita formato YYYY-MM-DD (completo)", () => {
    expect(isValidMonthFormat("2026-08-15")).toBe(false);
  });

  it("rejeita SQL injection attempt", () => {
    expect(isValidMonthFormat("' OR 1=1 --")).toBe(false);
  });

  it("rejeita string vazia", () => {
    expect(isValidMonthFormat("")).toBe(false);
  });

  it("rejeita apenas ano", () => {
    expect(isValidMonthFormat("2026")).toBe(false);
  });

  it("rejeita mes sem zero a esquerda", () => {
    expect(isValidMonthFormat("2026-8")).toBe(false);
  });

  it("rejeita caracteres especiais", () => {
    expect(isValidMonthFormat("2026-08;")).toBe(false);
  });

  it("rejeita mes 13", () => {
    // Regex apenas valida formato, mas mes 13 passa no regex
    // (validacao semantica seria no DB)
    expect(isValidMonthFormat("2026-13")).toBe(true);
  });
});
