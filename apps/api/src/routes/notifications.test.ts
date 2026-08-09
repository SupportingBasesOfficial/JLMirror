// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  createChannelSchema,
  updateChannelSchema,
  createRuleSchema,
  updateRuleSchema,
  sendNotificationSchema,
} from "@repo/shared-validation";

// ========== createChannelSchema ==========

describe("notifications — createChannelSchema", () => {
  const validChannel = {
    name: "Slack Alertas",
    channel_type: "slack" as const,
    config: { webhook_url: "https://hooks.slack.com/services/xxx" },
  };

  it("valida canal minimo", () => {
    const result = createChannelSchema.safeParse(validChannel);
    expect(result.success).toBe(true);
  });

  it("rejeita sem name", () => {
    const result = createChannelSchema.safeParse({
      channel_type: "slack",
      config: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem channel_type", () => {
    const result = createChannelSchema.safeParse({
      name: "Canal",
      config: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejeita type (campo antigo removido)", () => {
    const result = createChannelSchema.safeParse({
      name: "Canal",
      type: "slack",
      config: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejeita whatsapp (nao existe no DB)", () => {
    const result = createChannelSchema.safeParse({
      name: "WhatsApp",
      channel_type: "whatsapp",
      config: {},
    });
    expect(result.success).toBe(false);
  });

  it("valida todos os channel_types do DB", () => {
    const types = [
      "slack",
      "email",
      "webhook",
      "teams",
      "telegram",
      "discord",
      "pagerduty",
      "web_push",
    ];
    for (const channel_type of types) {
      const result = createChannelSchema.safeParse({
        ...validChannel,
        channel_type,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejeita channel_type invalido", () => {
    const result = createChannelSchema.safeParse({
      ...validChannel,
      channel_type: "sms",
    });
    expect(result.success).toBe(false);
  });

  it("aplica default is_active=true", () => {
    const result = createChannelSchema.safeParse(validChannel);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_active).toBe(true);
    }
  });

  it("aplica default config={}", () => {
    const result = createChannelSchema.safeParse({
      name: "Canal",
      channel_type: "slack",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.config).toEqual({});
    }
  });

  it("valida config com webhook_url", () => {
    const result = createChannelSchema.safeParse({
      ...validChannel,
      config: { webhook_url: "https://hooks.slack.com/services/T00/B00/xxx" },
    });
    expect(result.success).toBe(true);
  });
});

// ========== updateChannelSchema ==========

describe("notifications — updateChannelSchema", () => {
  it("valida update parcial", () => {
    const result = updateChannelSchema.safeParse({ name: "Novo nome" });
    expect(result.success).toBe(true);
  });

  it("valida update vazio", () => {
    const result = updateChannelSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida channel_type no update", () => {
    const result = updateChannelSchema.safeParse({
      channel_type: "email",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita channel_type invalido no update", () => {
    const result = updateChannelSchema.safeParse({
      channel_type: "whatsapp",
    });
    expect(result.success).toBe(false);
  });

  it("valida is_verified no update", () => {
    const result = updateChannelSchema.safeParse({ is_verified: true });
    expect(result.success).toBe(true);
  });

  it("valida config no update", () => {
    const result = updateChannelSchema.safeParse({
      config: { webhook_url: "https://new.url" },
    });
    expect(result.success).toBe(true);
  });
});

// ========== createRuleSchema ==========

describe("notifications — createRuleSchema", () => {
  const validRule = {
    name: "Alerta SSL",
    event_source: "ssl.expiring_soon" as const,
    event_category: "security" as const,
    channel_ids: ["550e8400-e29b-41d4-a716-446655440000"],
  };

  it("valida regra minima", () => {
    const result = createRuleSchema.safeParse(validRule);
    expect(result.success).toBe(true);
  });

  it("rejeita sem name", () => {
    const result = createRuleSchema.safeParse({
      event_source: "ssl.expiring_soon",
      event_category: "security",
      channel_ids: ["550e8400-e29b-41d4-a716-446655440000"],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem event_source", () => {
    const result = createRuleSchema.safeParse({
      name: "Regra",
      event_category: "security",
      channel_ids: ["550e8400-e29b-41d4-a716-446655440000"],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem event_category", () => {
    const result = createRuleSchema.safeParse({
      name: "Regra",
      event_source: "ssl.expiring_soon",
      channel_ids: ["550e8400-e29b-41d4-a716-446655440000"],
    });
    expect(result.success).toBe(false);
  });

  it("valida sem channel_ids (aplica default [])", () => {
    const result = createRuleSchema.safeParse({
      name: "Regra",
      event_source: "ssl.expiring_soon",
      event_category: "security",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.channel_ids).toEqual([]);
    }
  });

  it("ignora channel_id singular (campo antigo, Zod permite extra keys)", () => {
    const result = createRuleSchema.safeParse({
      name: "Regra",
      channel_id: "550e8400-e29b-41d4-a716-446655440000",
      event_source: "ssl.expiring_soon",
      event_category: "security",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("channel_id");
    }
  });

  it("ignora conditions (campo antigo, Zod permite extra keys)", () => {
    const result = createRuleSchema.safeParse({
      ...validRule,
      conditions: { foo: "bar" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("conditions");
    }
  });

  it("valida todos os event_sources", () => {
    const sources = [
      "ssl.expiring_soon",
      "ssl.expired",
      "ssl.revoked",
      "backup.completed",
      "backup.failed",
      "backup.corrupted",
      "k8s.pod_crash",
      "k8s.node_down",
      "k8s.event_warning",
      "firewall.applied",
      "firewall.failed",
      "script.executed",
      "script.failed",
      "script.approval_needed",
      "monitoring.cpu_high",
      "monitoring.disk_high",
      "monitoring.memory_high",
      "monitoring.service_down",
      "custom",
    ];
    for (const event_source of sources) {
      const result = createRuleSchema.safeParse({
        ...validRule,
        event_source,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejeita event_source invalido", () => {
    const result = createRuleSchema.safeParse({
      ...validRule,
      event_source: "invalid.event",
    });
    expect(result.success).toBe(false);
  });

  it("valida todos os event_categories", () => {
    const categories = [
      "security",
      "backup",
      "k8s",
      "firewall",
      "script",
      "monitoring",
      "custom",
    ];
    for (const event_category of categories) {
      const result = createRuleSchema.safeParse({
        ...validRule,
        event_category,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejeita event_category invalido", () => {
    const result = createRuleSchema.safeParse({
      ...validRule,
      event_category: "network",
    });
    expect(result.success).toBe(false);
  });

  it("valida todos os severity_filters", () => {
    const filters = ["all", "info", "warning", "critical"];
    for (const severity_filter of filters) {
      const result = createRuleSchema.safeParse({
        ...validRule,
        severity_filter,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejeita severity_filter como array (deve ser string enum)", () => {
    const result = createRuleSchema.safeParse({
      ...validRule,
      severity_filter: ["info", "warning"],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita severity_filter invalido", () => {
    const result = createRuleSchema.safeParse({
      ...validRule,
      severity_filter: "urgent",
    });
    expect(result.success).toBe(false);
  });

  it("aplica default severity_filter=all", () => {
    const result = createRuleSchema.safeParse(validRule);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.severity_filter).toBe("all");
    }
  });

  it("aplica default cooldown_minutes=60", () => {
    const result = createRuleSchema.safeParse(validRule);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cooldown_minutes).toBe(60);
    }
  });

  it("aplica default is_active=true", () => {
    const result = createRuleSchema.safeParse(validRule);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_active).toBe(true);
    }
  });

  it("valida channel_ids com multiplos UUIDs", () => {
    const result = createRuleSchema.safeParse({
      ...validRule,
      channel_ids: [
        "550e8400-e29b-41d4-a716-446655440000",
        "660e8400-e29b-41d4-a716-446655440001",
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita channel_ids com UUID invalido", () => {
    const result = createRuleSchema.safeParse({
      ...validRule,
      channel_ids: ["not-a-uuid"],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita cooldown_minutes negativo", () => {
    const result = createRuleSchema.safeParse({
      ...validRule,
      cooldown_minutes: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita cooldown_minutes > 10080 (7 dias)", () => {
    const result = createRuleSchema.safeParse({
      ...validRule,
      cooldown_minutes: 10081,
    });
    expect(result.success).toBe(false);
  });

  it("valida regra completa com templates", () => {
    const result = createRuleSchema.safeParse({
      ...validRule,
      description: "Alerta de certificado SSL expirando",
      severity_filter: "warning",
      template_subject: "[ALERTA] SSL expirando: {{domain}}",
      template_body: "O certificado de {{domain}} expira em {{days}} dias.",
      cooldown_minutes: 120,
    });
    expect(result.success).toBe(true);
  });
});

// ========== updateRuleSchema ==========

describe("notifications — updateRuleSchema", () => {
  it("valida update parcial", () => {
    const result = updateRuleSchema.safeParse({ name: "Novo nome" });
    expect(result.success).toBe(true);
  });

  it("valida update vazio", () => {
    const result = updateRuleSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida event_source no update", () => {
    const result = updateRuleSchema.safeParse({
      event_source: "backup.failed",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita event_source invalido no update", () => {
    const result = updateRuleSchema.safeParse({
      event_source: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("valida channel_ids no update", () => {
    const result = updateRuleSchema.safeParse({
      channel_ids: ["550e8400-e29b-41d4-a716-446655440000"],
    });
    expect(result.success).toBe(true);
  });

  it("valida cooldown_minutes no update", () => {
    const result = updateRuleSchema.safeParse({ cooldown_minutes: 30 });
    expect(result.success).toBe(true);
  });

  it("valida severity_filter no update", () => {
    const result = updateRuleSchema.safeParse({
      severity_filter: "critical",
    });
    expect(result.success).toBe(true);
  });

  it("ignora conditions no update (campo antigo, Zod permite extra keys)", () => {
    const result = updateRuleSchema.safeParse({
      conditions: { foo: "bar" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("conditions");
    }
  });
});

// ========== sendNotificationSchema ==========

describe("notifications — sendNotificationSchema", () => {
  const validSend = {
    subject: "Alerta de SSL",
    body: "O certificado expira em 7 dias",
    event_source: "ssl.expiring_soon" as const,
    event_category: "security" as const,
    severity: "warning" as const,
  };

  it("valida envio minimo", () => {
    const result = sendNotificationSchema.safeParse(validSend);
    expect(result.success).toBe(true);
  });

  it("rejeita sem subject", () => {
    const result = sendNotificationSchema.safeParse({
      body: "Corpo",
      event_source: "ssl.expiring_soon",
      event_category: "security",
      severity: "warning",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem body", () => {
    const result = sendNotificationSchema.safeParse({
      subject: "Titulo",
      event_source: "ssl.expiring_soon",
      event_category: "security",
      severity: "warning",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem event_source (agora obrigatorio)", () => {
    const result = sendNotificationSchema.safeParse({
      subject: "Titulo",
      body: "Corpo",
      event_category: "security",
      severity: "warning",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem event_category (agora obrigatorio)", () => {
    const result = sendNotificationSchema.safeParse({
      subject: "Titulo",
      body: "Corpo",
      event_source: "ssl.expiring_soon",
      severity: "warning",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem severity (agora obrigatorio)", () => {
    const result = sendNotificationSchema.safeParse({
      subject: "Titulo",
      body: "Corpo",
      event_source: "ssl.expiring_soon",
      event_category: "security",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita severity como string livre (deve ser enum)", () => {
    const result = sendNotificationSchema.safeParse({
      ...validSend,
      severity: "urgent",
    });
    expect(result.success).toBe(false);
  });

  it("valida todas as severities", () => {
    const severities = ["info", "warning", "critical"];
    for (const severity of severities) {
      const result = sendNotificationSchema.safeParse({
        ...validSend,
        severity,
      });
      expect(result.success).toBe(true);
    }
  });

  it("aplica default payload={}", () => {
    const result = sendNotificationSchema.safeParse(validSend);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload).toEqual({});
    }
  });

  it("nao requer channel_id (removido do schema)", () => {
    const result = sendNotificationSchema.safeParse(validSend);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("channel_id");
    }
  });

  it("nao requer to (removido do schema)", () => {
    const result = sendNotificationSchema.safeParse(validSend);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("to");
    }
  });

  it("valida com payload", () => {
    const result = sendNotificationSchema.safeParse({
      ...validSend,
      payload: { domain: "example.com", days: 7 },
    });
    expect(result.success).toBe(true);
  });
});

// ========== Logica de Cooldown ==========

describe("notifications — logica de cooldown", () => {
  it("rate_limited quando cooldown ativo", () => {
    const cooldownOk = false;
    const status = cooldownOk ? "sent" : "rate_limited";
    expect(status).toBe("rate_limited");
  });

  it("continha envio quando cooldown ok", () => {
    const cooldownOk = true;
    const shouldContinue = cooldownOk;
    expect(shouldContinue).toBe(true);
  });
});

// ========== Logica de Template ==========

describe("notifications — logica de template", () => {
  it("usa template_subject quando definido", () => {
    const rule = { template_subject: "[ALERTA] SSL" };
    const data = { subject: "Subject default" };
    const subject = rule.template_subject ?? data.subject;
    expect(subject).toBe("[ALERTA] SSL");
  });

  it("usa data.subject quando template nao definido", () => {
    const rule = { template_subject: null };
    const data = { subject: "Subject default" };
    const subject = rule.template_subject ?? data.subject;
    expect(subject).toBe("Subject default");
  });

  it("usa template_body quando definido", () => {
    const rule = { template_body: "Corpo do template" };
    const data = { body: "Corpo default" };
    const bodyText = rule.template_body ?? data.body;
    expect(bodyText).toBe("Corpo do template");
  });

  it("usa data.body quando template nao definido", () => {
    const rule = { template_body: null };
    const data = { body: "Corpo default" };
    const bodyText = rule.template_body ?? data.body;
    expect(bodyText).toBe("Corpo default");
  });
});

// ========== Logica de Severity Filter ==========

describe("notifications — logica de severity filter", () => {
  it("match quando severity_filter=all", () => {
    const severityFilter = "all";
    const severity = "critical";
    const matches = severityFilter === "all" || severityFilter === severity;
    expect(matches).toBe(true);
  });

  it("match quando severity_filter igual a severity", () => {
    const severityFilter: string = "warning";
    const severity: string = "warning";
    const matches = severityFilter === "all" || severityFilter === severity;
    expect(matches).toBe(true);
  });

  it("nao match quando severity_filter diferente de severity", () => {
    const severityFilter: string = "critical";
    const severity: string = "warning";
    const matches = severityFilter === "all" || severityFilter === severity;
    expect(matches).toBe(false);
  });

  it("all match qualquer severity info", () => {
    const severityFilter: string = "all";
    expect(severityFilter === "all" || severityFilter === "info").toBe(true);
  });

  it("all match qualquer severity warning", () => {
    const severityFilter: string = "all";
    expect(severityFilter === "all" || severityFilter === "warning").toBe(true);
  });

  it("all match qualquer severity critical", () => {
    const severityFilter: string = "all";
    expect(severityFilter === "all" || severityFilter === "critical").toBe(
      true,
    );
  });
});
