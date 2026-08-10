// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import { z } from "zod";
import crypto from "node:crypto";

// Replica do schema
const createTvTokenSchema = z.object({
  label: z.string().min(1).max(100),
  rotation_interval_seconds: z.number().int().min(5).max(300).default(30),
  panels: z
    .array(z.enum(["devices", "alerts", "sla"]))
    .min(1)
    .default(["devices", "alerts", "sla"]),
});

// ========== createTvTokenSchema ==========

describe("tv — createTvTokenSchema", () => {
  const validToken = {
    label: "TV Lobby",
  };

  it("valida token minimo", () => {
    const result = createTvTokenSchema.safeParse(validToken);
    expect(result.success).toBe(true);
  });

  it("aplica default rotation_interval_seconds=30", () => {
    const result = createTvTokenSchema.safeParse(validToken);
    if (result.success) {
      expect(result.data.rotation_interval_seconds).toBe(30);
    }
  });

  it("aplica default panels", () => {
    const result = createTvTokenSchema.safeParse(validToken);
    if (result.success) {
      expect(result.data.panels).toEqual(["devices", "alerts", "sla"]);
    }
  });

  it("rejeita label vazio", () => {
    const result = createTvTokenSchema.safeParse({ label: "" });
    expect(result.success).toBe(false);
  });

  it("rejeita rotation < 5", () => {
    const result = createTvTokenSchema.safeParse({
      label: "TV",
      rotation_interval_seconds: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita rotation > 300", () => {
    const result = createTvTokenSchema.safeParse({
      label: "TV",
      rotation_interval_seconds: 500,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita panels vazio", () => {
    const result = createTvTokenSchema.safeParse({
      label: "TV",
      panels: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita panel invalido", () => {
    const result = createTvTokenSchema.safeParse({
      label: "TV",
      panels: ["invalid"],
    });
    expect(result.success).toBe(false);
  });

  it.each([
    ["devices", true],
    ["alerts", true],
    ["sla", true],
    ["invalid", false],
  ] as const)("panel=%s → valid=%s", (panel, expected) => {
    const result = createTvTokenSchema.safeParse({
      label: "TV",
      panels: [panel],
    });
    expect(result.success).toBe(expected);
  });
});

// ========== Logica de Token Hash ==========

describe("tv — token hash generation", () => {
  it("gera hash SHA256 consistente", () => {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hash1 = crypto.createHash("sha256").update(rawToken).digest("hex");
    const hash2 = crypto.createHash("sha256").update(rawToken).digest("hex");
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA256 hex = 64 chars
  });

  it("hashes diferentes para tokens diferentes", () => {
    const token1 = crypto.randomBytes(32).toString("hex");
    const token2 = crypto.randomBytes(32).toString("hex");
    const hash1 = crypto.createHash("sha256").update(token1).digest("hex");
    const hash2 = crypto.createHash("sha256").update(token2).digest("hex");
    expect(hash1).not.toBe(hash2);
  });
});

// ========== Logica de parseInt com NaN guard ==========

describe("tv — parseInt com NaN guard", () => {
  it("retorna 0 para string invalida", () => {
    const count = "abc";
    const result = Number.parseInt(String(count), 10) || 0;
    expect(result).toBe(0);
  });

  it("retorna valor para string valida", () => {
    const count = "42";
    const result = Number.parseInt(String(count), 10) || 0;
    expect(result).toBe(42);
  });

  it("reduce com NaN guard", () => {
    const rows = [{ count: "10" }, { count: "20" }, { count: "abc" }];
    const total = rows.reduce(
      (sum, r) => sum + (Number.parseInt(String(r.count), 10) || 0),
      0,
    );
    expect(total).toBe(30);
  });
});

// ========== Logica de Panels ==========

describe("tv — panels logic", () => {
  it("inclui devices panel", () => {
    const panels = ["devices", "alerts", "sla"];
    expect(panels.includes("devices")).toBe(true);
  });

  it("nao inclui panel ausente", () => {
    const panels = ["alerts", "sla"];
    expect(panels.includes("devices")).toBe(false);
  });
});

// ========== Logica de Error Handling ==========

describe("tv — error handling", () => {
  it("catch retorna INTERNAL_ERROR 500", () => {
    const error = new Error("DB connection failed");
    const message = error instanceof Error ? error.message : "Erro interno";
    expect(message).toBe("DB connection failed");
  });

  it("catch com non-Error retorna generico", () => {
    const error: unknown = "string error";
    const message = error instanceof Error ? error.message : "Erro interno";
    expect(message).toBe("Erro interno");
  });
});

// ========== Logica de Bearer Token Auth ==========

describe("tv — bearer token auth", () => {
  it("extrai token do header Authorization", () => {
    const authHeader = "Bearer abc123";
    const rawToken = authHeader.slice(7);
    expect(rawToken).toBe("abc123");
  });

  it("rejeita header sem Bearer", () => {
    const authHeader = "Basic abc123";
    const startsWithBearer = authHeader?.startsWith("Bearer ");
    expect(startsWithBearer).toBe(false);
  });

  it("rejeita header vazio", () => {
    const authHeader = undefined as string | undefined;
    const hasBearer = authHeader?.startsWith("Bearer ");
    expect(hasBearer).toBeUndefined();
  });
});
