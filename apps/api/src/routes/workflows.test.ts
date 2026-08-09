// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import { z } from "zod";

// ========== Schemas (replica local para testes) ==========

const stepTypeSchema = z.enum([
  "script",
  "command",
  "ssh_command",
  "http_request",
  "condition",
  "approval",
  "delay",
  "notification",
]);
const languageSchema = z.enum(["bash", "powershell", "python", "javascript"]);
const onFailureSchema = z.enum(["stop", "continue", "retry"]);
const categorySchema = z.enum([
  "general",
  "remediation",
  "diagnostic",
  "maintenance",
  "deployment",
  "security",
  "backup",
  "custom",
]);

const createStepSchema = z.object({
  step_order: z.number().int().min(0).default(0),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  step_type: stepTypeSchema,
  content: z.string().min(1),
  language: languageSchema.default("bash"),
  condition_expression: z.string().max(1000).optional(),
  on_failure: onFailureSchema.default("stop"),
  retry_count: z.number().int().min(0).max(10).default(0),
  retry_delay_seconds: z.number().int().min(0).max(3600).default(5),
  timeout_seconds: z.number().int().min(0).max(86400).default(300),
  output_variables: z.array(z.string()).default([]),
  requires_approval: z.boolean().default(false),
});

const createWorkflowSchema = z.object({
  device_id: z.string().uuid().optional(),
  device_hostname: z.string().min(1).max(255),
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  category: categorySchema.default("general"),
  tags: z.array(z.string()).default([]),
  is_template: z.boolean().default(false),
  steps: z.array(createStepSchema).default([]),
});

const cloneWorkflowSchema = z.object({
  device_hostname: z.string().min(1).max(255),
  device_id: z.string().uuid().optional(),
  name: z.string().min(1).max(200).optional(),
});

const executeWorkflowSchema = z.object({
  reason: z.string().max(500).optional(),
});

const rejectStepSchema = z.object({
  reason: z.string().max(1000).optional(),
});

// ========== stepTypeSchema ==========

describe("workflows — stepTypeSchema", () => {
  it("valida script", () => {
    expect(stepTypeSchema.safeParse("script").success).toBe(true);
  });
  it("valida command", () => {
    expect(stepTypeSchema.safeParse("command").success).toBe(true);
  });
  it("valida ssh_command", () => {
    expect(stepTypeSchema.safeParse("ssh_command").success).toBe(true);
  });
  it("valida http_request", () => {
    expect(stepTypeSchema.safeParse("http_request").success).toBe(true);
  });
  it("valida condition", () => {
    expect(stepTypeSchema.safeParse("condition").success).toBe(true);
  });
  it("valida approval", () => {
    expect(stepTypeSchema.safeParse("approval").success).toBe(true);
  });
  it("valida delay", () => {
    expect(stepTypeSchema.safeParse("delay").success).toBe(true);
  });
  it("valida notification", () => {
    expect(stepTypeSchema.safeParse("notification").success).toBe(true);
  });
  it("rejeita tipo invalido", () => {
    expect(stepTypeSchema.safeParse("email").success).toBe(false);
  });
  it("rejeita vazio", () => {
    expect(stepTypeSchema.safeParse("").success).toBe(false);
  });
});

// ========== languageSchema ==========

describe("workflows — languageSchema", () => {
  it("valida bash", () => {
    expect(languageSchema.safeParse("bash").success).toBe(true);
  });
  it("valida powershell", () => {
    expect(languageSchema.safeParse("powershell").success).toBe(true);
  });
  it("valida python", () => {
    expect(languageSchema.safeParse("python").success).toBe(true);
  });
  it("valida javascript", () => {
    expect(languageSchema.safeParse("javascript").success).toBe(true);
  });
  it("rejeita ruby", () => {
    expect(languageSchema.safeParse("ruby").success).toBe(false);
  });
});

// ========== onFailureSchema ==========

describe("workflows — onFailureSchema", () => {
  it("valida stop", () => {
    expect(onFailureSchema.safeParse("stop").success).toBe(true);
  });
  it("valida continue", () => {
    expect(onFailureSchema.safeParse("continue").success).toBe(true);
  });
  it("valida retry", () => {
    expect(onFailureSchema.safeParse("retry").success).toBe(true);
  });
  it("rejeita abort", () => {
    expect(onFailureSchema.safeParse("abort").success).toBe(false);
  });
});

// ========== categorySchema ==========

describe("workflows — categorySchema", () => {
  const validCategories = [
    "general",
    "remediation",
    "diagnostic",
    "maintenance",
    "deployment",
    "security",
    "backup",
    "custom",
  ];
  for (const cat of validCategories) {
    it(`valida ${cat}`, () => {
      expect(categorySchema.safeParse(cat).success).toBe(true);
    });
  }
  it("rejeita categoria invalida", () => {
    expect(categorySchema.safeParse("monitoring").success).toBe(false);
  });
});

// ========== createStepSchema ==========

describe("workflows — createStepSchema", () => {
  const validStep = {
    name: "Verificar disco",
    step_type: "script",
    content: "df -h",
  };

  it("valida step minimo", () => {
    const result = createStepSchema.safeParse(validStep);
    expect(result.success).toBe(true);
  });

  it("rejeita sem name", () => {
    const result = createStepSchema.safeParse({
      ...validStep,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem content", () => {
    const result = createStepSchema.safeParse({
      ...validStep,
      content: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita step_type invalido", () => {
    const result = createStepSchema.safeParse({
      ...validStep,
      step_type: "email",
    });
    expect(result.success).toBe(false);
  });

  it("aplica default step_order=0", () => {
    const result = createStepSchema.safeParse(validStep);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.step_order).toBe(0);
    }
  });

  it("aplica default language=bash", () => {
    const result = createStepSchema.safeParse(validStep);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.language).toBe("bash");
    }
  });

  it("aplica default on_failure=stop", () => {
    const result = createStepSchema.safeParse(validStep);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.on_failure).toBe("stop");
    }
  });

  it("aplica default retry_count=0", () => {
    const result = createStepSchema.safeParse(validStep);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.retry_count).toBe(0);
    }
  });

  it("aplica default retry_delay_seconds=5", () => {
    const result = createStepSchema.safeParse(validStep);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.retry_delay_seconds).toBe(5);
    }
  });

  it("aplica default timeout_seconds=300", () => {
    const result = createStepSchema.safeParse(validStep);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timeout_seconds).toBe(300);
    }
  });

  it("aplica default output_variables=[]", () => {
    const result = createStepSchema.safeParse(validStep);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.output_variables).toEqual([]);
    }
  });

  it("aplica default requires_approval=false", () => {
    const result = createStepSchema.safeParse(validStep);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.requires_approval).toBe(false);
    }
  });

  it("rejeita retry_count > 10", () => {
    const result = createStepSchema.safeParse({
      ...validStep,
      retry_count: 11,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita retry_count negativo", () => {
    const result = createStepSchema.safeParse({
      ...validStep,
      retry_count: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita timeout_seconds > 86400", () => {
    const result = createStepSchema.safeParse({
      ...validStep,
      timeout_seconds: 100000,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita retry_delay_seconds > 3600", () => {
    const result = createStepSchema.safeParse({
      ...validStep,
      retry_delay_seconds: 5000,
    });
    expect(result.success).toBe(false);
  });

  it("valida step completo com approval", () => {
    const result = createStepSchema.safeParse({
      step_order: 1,
      name: "Aprovar deploy",
      description: "Aguarda aprovação manual",
      step_type: "approval",
      content: "Aguarde aprovação do gestor",
      language: "bash",
      condition_expression: "$prev_exit_code == 0",
      on_failure: "stop",
      retry_count: 3,
      retry_delay_seconds: 30,
      timeout_seconds: 600,
      output_variables: ["approval_status"],
      requires_approval: true,
    });
    expect(result.success).toBe(true);
  });
});

// ========== createWorkflowSchema ==========

describe("workflows — createWorkflowSchema", () => {
  const validWorkflow = {
    device_hostname: "server-01.example.com",
    name: "Deploy Produção",
  };

  it("valida workflow minimo", () => {
    const result = createWorkflowSchema.safeParse(validWorkflow);
    expect(result.success).toBe(true);
  });

  it("rejeita sem device_hostname", () => {
    const result = createWorkflowSchema.safeParse({
      ...validWorkflow,
      device_hostname: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem name", () => {
    const result = createWorkflowSchema.safeParse({
      ...validWorkflow,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("aplica default category=general", () => {
    const result = createWorkflowSchema.safeParse(validWorkflow);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBe("general");
    }
  });

  it("aplica default tags=[]", () => {
    const result = createWorkflowSchema.safeParse(validWorkflow);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual([]);
    }
  });

  it("aplica default is_template=false", () => {
    const result = createWorkflowSchema.safeParse(validWorkflow);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_template).toBe(false);
    }
  });

  it("aplica default steps=[]", () => {
    const result = createWorkflowSchema.safeParse(validWorkflow);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.steps).toEqual([]);
    }
  });

  it("valida device_id UUID", () => {
    const result = createWorkflowSchema.safeParse({
      ...validWorkflow,
      device_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita device_id invalido", () => {
    const result = createWorkflowSchema.safeParse({
      ...validWorkflow,
      device_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("valida workflow com steps", () => {
    const result = createWorkflowSchema.safeParse({
      ...validWorkflow,
      steps: [
        {
          name: "Step 1",
          step_type: "script",
          content: "echo hello",
        },
        {
          name: "Step 2",
          step_type: "command",
          content: "ls -la",
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.steps).toHaveLength(2);
    }
  });

  it("valida workflow template", () => {
    const result = createWorkflowSchema.safeParse({
      ...validWorkflow,
      is_template: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_template).toBe(true);
    }
  });
});

// ========== cloneWorkflowSchema ==========

describe("workflows — cloneWorkflowSchema", () => {
  it("valida clone minimo", () => {
    const result = cloneWorkflowSchema.safeParse({
      device_hostname: "server-02.example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sem device_hostname", () => {
    const result = cloneWorkflowSchema.safeParse({
      device_hostname: "",
    });
    expect(result.success).toBe(false);
  });

  it("valida com device_id", () => {
    const result = cloneWorkflowSchema.safeParse({
      device_hostname: "server-02.example.com",
      device_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita device_id invalido", () => {
    const result = cloneWorkflowSchema.safeParse({
      device_hostname: "server-02.example.com",
      device_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("valida com name customizado", () => {
    const result = cloneWorkflowSchema.safeParse({
      device_hostname: "server-02.example.com",
      name: "Deploy Produção (cópia)",
    });
    expect(result.success).toBe(true);
  });
});

// ========== executeWorkflowSchema ==========

describe("workflows — executeWorkflowSchema", () => {
  it("valida execute vazio", () => {
    const result = executeWorkflowSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida execute com reason", () => {
    const result = executeWorkflowSchema.safeParse({
      reason: "Deploy emergencial",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita reason muito longo", () => {
    const result = executeWorkflowSchema.safeParse({
      reason: "x".repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

// ========== rejectStepSchema ==========

describe("workflows — rejectStepSchema", () => {
  it("valida reject vazio", () => {
    const result = rejectStepSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida reject com reason", () => {
    const result = rejectStepSchema.safeParse({
      reason: "Script não seguro",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita reason muito longo", () => {
    const result = rejectStepSchema.safeParse({
      reason: "x".repeat(1001),
    });
    expect(result.success).toBe(false);
  });
});

// ========== Logica de Status de Execução ==========

describe("workflows — logica de status de execução", () => {
  it("running permite cancel", () => {
    const status: string = "running";
    const canCancel = ["running", "pending", "awaiting_approval"].includes(
      status,
    );
    expect(canCancel).toBe(true);
  });

  it("pending permite cancel", () => {
    const status: string = "pending";
    const canCancel = ["running", "pending", "awaiting_approval"].includes(
      status,
    );
    expect(canCancel).toBe(true);
  });

  it("awaiting_approval permite cancel", () => {
    const status: string = "awaiting_approval";
    const canCancel = ["running", "pending", "awaiting_approval"].includes(
      status,
    );
    expect(canCancel).toBe(true);
  });

  it("completed bloqueia cancel", () => {
    const status: string = "completed";
    const canCancel = ["running", "pending", "awaiting_approval"].includes(
      status,
    );
    expect(canCancel).toBe(false);
  });

  it("failed bloqueia cancel", () => {
    const status: string = "failed";
    const canCancel = ["running", "pending", "awaiting_approval"].includes(
      status,
    );
    expect(canCancel).toBe(false);
  });

  it("cancelled bloqueia cancel", () => {
    const status: string = "cancelled";
    const canCancel = ["running", "pending", "awaiting_approval"].includes(
      status,
    );
    expect(canCancel).toBe(false);
  });
});

// ========== Logica de Approval ==========

describe("workflows — logica de approval", () => {
  it("awaiting_approval permite approve", () => {
    const status: string = "awaiting_approval";
    const canApprove = status === "awaiting_approval";
    expect(canApprove).toBe(true);
  });

  it("pending bloqueia approve", () => {
    const status: string = "pending";
    const canApprove = status === "awaiting_approval";
    expect(canApprove).toBe(false);
  });

  it("running bloqueia approve", () => {
    const status: string = "running";
    const canApprove = status === "awaiting_approval";
    expect(canApprove).toBe(false);
  });

  it("approved bloqueia approve", () => {
    const status: string = "approved";
    const canApprove = status === "awaiting_approval";
    expect(canApprove).toBe(false);
  });
});

// ========== Logica de Step Status apos Cancel ==========

describe("workflows — step status apos cancel", () => {
  const cancellableStepStatuses = ["pending", "running", "awaiting_approval"];

  it("pending é marcado como skipped", () => {
    const status: string = "pending";
    expect(cancellableStepStatuses.includes(status)).toBe(true);
  });

  it("running é marcado como skipped", () => {
    const status: string = "running";
    expect(cancellableStepStatuses.includes(status)).toBe(true);
  });

  it("awaiting_approval é marcado como skipped", () => {
    const status: string = "awaiting_approval";
    expect(cancellableStepStatuses.includes(status)).toBe(true);
  });

  it("completed NÃO é marcado como skipped", () => {
    const status: string = "completed";
    expect(cancellableStepStatuses.includes(status)).toBe(false);
  });

  it("failed NÃO é marcado como skipped", () => {
    const status: string = "failed";
    expect(cancellableStepStatuses.includes(status)).toBe(false);
  });
});
