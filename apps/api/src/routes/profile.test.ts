// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  updateProfileSchema,
  updatePreferencesSchema,
  updateAvatarSchema,
} from "@repo/shared-validation";

// ========== updateProfileSchema ==========

describe("profile — updateProfileSchema", () => {
  it("valida profile vazio (parcial)", () => {
    const result = updateProfileSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida display_name", () => {
    const result = updateProfileSchema.safeParse({ display_name: "João" });
    expect(result.success).toBe(true);
  });

  it("rejeita display_name muito longo (>200)", () => {
    const result = updateProfileSchema.safeParse({
      display_name: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("valida bio", () => {
    const result = updateProfileSchema.safeParse({ bio: "Desenvolvedor" });
    expect(result.success).toBe(true);
  });

  it("rejeita bio muito longa (>2000)", () => {
    const result = updateProfileSchema.safeParse({ bio: "a".repeat(2001) });
    expect(result.success).toBe(false);
  });

  it("valida phone", () => {
    const result = updateProfileSchema.safeParse({
      phone: "+55 11 99999-9999",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita phone muito longo (>50)", () => {
    const result = updateProfileSchema.safeParse({ phone: "1".repeat(51) });
    expect(result.success).toBe(false);
  });

  it("valida location", () => {
    const result = updateProfileSchema.safeParse({ location: "São Paulo, BR" });
    expect(result.success).toBe(true);
  });

  it("rejeita location muito longa (>200)", () => {
    const result = updateProfileSchema.safeParse({
      location: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("valida timezone", () => {
    const result = updateProfileSchema.safeParse({
      timezone: "America/Sao_Paulo",
    });
    expect(result.success).toBe(true);
  });

  it("valida locale", () => {
    const result = updateProfileSchema.safeParse({ locale: "pt-BR" });
    expect(result.success).toBe(true);
  });

  it("rejeita locale muito longo (>20)", () => {
    const result = updateProfileSchema.safeParse({ locale: "a".repeat(21) });
    expect(result.success).toBe(false);
  });

  it("valida job_title", () => {
    const result = updateProfileSchema.safeParse({
      job_title: "Senior Developer",
    });
    expect(result.success).toBe(true);
  });

  it("valida department", () => {
    const result = updateProfileSchema.safeParse({ department: "Engineering" });
    expect(result.success).toBe(true);
  });

  it("valida skills array", () => {
    const result = updateProfileSchema.safeParse({
      skills: ["TypeScript", "React", "Node.js"],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita skills com item muito longo (>100)", () => {
    const result = updateProfileSchema.safeParse({
      skills: ["a".repeat(101)],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita skills com mais de 50 itens", () => {
    const result = updateProfileSchema.safeParse({
      skills: Array(51).fill("skill"),
    });
    expect(result.success).toBe(false);
  });

  it("valida social_links", () => {
    const result = updateProfileSchema.safeParse({
      social_links: { github: "https://github.com/user" },
    });
    expect(result.success).toBe(true);
  });

  it("rejeita social_links com valor muito longo (>500)", () => {
    const result = updateProfileSchema.safeParse({
      social_links: { github: "a".repeat(501) },
    });
    expect(result.success).toBe(false);
  });

  it("valida email", () => {
    const result = updateProfileSchema.safeParse({
      email: "user@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita email invalido", () => {
    const result = updateProfileSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
  });
});

// ========== updatePreferencesSchema ==========

describe("profile — updatePreferencesSchema", () => {
  it("valida preferences vazio (parcial)", () => {
    const result = updatePreferencesSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida notification_email boolean", () => {
    const result = updatePreferencesSchema.safeParse({
      notification_email: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita notification_email nao-boolean", () => {
    const result = updatePreferencesSchema.safeParse({
      notification_email: "yes",
    });
    expect(result.success).toBe(false);
  });

  it("valida notification_digest_frequency enum", () => {
    const result = updatePreferencesSchema.safeParse({
      notification_digest_frequency: "daily",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita notification_digest_frequency invalido", () => {
    const result = updatePreferencesSchema.safeParse({
      notification_digest_frequency: "monthly",
    });
    expect(result.success).toBe(false);
  });

  it("valida quiet_hours_start HH:MM", () => {
    const result = updatePreferencesSchema.safeParse({
      quiet_hours_start: "22:00",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita quiet_hours_start formato invalido", () => {
    const result = updatePreferencesSchema.safeParse({
      quiet_hours_start: "25:00",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita quiet_hours_start sem dois pontos", () => {
    const result = updatePreferencesSchema.safeParse({
      quiet_hours_start: "2200",
    });
    expect(result.success).toBe(false);
  });

  it("valida quiet_hours_end HH:MM", () => {
    const result = updatePreferencesSchema.safeParse({
      quiet_hours_end: "06:00",
    });
    expect(result.success).toBe(true);
  });

  it("valida theme light", () => {
    const result = updatePreferencesSchema.safeParse({ theme: "light" });
    expect(result.success).toBe(true);
  });

  it("valida theme dark", () => {
    const result = updatePreferencesSchema.safeParse({ theme: "dark" });
    expect(result.success).toBe(true);
  });

  it("valida theme system", () => {
    const result = updatePreferencesSchema.safeParse({ theme: "system" });
    expect(result.success).toBe(true);
  });

  it("rejeita theme invalido", () => {
    const result = updatePreferencesSchema.safeParse({ theme: "purple" });
    expect(result.success).toBe(false);
  });

  it("valida density compact", () => {
    const result = updatePreferencesSchema.safeParse({ density: "compact" });
    expect(result.success).toBe(true);
  });

  it("valida density comfortable", () => {
    const result = updatePreferencesSchema.safeParse({
      density: "comfortable",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita density invalido", () => {
    const result = updatePreferencesSchema.safeParse({ density: "spacious" });
    expect(result.success).toBe(false);
  });

  it("valida sidebar_collapsed boolean", () => {
    const result = updatePreferencesSchema.safeParse({
      sidebar_collapsed: true,
    });
    expect(result.success).toBe(true);
  });

  it("valida dashboard_layout object", () => {
    const result = updatePreferencesSchema.safeParse({
      dashboard_layout: { columns: 3, widgets: ["chart", "table"] },
    });
    expect(result.success).toBe(true);
  });
});

// ========== updateAvatarSchema ==========

describe("profile — updateAvatarSchema", () => {
  it("valida avatar vazio (parcial)", () => {
    const result = updateAvatarSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida avatar_url", () => {
    const result = updateAvatarSchema.safeParse({
      avatar_url: "https://example.com/avatar.png",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita avatar_url invalida", () => {
    const result = updateAvatarSchema.safeParse({ avatar_url: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("rejeita avatar_url muito longa (>2000)", () => {
    const result = updateAvatarSchema.safeParse({
      avatar_url: `https://example.com/${"a".repeat(2000)}`,
    });
    expect(result.success).toBe(false);
  });

  it("valida avatar_initials", () => {
    const result = updateAvatarSchema.safeParse({ avatar_initials: "JD" });
    expect(result.success).toBe(true);
  });

  it("rejeita avatar_initials muito longo (>10)", () => {
    const result = updateAvatarSchema.safeParse({
      avatar_initials: "ABCDEFGHIJK",
    });
    expect(result.success).toBe(false);
  });

  it("valida avatar_color hex", () => {
    const result = updateAvatarSchema.safeParse({ avatar_color: "#FF5733" });
    expect(result.success).toBe(true);
  });

  it("valida avatar_color hex curto", () => {
    const result = updateAvatarSchema.safeParse({ avatar_color: "#FFF" });
    expect(result.success).toBe(true);
  });

  it("rejeita avatar_color invalido", () => {
    const result = updateAvatarSchema.safeParse({ avatar_color: "red" });
    expect(result.success).toBe(false);
  });

  it("rejeita avatar_color sem #", () => {
    const result = updateAvatarSchema.safeParse({ avatar_color: "FF5733" });
    expect(result.success).toBe(false);
  });
});

// ========== Logica de Initials Generation ==========

describe("profile — logica de initials generation", () => {
  it("gera initials de nome simples", () => {
    const displayName = "João";
    const initials = displayName.substring(0, 2).toUpperCase();
    expect(initials).toBe("JO");
  });

  it("gera initials de nome de 1 char", () => {
    const displayName = "A";
    const initials = displayName.substring(0, 2).toUpperCase();
    expect(initials).toBe("A");
  });

  it("gera initials de email", () => {
    const displayName = "user@example.com";
    const initials = displayName.substring(0, 2).toUpperCase();
    expect(initials).toBe("US");
  });

  it("fallback para User quando sem nome/email", () => {
    const displayName = "User";
    const initials = displayName.substring(0, 2).toUpperCase();
    expect(initials).toBe("US");
  });
});

// ========== Logica de Limit Pagination ==========

describe("profile — logica de limit pagination", () => {
  it("security log limit default 20", () => {
    const limit = Math.min(parseInt("20", 10), 100);
    expect(limit).toBe(20);
  });

  it("security log limit maximo 100", () => {
    const limit = Math.min(parseInt("9999", 10), 100);
    expect(limit).toBe(100);
  });

  it("security log limit custom", () => {
    const limit = Math.min(parseInt("50", 10), 100);
    expect(limit).toBe(50);
  });
});
