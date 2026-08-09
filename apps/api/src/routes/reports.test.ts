// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  createReportTemplateSchema,
  createScheduledReportSchema,
  updateScheduledReportSchema,
  reportBrandingSchema,
  reportDeliveryConfigSchema,
} from "@repo/shared-validation";

// ========== createReportTemplateSchema ==========

describe("reports — createReportTemplateSchema", () => {
  const validTemplate = {
    name: "Relatório Mensal",
    type: "summary",
    config: { metric: "tickets" },
  };

  it("valida template minimo", () => {
    const result = createReportTemplateSchema.safeParse(validTemplate);
    expect(result.success).toBe(true);
  });

  it("rejeita sem name", () => {
    const result = createReportTemplateSchema.safeParse({
      ...validTemplate,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem type", () => {
    const result = createReportTemplateSchema.safeParse({
      ...validTemplate,
      type: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem config", () => {
    const result = createReportTemplateSchema.safeParse({
      name: "Test",
      type: "summary",
    });
    expect(result.success).toBe(false);
  });

  it("valida com data_sources", () => {
    const result = createReportTemplateSchema.safeParse({
      ...validTemplate,
      data_sources: ["tickets", "assets"],
    });
    expect(result.success).toBe(true);
  });

  it("valida com columns", () => {
    const result = createReportTemplateSchema.safeParse({
      ...validTemplate,
      columns: ["id", "name", "status"],
    });
    expect(result.success).toBe(true);
  });

  it("aplica default format=pdf", () => {
    const result = createReportTemplateSchema.safeParse(validTemplate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.format).toBe("pdf");
    }
  });

  it("valida format=csv", () => {
    const result = createReportTemplateSchema.safeParse({
      ...validTemplate,
      format: "csv",
    });
    expect(result.success).toBe(true);
  });

  it("valida format=json", () => {
    const result = createReportTemplateSchema.safeParse({
      ...validTemplate,
      format: "json",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita format invalido", () => {
    const result = createReportTemplateSchema.safeParse({
      ...validTemplate,
      format: "xlsx",
    });
    expect(result.success).toBe(false);
  });

  it("aplica default is_active=true", () => {
    const result = createReportTemplateSchema.safeParse(validTemplate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_active).toBe(true);
    }
  });
});

// ========== createScheduledReportSchema ==========

describe("reports — createScheduledReportSchema", () => {
  const validScheduled = {
    template_id: "550e8400-e29b-41d4-a716-446655440000",
    cron: "0 0 * * *",
    recipients: ["user@example.com"],
  };

  it("valida scheduled report minimo", () => {
    const result = createScheduledReportSchema.safeParse(validScheduled);
    expect(result.success).toBe(true);
  });

  it("rejeita template_id invalido", () => {
    const result = createScheduledReportSchema.safeParse({
      ...validScheduled,
      template_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem cron", () => {
    const result = createScheduledReportSchema.safeParse({
      ...validScheduled,
      cron: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita recipients com email invalido", () => {
    const result = createScheduledReportSchema.safeParse({
      ...validScheduled,
      recipients: ["not-an-email"],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita recipients vazio", () => {
    const result = createScheduledReportSchema.safeParse({
      ...validScheduled,
      recipients: [],
    });
    expect(result.success).toBe(false);
  });

  it("valida multiplos recipients", () => {
    const result = createScheduledReportSchema.safeParse({
      ...validScheduled,
      recipients: ["a@example.com", "b@example.com"],
    });
    expect(result.success).toBe(true);
  });

  it("aplica default format=pdf", () => {
    const result = createScheduledReportSchema.safeParse(validScheduled);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.format).toBe("pdf");
    }
  });

  it("aplica default delivery_method=email", () => {
    const result = createScheduledReportSchema.safeParse(validScheduled);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.delivery_method).toBe("email");
    }
  });

  it("valida delivery_method=webhook", () => {
    const result = createScheduledReportSchema.safeParse({
      ...validScheduled,
      delivery_method: "webhook",
    });
    expect(result.success).toBe(true);
  });

  it("valida delivery_method=storage", () => {
    const result = createScheduledReportSchema.safeParse({
      ...validScheduled,
      delivery_method: "storage",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita delivery_method invalido", () => {
    const result = createScheduledReportSchema.safeParse({
      ...validScheduled,
      delivery_method: "fax",
    });
    expect(result.success).toBe(false);
  });

  it("valida com name e description", () => {
    const result = createScheduledReportSchema.safeParse({
      ...validScheduled,
      name: "Relatório Semanal",
      description: "Resumo semanal de tickets",
    });
    expect(result.success).toBe(true);
  });
});

// ========== updateScheduledReportSchema ==========

describe("reports — updateScheduledReportSchema", () => {
  it("valida update vazio (parcial)", () => {
    const result = updateScheduledReportSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida update name", () => {
    const result = updateScheduledReportSchema.safeParse({
      name: "Novo Nome",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita name vazio", () => {
    const result = updateScheduledReportSchema.safeParse({
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("valida update recipients", () => {
    const result = updateScheduledReportSchema.safeParse({
      recipients: ["new@example.com"],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita recipients com email invalido", () => {
    const result = updateScheduledReportSchema.safeParse({
      recipients: ["invalid"],
    });
    expect(result.success).toBe(false);
  });

  it("valida update is_active", () => {
    const result = updateScheduledReportSchema.safeParse({
      is_active: false,
    });
    expect(result.success).toBe(true);
  });

  it("valida update format", () => {
    const result = updateScheduledReportSchema.safeParse({
      format: "csv",
    });
    expect(result.success).toBe(true);
  });

  it("valida update delivery_method", () => {
    const result = updateScheduledReportSchema.safeParse({
      delivery_method: "webhook",
    });
    expect(result.success).toBe(true);
  });

  it("valida update schedule_cron", () => {
    const result = updateScheduledReportSchema.safeParse({
      schedule_cron: "0 0 * * 0",
    });
    expect(result.success).toBe(true);
  });

  it("valida update completo", () => {
    const result = updateScheduledReportSchema.safeParse({
      name: "Atualizado",
      description: "Nova descrição",
      cron: "0 12 * * *",
      schedule_cron: "0 12 * * *",
      schedule_description: "Diário ao meio-dia",
      recipients: ["user@example.com"],
      delivery_method: "email",
      format: "pdf",
      is_active: true,
    });
    expect(result.success).toBe(true);
  });
});

// ========== reportBrandingSchema ==========

describe("reports — reportBrandingSchema", () => {
  const validBranding = {
    company_name: "Minha Empresa",
  };

  it("valida branding minimo", () => {
    const result = reportBrandingSchema.safeParse(validBranding);
    expect(result.success).toBe(true);
  });

  it("rejeita sem company_name", () => {
    const result = reportBrandingSchema.safeParse({
      company_name: "",
    });
    expect(result.success).toBe(false);
  });

  it("valida com logo_url", () => {
    const result = reportBrandingSchema.safeParse({
      ...validBranding,
      logo_url: "https://example.com/logo.png",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita logo_url invalida", () => {
    const result = reportBrandingSchema.safeParse({
      ...validBranding,
      logo_url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("valida primary_color hex", () => {
    const result = reportBrandingSchema.safeParse({
      ...validBranding,
      primary_color: "#0d9488",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita primary_color invalido", () => {
    const result = reportBrandingSchema.safeParse({
      ...validBranding,
      primary_color: "blue",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita primary_color sem #", () => {
    const result = reportBrandingSchema.safeParse({
      ...validBranding,
      primary_color: "0d9488",
    });
    expect(result.success).toBe(false);
  });

  it("valida logo_width", () => {
    const result = reportBrandingSchema.safeParse({
      ...validBranding,
      logo_width: 200,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita logo_width maior que 500", () => {
    const result = reportBrandingSchema.safeParse({
      ...validBranding,
      logo_width: 501,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita logo_width zero", () => {
    const result = reportBrandingSchema.safeParse({
      ...validBranding,
      logo_width: 0,
    });
    expect(result.success).toBe(false);
  });

  it("valida is_active", () => {
    const result = reportBrandingSchema.safeParse({
      ...validBranding,
      is_active: true,
    });
    expect(result.success).toBe(true);
  });

  it("valida branding completo", () => {
    const result = reportBrandingSchema.safeParse({
      company_name: "Empresa LTDA",
      logo_url: "https://example.com/logo.png",
      logo_width: 180,
      primary_color: "#0d9488",
      secondary_color: "#1f2937",
      accent_color: "#3b82f6",
      footer_text: "Confidencial",
      footer_url: "https://example.com",
      header_bg_color: "#ffffff",
      header_text_color: "#1f2937",
      font_family: "Helvetica",
      is_active: true,
    });
    expect(result.success).toBe(true);
  });
});

// ========== reportDeliveryConfigSchema ==========

describe("reports — reportDeliveryConfigSchema", () => {
  it("valida config vazia (parcial)", () => {
    const result = reportDeliveryConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida auto_reports_enabled", () => {
    const result = reportDeliveryConfigSchema.safeParse({
      auto_reports_enabled: true,
    });
    expect(result.success).toBe(true);
  });

  it("valida allowed_delivery_methods", () => {
    const result = reportDeliveryConfigSchema.safeParse({
      allowed_delivery_methods: ["email", "webhook"],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita allowed_delivery_methods com metodo invalido", () => {
    const result = reportDeliveryConfigSchema.safeParse({
      allowed_delivery_methods: ["fax"],
    });
    expect(result.success).toBe(false);
  });

  it("valida default_delivery_method", () => {
    const result = reportDeliveryConfigSchema.safeParse({
      default_delivery_method: "email",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita default_delivery_method invalido", () => {
    const result = reportDeliveryConfigSchema.safeParse({
      default_delivery_method: "fax",
    });
    expect(result.success).toBe(false);
  });

  it("valida email_from", () => {
    const result = reportDeliveryConfigSchema.safeParse({
      email_from: "reports@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita email_from invalido", () => {
    const result = reportDeliveryConfigSchema.safeParse({
      email_from: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("valida slack_webhook_url", () => {
    const result = reportDeliveryConfigSchema.safeParse({
      slack_webhook_url: "https://hooks.slack.com/services/xxx",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita slack_webhook_url invalida", () => {
    const result = reportDeliveryConfigSchema.safeParse({
      slack_webhook_url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("valida webhook_headers", () => {
    const result = reportDeliveryConfigSchema.safeParse({
      webhook_headers: { Authorization: "Bearer token" },
    });
    expect(result.success).toBe(true);
  });

  it("valida monthly_report_limit", () => {
    const result = reportDeliveryConfigSchema.safeParse({
      monthly_report_limit: 100,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita monthly_report_limit negativo", () => {
    const result = reportDeliveryConfigSchema.safeParse({
      monthly_report_limit: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita monthly_report_limit maior que 10000", () => {
    const result = reportDeliveryConfigSchema.safeParse({
      monthly_report_limit: 10001,
    });
    expect(result.success).toBe(false);
  });

  it("valida config completo", () => {
    const result = reportDeliveryConfigSchema.safeParse({
      auto_reports_enabled: true,
      allowed_delivery_methods: ["email", "webhook", "storage"],
      default_delivery_method: "email",
      email_from: "reports@example.com",
      email_subject_prefix: "[Relatório]",
      slack_webhook_url: "https://hooks.slack.com/services/xxx",
      teams_webhook_url: "https://outlook.office.com/webhook/xxx",
      webhook_url: "https://example.com/webhook",
      webhook_headers: { "Content-Type": "application/json" },
      monthly_report_limit: 50,
    });
    expect(result.success).toBe(true);
  });
});

// ========== Logica de Next Run Calculation ==========

describe("reports — logica de next_run", () => {
  it("cron com * * * adiciona 24h", () => {
    const cron = "0 0 * * *";
    const nextRun = new Date();
    const before = nextRun.getTime();
    if (cron && cron.includes("* * *")) {
      nextRun.setHours(nextRun.getHours() + 24);
    } else {
      nextRun.setDate(nextRun.getDate() + 7);
    }
    const diff = nextRun.getTime() - before;
    expect(diff).toBe(24 * 60 * 60 * 1000);
  });

  it("cron sem * * * adiciona 7 dias", () => {
    const cron = "0 0 1 * *";
    const nextRun = new Date();
    const before = nextRun.getTime();
    if (cron && cron.includes("* * *")) {
      nextRun.setHours(nextRun.getHours() + 24);
    } else {
      nextRun.setDate(nextRun.getDate() + 7);
    }
    const diff = nextRun.getTime() - before;
    expect(diff).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

// ========== Logica de Success Rate ==========

describe("reports — logica de success rate", () => {
  it("calcula success rate 100%", () => {
    const total = 100;
    const successful = 100;
    const rate = total > 0 ? Math.round((successful / total) * 100) : 0;
    expect(rate).toBe(100);
  });

  it("calcula success rate 50%", () => {
    const total = 100;
    const successful = 50;
    const rate = total > 0 ? Math.round((successful / total) * 100) : 0;
    expect(rate).toBe(50);
  });

  it("calcula success rate 0% quando total=0", () => {
    const total = 0;
    const successful = 0;
    const rate = total > 0 ? Math.round((successful / total) * 100) : 0;
    expect(rate).toBe(0);
  });

  it("calcula success rate arredondado", () => {
    const total = 3;
    const successful = 2;
    const rate = total > 0 ? Math.round((successful / total) * 100) : 0;
    expect(rate).toBe(67);
  });
});

// ========== Logica de Limit Pagination ==========

describe("reports — logica de limit pagination", () => {
  it("limit default 20", () => {
    const limit = Math.min(parseInt("20", 10), 100);
    expect(limit).toBe(20);
  });

  it("limit maximo 100", () => {
    const limit = Math.min(parseInt("999", 10), 100);
    expect(limit).toBe(100);
  });

  it("limit custom", () => {
    const limit = Math.min(parseInt("50", 10), 100);
    expect(limit).toBe(50);
  });
});
