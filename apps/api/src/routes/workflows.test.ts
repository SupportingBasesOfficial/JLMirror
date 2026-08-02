// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import { z } from "zod";

// Replica dos schemas definidos em workflows.ts
const stepTypeSchema = z.enum(["script", "command", "ssh_command", "http_request", "condition", "approval", "delay", "notification"]);
const languageSchema = z.enum(["bash", "powershell", "python", "javascript"]);
const onFailureSchema = z.enum(["stop", "continue", "retry"]);
const categorySchema = z.enum(["general", "remediation", "diagnostic", "maintenance", "deployment", "security", "backup", "custom"]);

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

describe("workflow schemas — createStepSchema", () => {
  it("valida step com defaults", () => {
    const result = createStepSchema.safeParse({
      name: "Executar script",
      step_type: "script",
      content: "echo hello",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.language).toBe("bash");
      expect(result.data.on_failure).toBe("stop");
      expect(result.data.retry_count).toBe(0);
      expect(result.data.requires_approval).toBe(false);
    }
  });

  it("valida step com todos os campos", () => {
    const result = createStepSchema.safeParse({
      step_order: 1,
      name: "SSH Command",
      step_type: "ssh_command",
      content: "uptime",
      language: "powershell",
      on_failure: "retry",
      retry_count: 3,
      retry_delay_seconds: 10,
      timeout_seconds: 60,
      output_variables: ["uptime_output"],
      requires_approval: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita step_type invalido", () => {
    const result = createStepSchema.safeParse({
      name: "Step",
      step_type: "invalid_type",
      content: "echo",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem content", () => {
    const result = createStepSchema.safeParse({
      name: "Step",
      step_type: "command",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita retry_count > 10", () => {
    const result = createStepSchema.safeParse({
      name: "Step",
      step_type: "script",
      content: "echo",
      retry_count: 11,
    });
    expect(result.success).toBe(false);
  });
});

describe("workflow schemas — createWorkflowSchema", () => {
  it("valida workflow minimo", () => {
    const result = createWorkflowSchema.safeParse({
      device_hostname: "server-01",
      name: "Deploy Workflow",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBe("general");
      expect(result.data.is_template).toBe(false);
      expect(result.data.steps).toEqual([]);
    }
  });

  it("valida workflow com steps", () => {
    const result = createWorkflowSchema.safeParse({
      device_hostname: "server-01",
      name: "Remediation",
      category: "remediation",
      tags: ["auto", "critical"],
      steps: [
        { name: "Check CPU", step_type: "command", content: "top -bn1" },
        { name: "Restart", step_type: "ssh_command", content: "systemctl restart app" },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.steps).toHaveLength(2);
    }
  });

  it("rejeita sem device_hostname", () => {
    const result = createWorkflowSchema.safeParse({
      name: "Workflow",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem name", () => {
    const result = createWorkflowSchema.safeParse({
      device_hostname: "server-01",
    });
    expect(result.success).toBe(false);
  });

  it("valida device_id como UUID opcional", () => {
    const result = createWorkflowSchema.safeParse({
      device_hostname: "server-01",
      name: "Workflow",
      device_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita device_id nao-UUID", () => {
    const result = createWorkflowSchema.safeParse({
      device_hostname: "server-01",
      name: "Workflow",
      device_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});
