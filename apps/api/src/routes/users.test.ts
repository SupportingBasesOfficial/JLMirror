// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  updateProfileSchema,
  updatePreferencesSchema,
} from "@repo/shared-validation";

describe("users — profile schemas used by users route", () => {
  it("updateProfileSchema valida nome e email", () => {
    const result = updateProfileSchema.safeParse({
      full_name: "Joao Silva",
      email: "joao@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("updateProfileSchema rejeita email invalido", () => {
    const result = updateProfileSchema.safeParse({
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("updateProfileSchema aceita apenas full_name", () => {
    const result = updateProfileSchema.safeParse({
      full_name: "Joao",
    });
    expect(result.success).toBe(true);
  });

  it("updatePreferencesSchema valida preferencias", () => {
    const result = updatePreferencesSchema.safeParse({
      notification_email: true,
      theme: "dark",
    });
    expect(result.success).toBe(true);
  });

  it("updatePreferencesSchema rejeita valor invalido para theme", () => {
    const result = updatePreferencesSchema.safeParse({
      theme: "invalid-theme",
    });
    expect(result.success).toBe(false);
  });
});
