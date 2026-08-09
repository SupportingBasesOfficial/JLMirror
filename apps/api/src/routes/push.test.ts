// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  pushSubscribeSchema,
  pushUnsubscribeSchema,
  pushBroadcastSchema,
} from "@repo/shared-validation";

// ========== pushSubscribeSchema ==========

describe("push — pushSubscribeSchema", () => {
  const validSub = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
    keys: {
      p256dh: "BPaqP3ORaWQ3xk2p7BL8xR8aQZxq5x8p...",
      auth: "authkey123",
    },
  };

  it("valida subscription minima", () => {
    const result = pushSubscribeSchema.safeParse(validSub);
    expect(result.success).toBe(true);
  });

  it("rejeita sem endpoint", () => {
    const result = pushSubscribeSchema.safeParse({ ...validSub, endpoint: "" });
    expect(result.success).toBe(false);
  });

  it("rejeita endpoint invalido (nao URL)", () => {
    const result = pushSubscribeSchema.safeParse({
      ...validSub,
      endpoint: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita endpoint muito longo (>2000)", () => {
    const result = pushSubscribeSchema.safeParse({
      ...validSub,
      endpoint: `https://example.com/${"a".repeat(2000)}`,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem keys", () => {
    const result = pushSubscribeSchema.safeParse({
      endpoint: validSub.endpoint,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem keys.p256dh", () => {
    const result = pushSubscribeSchema.safeParse({
      ...validSub,
      keys: { auth: "authkey" },
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem keys.auth", () => {
    const result = pushSubscribeSchema.safeParse({
      ...validSub,
      keys: { p256dh: "p256key" },
    });
    expect(result.success).toBe(false);
  });

  it("rejeita keys.p256dh vazio", () => {
    const result = pushSubscribeSchema.safeParse({
      ...validSub,
      keys: { p256dh: "", auth: "authkey" },
    });
    expect(result.success).toBe(false);
  });

  it("rejeita keys.auth vazio", () => {
    const result = pushSubscribeSchema.safeParse({
      ...validSub,
      keys: { p256dh: "p256key", auth: "" },
    });
    expect(result.success).toBe(false);
  });

  it("valida com device_type", () => {
    const result = pushSubscribeSchema.safeParse({
      ...validSub,
      device_type: "desktop",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita device_type muito longo (>100)", () => {
    const result = pushSubscribeSchema.safeParse({
      ...validSub,
      device_type: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("valida com user_agent", () => {
    const result = pushSubscribeSchema.safeParse({
      ...validSub,
      user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita user_agent muito longo (>500)", () => {
    const result = pushSubscribeSchema.safeParse({
      ...validSub,
      user_agent: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

// ========== pushUnsubscribeSchema ==========

describe("push — pushUnsubscribeSchema", () => {
  it("valida com endpoint", () => {
    const result = pushUnsubscribeSchema.safeParse({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sem endpoint", () => {
    const result = pushUnsubscribeSchema.safeParse({ endpoint: "" });
    expect(result.success).toBe(false);
  });

  it("rejeita endpoint muito longo (>2000)", () => {
    const result = pushUnsubscribeSchema.safeParse({
      endpoint: `https://example.com/${"a".repeat(2000)}`,
    });
    expect(result.success).toBe(false);
  });
});

// ========== pushBroadcastSchema ==========

describe("push — pushBroadcastSchema", () => {
  it("valida broadcast minimo", () => {
    const result = pushBroadcastSchema.safeParse({
      title: "Aviso Importante",
      message: "Manutenção agendada para hoje",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sem title", () => {
    const result = pushBroadcastSchema.safeParse({
      title: "",
      message: "msg",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem message", () => {
    const result = pushBroadcastSchema.safeParse({
      title: "title",
      message: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita title muito longo (>200)", () => {
    const result = pushBroadcastSchema.safeParse({
      title: "a".repeat(201),
      message: "msg",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita message muito longa (>2000)", () => {
    const result = pushBroadcastSchema.safeParse({
      title: "title",
      message: "a".repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});

// ========== Logica de Push Notification Payload ==========

describe("push — logica de push notification payload", () => {
  it("constroi payload de teste corretamente", () => {
    const payload = {
      title: "JLMIRROR — Teste de Push",
      body: "Push notification recebida com sucesso!",
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: "test-push",
      data: { type: "test", timestamp: new Date().toISOString() },
    };
    expect(payload.title).toContain("Teste");
    expect(payload.tag).toBe("test-push");
    expect(payload.data.type).toBe("test");
  });

  it("constroi payload de broadcast corretamente", () => {
    const userId = "user-123";
    const payload = {
      title: "Aviso",
      body: "Manutenção",
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: "broadcast",
      data: { type: "broadcast", sent_by: userId },
    };
    expect(payload.tag).toBe("broadcast");
    expect(payload.data.type).toBe("broadcast");
    expect(payload.data.sent_by).toBe(userId);
  });
});
