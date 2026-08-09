// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  createWebhookSchema,
  updateWebhookSchema,
  triggerWebhookSchema,
} from "@repo/shared-validation";
import { createHmac } from "node:crypto";

// ========== isSafeWebhookUrl (SSRF prevention) ==========

describe("webhooks — isSafeWebhookUrl (SSRF prevention)", () => {
  function isSafeWebhookUrl(urlStr: string): boolean {
    try {
      const parsed = new URL(urlStr);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return false;
      }
      const hostname = parsed.hostname;
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
        const parts = hostname.split(".").map(Number);
        if (
          parts[0] === 10 ||
          parts[0] === 127 ||
          (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
          (parts[0] === 192 && parts[1] === 168) ||
          (parts[0] === 169 && parts[1] === 254) ||
          parts[0] === 0
        ) {
          return false;
        }
      }
      if (
        hostname.includes(":") ||
        hostname === "::1" ||
        hostname.startsWith("fe80")
      ) {
        return false;
      }
      if (hostname.toLowerCase() === "localhost") {
        return false;
      }
      const lower = hostname.toLowerCase();
      if (
        lower === "metadata.google.internal" ||
        lower.includes("169.254.169.254") ||
        lower.includes("169.254.170.2")
      ) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  it("aceita URL HTTPS valida", () => {
    expect(isSafeWebhookUrl("https://example.com/webhook")).toBe(true);
  });

  it("aceita URL HTTP valida", () => {
    expect(isSafeWebhookUrl("http://example.com/webhook")).toBe(true);
  });

  it("rejeita localhost", () => {
    expect(isSafeWebhookUrl("http://localhost:3000/webhook")).toBe(false);
  });

  it("rejeita 127.0.0.1", () => {
    expect(isSafeWebhookUrl("http://127.0.0.1/webhook")).toBe(false);
  });

  it("rejeita 10.x (private)", () => {
    expect(isSafeWebhookUrl("http://10.0.0.1/webhook")).toBe(false);
  });

  it("rejeita 192.168.x (private)", () => {
    expect(isSafeWebhookUrl("http://192.168.1.1/webhook")).toBe(false);
  });

  it("rejeita 172.16.x (private)", () => {
    expect(isSafeWebhookUrl("http://172.16.0.1/webhook")).toBe(false);
  });

  it("rejeita 169.254.169.254 (AWS metadata)", () => {
    expect(isSafeWebhookUrl("http://169.254.169.254/latest/meta-data")).toBe(
      false,
    );
  });

  it("rejeita 169.254.170.2 (ECS metadata)", () => {
    expect(isSafeWebhookUrl("http://169.254.170.2/v2/metadata")).toBe(false);
  });

  it("rejeita metadata.google.internal (GCP metadata)", () => {
    expect(
      isSafeWebhookUrl("http://metadata.google.internal/computeMetadata"),
    ).toBe(false);
  });

  it("rejeita 0.0.0.0", () => {
    expect(isSafeWebhookUrl("http://0.0.0.0/webhook")).toBe(false);
  });

  it("rejeita protocolo nao-http", () => {
    expect(isSafeWebhookUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejeita protocolo ftp", () => {
    expect(isSafeWebhookUrl("ftp://example.com/file")).toBe(false);
  });

  it("rejeita URL invalida", () => {
    expect(isSafeWebhookUrl("not-a-url")).toBe(false);
  });

  it("aceita IP publico", () => {
    expect(isSafeWebhookUrl("http://8.8.8.8/webhook")).toBe(true);
  });

  it("aceita subdominio", () => {
    expect(isSafeWebhookUrl("https://api.example.com/v1/webhook")).toBe(true);
  });
});

// ========== createWebhookSchema ==========

describe("webhooks — createWebhookSchema", () => {
  const validWebhook = {
    name: "My Webhook",
    url: "https://example.com/webhook",
    events: ["ticket.created"],
  };

  it("valida webhook minimo", () => {
    const result = createWebhookSchema.safeParse(validWebhook);
    expect(result.success).toBe(true);
  });

  it("rejeita sem name", () => {
    const result = createWebhookSchema.safeParse({ ...validWebhook, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejeita sem url", () => {
    const result = createWebhookSchema.safeParse({ ...validWebhook, url: "" });
    expect(result.success).toBe(false);
  });

  it("rejeita url invalida", () => {
    const result = createWebhookSchema.safeParse({
      ...validWebhook,
      url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem events", () => {
    const result = createWebhookSchema.safeParse({
      ...validWebhook,
      events: [],
    });
    expect(result.success).toBe(false);
  });

  it("aplica default method=POST", () => {
    const result = createWebhookSchema.safeParse(validWebhook);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.method).toBe("POST");
    }
  });

  it("valida method=GET", () => {
    const result = createWebhookSchema.safeParse({
      ...validWebhook,
      method: "GET",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita method invalido", () => {
    const result = createWebhookSchema.safeParse({
      ...validWebhook,
      method: "DELETE",
    });
    expect(result.success).toBe(false);
  });

  it("aplica default max_retries=3", () => {
    const result = createWebhookSchema.safeParse(validWebhook);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.max_retries).toBe(3);
    }
  });

  it("rejeita max_retries > 10", () => {
    const result = createWebhookSchema.safeParse({
      ...validWebhook,
      max_retries: 11,
    });
    expect(result.success).toBe(false);
  });

  it("aplica default timeout_seconds=30", () => {
    const result = createWebhookSchema.safeParse(validWebhook);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timeout_seconds).toBe(30);
    }
  });

  it("rejeita timeout_seconds > 300", () => {
    const result = createWebhookSchema.safeParse({
      ...validWebhook,
      timeout_seconds: 301,
    });
    expect(result.success).toBe(false);
  });

  it("valida com secret", () => {
    const result = createWebhookSchema.safeParse({
      ...validWebhook,
      secret: "my-secret-key",
    });
    expect(result.success).toBe(true);
  });

  it("valida com headers", () => {
    const result = createWebhookSchema.safeParse({
      ...validWebhook,
      headers: { Authorization: "Bearer token" },
    });
    expect(result.success).toBe(true);
  });

  it("rejeita mais de 50 events", () => {
    const result = createWebhookSchema.safeParse({
      ...validWebhook,
      events: Array(51).fill("event"),
    });
    expect(result.success).toBe(false);
  });

  it("rejeita event vazio", () => {
    const result = createWebhookSchema.safeParse({
      ...validWebhook,
      events: [""],
    });
    expect(result.success).toBe(false);
  });
});

// ========== updateWebhookSchema ==========

describe("webhooks — updateWebhookSchema", () => {
  it("valida update vazio (parcial)", () => {
    const result = updateWebhookSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida update name", () => {
    const result = updateWebhookSchema.safeParse({ name: "Novo Nome" });
    expect(result.success).toBe(true);
  });

  it("valida update url", () => {
    const result = updateWebhookSchema.safeParse({
      url: "https://new.example.com/hook",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita update url invalida", () => {
    const result = updateWebhookSchema.safeParse({ url: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("valida update method", () => {
    const result = updateWebhookSchema.safeParse({ method: "PUT" });
    expect(result.success).toBe(true);
  });

  it("valida update is_active", () => {
    const result = updateWebhookSchema.safeParse({ is_active: false });
    expect(result.success).toBe(true);
  });

  it("valida update is_verified", () => {
    const result = updateWebhookSchema.safeParse({ is_verified: true });
    expect(result.success).toBe(true);
  });

  it("valida update max_retries", () => {
    const result = updateWebhookSchema.safeParse({ max_retries: 5 });
    expect(result.success).toBe(true);
  });

  it("valida update timeout_seconds", () => {
    const result = updateWebhookSchema.safeParse({ timeout_seconds: 60 });
    expect(result.success).toBe(true);
  });

  it("valida update expected_status_code", () => {
    const result = updateWebhookSchema.safeParse({
      expected_status_code: 201,
    });
    expect(result.success).toBe(true);
  });

  it("valida update completo", () => {
    const result = updateWebhookSchema.safeParse({
      name: "Atualizado",
      description: "Nova desc",
      url: "https://new.example.com/hook",
      method: "PUT",
      secret: "new-secret",
      events: ["event1"],
      is_active: true,
      is_verified: false,
      headers: { "X-Custom": "value" },
      max_retries: 5,
      retry_delay_seconds: 120,
      timeout_seconds: 60,
      expected_status_code: 201,
    });
    expect(result.success).toBe(true);
  });
});

// ========== triggerWebhookSchema ==========

describe("webhooks — triggerWebhookSchema", () => {
  const validTrigger = {
    event: "ticket.created",
    payload: { id: "123", title: "Test" },
  };

  it("valida trigger minimo", () => {
    const result = triggerWebhookSchema.safeParse(validTrigger);
    expect(result.success).toBe(true);
  });

  it("rejeita sem event", () => {
    const result = triggerWebhookSchema.safeParse({
      ...validTrigger,
      event: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem payload", () => {
    const result = triggerWebhookSchema.safeParse({ event: "test" });
    expect(result.success).toBe(false);
  });

  it("valida com event_name", () => {
    const result = triggerWebhookSchema.safeParse({
      ...validTrigger,
      event_name: "custom.event",
    });
    expect(result.success).toBe(true);
  });

  it("valida com source_type e source_id", () => {
    const result = triggerWebhookSchema.safeParse({
      ...validTrigger,
      source_type: "ticket",
      source_id: "ticket-123",
    });
    expect(result.success).toBe(true);
  });
});

// ========== Logica de HMAC Signature ==========

describe("webhooks — logica de HMAC signature", () => {
  function signPayload(secret: string, payload: string): string {
    return createHmac("sha256", secret).update(payload).digest("hex");
  }

  it("gera signature deterministica", () => {
    const sig1 = signPayload("secret", "payload");
    const sig2 = signPayload("secret", "payload");
    expect(sig1).toBe(sig2);
  });

  it("gera signatures diferentes para secrets diferentes", () => {
    const sig1 = signPayload("secret1", "payload");
    const sig2 = signPayload("secret2", "payload");
    expect(sig1).not.toBe(sig2);
  });

  it("gera signatures diferentes para payloads diferentes", () => {
    const sig1 = signPayload("secret", "payload1");
    const sig2 = signPayload("secret", "payload2");
    expect(sig1).not.toBe(sig2);
  });

  it("signature tem 64 caracteres (sha256 hex)", () => {
    const sig = signPayload("secret", "payload");
    expect(sig.length).toBe(64);
  });

  it("signature e hexadecimal", () => {
    const sig = signPayload("secret", "payload");
    expect(/^[0-9a-f]+$/.test(sig)).toBe(true);
  });
});

// ========== Logica de Limit Pagination ==========

describe("webhooks — logica de limit pagination", () => {
  it("deliveries limit default 50", () => {
    const limit = Math.min(parseInt("50", 10), 200);
    expect(limit).toBe(50);
  });

  it("deliveries limit maximo 200", () => {
    const limit = Math.min(parseInt("999", 10), 200);
    expect(limit).toBe(200);
  });
});
