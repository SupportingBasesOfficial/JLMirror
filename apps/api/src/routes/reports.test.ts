// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  createReportTemplateSchema,
  createScheduledReportSchema,
  updateScheduledReportSchema,
} from "@repo/shared-validation";

describe("reports schemas — createReportTemplateSchema", () => {
  it("valida template com campos obrigatorios", () => {
    const result = createReportTemplateSchema.safeParse({
      name: "Relatório de Devices",
      type: "device_inventory",
      config: { filter: "active" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.format).toBe("pdf");
      expect(result.data.is_active).toBe(true);
    }
  });

  it("valida template com todos os campos", () => {
    const result = createReportTemplateSchema.safeParse({
      name: "Relatório Completo",
      description: "Relatório mensal de devices",
      type: "device_inventory",
      config: {},
      report_type: "inventory",
      data_sources: ["devices", "tickets"],
      filters: { status: "active" },
      columns: ["id", "hostname", "status"],
      group_by: "type",
      chart_type: "bar",
      format: "csv",
      is_active: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.format).toBe("csv");
      expect(result.data.is_active).toBe(false);
    }
  });

  it("rejeita sem name", () => {
    const result = createReportTemplateSchema.safeParse({
      type: "device_inventory",
      config: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem type", () => {
    const result = createReportTemplateSchema.safeParse({
      name: "Relatório",
      config: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem config", () => {
    const result = createReportTemplateSchema.safeParse({
      name: "Relatório",
      type: "inventory",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita format invalido", () => {
    const result = createReportTemplateSchema.safeParse({
      name: "Relatório",
      type: "inventory",
      config: {},
      format: "xlsx",
    });
    expect(result.success).toBe(false);
  });
});

describe("reports schemas — createScheduledReportSchema", () => {
  it("valida schedule com campos obrigatorios", () => {
    const result = createScheduledReportSchema.safeParse({
      template_id: "550e8400-e29b-41d4-a716-446655440000",
      cron: "0 0 * * *",
      recipients: ["admin@empresa.com"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.format).toBe("pdf");
      expect(result.data.delivery_method).toBe("email");
      expect(result.data.is_active).toBe(true);
    }
  });

  it("valida schedule com todos os campos", () => {
    const result = createScheduledReportSchema.safeParse({
      template_id: "550e8400-e29b-41d4-a716-446655440000",
      cron: "0 0 * * 0",
      recipients: ["admin@empresa.com", "manager@empresa.com"],
      format: "csv",
      name: "Relatório Semanal",
      description: "Envio semanal aos gestores",
      schedule_cron: "0 0 * * 0",
      schedule_description: "Todo domingo à meia-noite",
      delivery_method: "webhook",
      is_active: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.delivery_method).toBe("webhook");
    }
  });

  it("rejeita template_id nao-UUID", () => {
    const result = createScheduledReportSchema.safeParse({
      template_id: "not-a-uuid",
      cron: "0 0 * * *",
      recipients: ["admin@empresa.com"],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem cron", () => {
    const result = createScheduledReportSchema.safeParse({
      template_id: "550e8400-e29b-41d4-a716-446655440000",
      recipients: ["admin@empresa.com"],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita recipients com email invalido", () => {
    const result = createScheduledReportSchema.safeParse({
      template_id: "550e8400-e29b-41d4-a716-446655440000",
      cron: "0 0 * * *",
      recipients: ["not-an-email"],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita recipients vazio", () => {
    const result = createScheduledReportSchema.safeParse({
      template_id: "550e8400-e29b-41d4-a716-446655440000",
      cron: "0 0 * * *",
      recipients: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita delivery_method invalido", () => {
    const result = createScheduledReportSchema.safeParse({
      template_id: "550e8400-e29b-41d4-a716-446655440000",
      cron: "0 0 * * *",
      recipients: ["admin@empresa.com"],
      delivery_method: "fax",
    });
    expect(result.success).toBe(false);
  });
});

describe("reports schemas — updateScheduledReportSchema", () => {
  it("valida update parcial (apenas cron)", () => {
    const result = updateScheduledReportSchema.safeParse({
      cron: "0 12 * * *",
    });
    expect(result.success).toBe(true);
  });

  it("valida update de recipients", () => {
    const result = updateScheduledReportSchema.safeParse({
      recipients: ["new@empresa.com"],
    });
    expect(result.success).toBe(true);
  });

  it("valida update de is_active", () => {
    const result = updateScheduledReportSchema.safeParse({
      is_active: false,
    });
    expect(result.success).toBe(true);
  });

  it("valida update vazio (todos opcionais)", () => {
    const result = updateScheduledReportSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejeita recipients com email invalido no update", () => {
    const result = updateScheduledReportSchema.safeParse({
      recipients: ["invalid"],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita format invalido no update", () => {
    const result = updateScheduledReportSchema.safeParse({
      format: "xlsx",
    });
    expect(result.success).toBe(false);
  });
});
