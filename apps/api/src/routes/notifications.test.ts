// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import { createChannelSchema } from "@repo/shared-validation";

describe("notification schemas — createChannelSchema (whatsapp)", () => {
  it("valida canal whatsapp com config completa", () => {
    const result = createChannelSchema.safeParse({
      name: "WhatsApp Alertas",
      type: "whatsapp",
      config: {
        evolution_api_url: "https://evolution.example.com",
        evolution_api_key: "secret-key",
        instance: "default",
        phone: "5511999999999",
      },
    });
    expect(result.success).toBe(true);
  });

  it("valida canal whatsapp sem api_key (opcional)", () => {
    const result = createChannelSchema.safeParse({
      name: "WhatsApp Sem Key",
      type: "whatsapp",
      config: {
        evolution_api_url: "https://evolution.example.com",
        phone: "5511999999999",
      },
    });
    expect(result.success).toBe(true);
  });

  it("valida canal whatsapp sem instance (usa default)", () => {
    const result = createChannelSchema.safeParse({
      name: "WhatsApp Default Instance",
      type: "whatsapp",
      config: {
        evolution_api_url: "https://evolution.example.com",
        phone: "5511999999999",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejeita type invalido", () => {
    const result = createChannelSchema.safeParse({
      name: "Canal Invalido",
      type: "sms",
      config: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem name", () => {
    const result = createChannelSchema.safeParse({
      type: "whatsapp",
      config: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem type", () => {
    const result = createChannelSchema.safeParse({
      name: "Canal Sem Tipo",
      config: {},
    });
    expect(result.success).toBe(false);
  });

  it("aceita config vazio (validacao de config acontece na entrega)", () => {
    const result = createChannelSchema.safeParse({
      name: "WhatsApp Config Vazio",
      type: "whatsapp",
      config: {},
    });
    expect(result.success).toBe(true);
  });
});
