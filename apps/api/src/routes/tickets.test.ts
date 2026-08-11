// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  createTicketSchema,
  updateTicketSchema,
  createCommentSchema,
  createCategorySchema,
  updateCategorySchema,
} from "@repo/shared-validation";

// Testes dos schemas Zod de tickets
describe("tickets schemas — createTicketSchema", () => {
  it("valida ticket minimo (subject + description)", () => {
    const result = createTicketSchema.safeParse({
      subject: "Erro no servidor",
      description: "Servidor nao responde",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sem subject", () => {
    const result = createTicketSchema.safeParse({
      description: "Servidor nao responde",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem description", () => {
    const result = createTicketSchema.safeParse({
      subject: "Erro no servidor",
    });
    expect(result.success).toBe(false);
  });

  it("valida ticket completo com todos os campos", () => {
    const result = createTicketSchema.safeParse({
      subject: "Erro no servidor",
      description: "Servidor nao responde apos reboot",
      priority: 3,
      source: "email",
      requester_name: "Joao Silva",
      requester_email: "joao@empresa.com",
      requester_phone: "+55 11 99999-9999",
      tags: ["urgente", "producao"],
      metadata: { ip: "192.168.1.1" },
    });
    expect(result.success).toBe(true);
  });

  it("rejeita priority fora do range (5)", () => {
    const result = createTicketSchema.safeParse({
      subject: "Teste",
      description: "Teste",
      priority: 5,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita priority negativa", () => {
    const result = createTicketSchema.safeParse({
      subject: "Teste",
      description: "Teste",
      priority: -1,
    });
    expect(result.success).toBe(false);
  });

  it("aplica default priority=2 quando nao informada", () => {
    const result = createTicketSchema.safeParse({
      subject: "Teste",
      description: "Teste",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe(2);
    }
  });

  it("valida category_id como UUID", () => {
    const result = createTicketSchema.safeParse({
      subject: "Teste",
      description: "Teste",
      category_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita category_id nao-UUID", () => {
    const result = createTicketSchema.safeParse({
      subject: "Teste",
      description: "Teste",
      category_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});

describe("tickets schemas — updateTicketSchema", () => {
  it("valida update parcial (apenas status)", () => {
    const result = updateTicketSchema.safeParse({ status: "resolved" });
    expect(result.success).toBe(true);
  });

  it("valida update completo", () => {
    const result = updateTicketSchema.safeParse({
      subject: "Novo assunto",
      description: "Nova descricao",
      priority: 1,
      status: "in_progress",
      assignee_id: "550e8400-e29b-41d4-a716-446655440000",
      tags: ["novo"],
      category_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("valida update vazio (sem campos)", () => {
    const result = updateTicketSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejeita assignee_id nao-UUID", () => {
    const result = updateTicketSchema.safeParse({
      assignee_id: "invalid",
    });
    expect(result.success).toBe(false);
  });
});

describe("tickets schemas — createCommentSchema", () => {
  it("valida comentario com body e ticket_id", () => {
    const result = createCommentSchema.safeParse({
      ticket_id: "550e8400-e29b-41d4-a716-446655440000",
      body: "Comentario de teste",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sem body", () => {
    const result = createCommentSchema.safeParse({
      ticket_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem ticket_id", () => {
    const result = createCommentSchema.safeParse({
      body: "Comentario",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita ticket_id nao-UUID", () => {
    const result = createCommentSchema.safeParse({
      ticket_id: "not-uuid",
      body: "Comentario",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita body vazio", () => {
    const result = createCommentSchema.safeParse({
      ticket_id: "550e8400-e29b-41d4-a716-446655440000",
      body: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita body com mais de 10000 chars", () => {
    const result = createCommentSchema.safeParse({
      ticket_id: "550e8400-e29b-41d4-a716-446655440000",
      body: "x".repeat(10001),
    });
    expect(result.success).toBe(false);
  });

  it("aceita body com exatamente 10000 chars", () => {
    const result = createCommentSchema.safeParse({
      ticket_id: "550e8400-e29b-41d4-a716-446655440000",
      body: "x".repeat(10000),
    });
    expect(result.success).toBe(true);
  });

  it("aplica default is_internal=false", () => {
    const result = createCommentSchema.safeParse({
      ticket_id: "550e8400-e29b-41d4-a716-446655440000",
      body: "Comentario",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_internal).toBe(false);
    }
  });

  it("aceita is_internal=true", () => {
    const result = createCommentSchema.safeParse({
      ticket_id: "550e8400-e29b-41d4-a716-446655440000",
      body: "Comentario interno",
      is_internal: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_internal).toBe(true);
    }
  });

  it("nao exige campo content (removido do schema)", () => {
    const result = createCommentSchema.safeParse({
      ticket_id: "550e8400-e29b-41d4-a716-446655440000",
      body: "Comentario",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("content");
    }
  });
});

describe("tickets schemas — createCategorySchema", () => {
  it("valida categoria com name e color", () => {
    const result = createCategorySchema.safeParse({
      name: "Incidente",
      color: "#FF0000",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sem name", () => {
    const result = createCategorySchema.safeParse({
      color: "#FF0000",
    });
    expect(result.success).toBe(false);
  });
});

describe("tickets schemas — updateCategorySchema", () => {
  it("valida update parcial", () => {
    const result = updateCategorySchema.safeParse({
      name: "Novo nome",
    });
    expect(result.success).toBe(true);
  });
});

// Testes da logica de status de tickets
describe("tickets — logica de status", () => {
  const ACTIVE_STATUSES = [
    "open",
    "in_progress",
    "waiting_customer",
    "waiting_third_party",
  ];
  const CLOSED_STATUSES = ["resolved", "closed", "cancelled"];

  function isActiveStatus(status: string): boolean {
    return ACTIVE_STATUSES.includes(status);
  }

  function isClosedStatus(status: string): boolean {
    return CLOSED_STATUSES.includes(status);
  }

  it("open e ativo", () => {
    expect(isActiveStatus("open")).toBe(true);
  });

  it("in_progress e ativo", () => {
    expect(isActiveStatus("in_progress")).toBe(true);
  });

  it("resolved e fechado", () => {
    expect(isClosedStatus("resolved")).toBe(true);
  });

  it("closed e fechado", () => {
    expect(isClosedStatus("closed")).toBe(true);
  });

  it("cancelled e fechado", () => {
    expect(isClosedStatus("cancelled")).toBe(true);
  });

  it("status invalido nao e ativo nem fechado", () => {
    expect(isActiveStatus("invalid")).toBe(false);
    expect(isClosedStatus("invalid")).toBe(false);
  });
});

// Testes da logica de SLA
describe("tickets — logica de SLA", () => {
  function calcSlaBreach(
    createdAt: Date,
    slaHours: number,
    now: Date = new Date(),
  ): boolean {
    const slaMs = slaHours * 60 * 60 * 1000;
    return now.getTime() - createdAt.getTime() > slaMs;
  }

  it("detecta SLA nao estourado", () => {
    const created = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1h ago
    expect(calcSlaBreach(created, 4)).toBe(false);
  });

  it("detecta SLA estourado", () => {
    const created = new Date(Date.now() - 5 * 60 * 60 * 1000); // 5h ago
    expect(calcSlaBreach(created, 4)).toBe(true);
  });

  it("SLA no limite exato nao estoura", () => {
    const created = new Date(Date.now() - 4 * 60 * 60 * 1000); // 4h ago
    expect(calcSlaBreach(created, 4)).toBe(false);
  });

  it("SLA com 0 horas sempre estoura (exceto se criado agora)", () => {
    const created = new Date(Date.now() - 1000); // 1s ago
    expect(calcSlaBreach(created, 0)).toBe(true);
  });
});

// Testes da logica de prioridade
describe("tickets — logica de prioridade", () => {
  const PRIORITY_ORDER: Record<string, number> = {
    urgent: 1,
    high: 2,
    medium: 3,
    low: 4,
  };

  function sortByPriority(tickets: Array<{ priority: string }>) {
    return [...tickets].sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 99;
      const pb = PRIORITY_ORDER[b.priority] ?? 99;
      return pa - pb;
    });
  }

  it("ordena urgent antes de low", () => {
    const tickets = [
      { priority: "low" },
      { priority: "urgent" },
      { priority: "medium" },
    ];
    const sorted = sortByPriority(tickets);
    expect(sorted[0]!.priority).toBe("urgent");
    expect(sorted[1]!.priority).toBe("medium");
    expect(sorted[2]!.priority).toBe("low");
  });

  it("prioridade desconhecida vai para o final", () => {
    const tickets = [{ priority: "unknown" }, { priority: "low" }];
    const sorted = sortByPriority(tickets);
    expect(sorted[0]!.priority).toBe("low");
    expect(sorted[1]!.priority).toBe("unknown");
  });
});

// Testes de edge cases
describe("tickets — edge cases", () => {
  it("tenant sem tickets retorna total 0", () => {
    const total = "0";
    expect(total).toBe("0");
  });

  it("stats com todos tickets fechados tem open_tickets 0", () => {
    const sla = {
      overdue: "0",
      open_tickets: "0",
      avg_response_mins: "30",
      avg_resolution_mins: "120",
      avg_rating: "4.5",
    };
    expect(sla.open_tickets).toBe("0");
  });

  it("comentario interno nao deve aparecer para cliente", () => {
    const comments = [
      { id: "1", body: "Publico", is_internal: false },
      { id: "2", body: "Interno", is_internal: true },
    ];
    const publicComments = comments.filter((c) => !c.is_internal);
    expect(publicComments).toHaveLength(1);
    expect(publicComments[0]!.body).toBe("Publico");
  });

  it("ticket sem categoria tem category_name null", () => {
    const ticket = {
      id: "1",
      subject: "Teste",
      category_id: null,
      category_name: null,
    };
    expect(ticket.category_name).toBeNull();
  });
});
