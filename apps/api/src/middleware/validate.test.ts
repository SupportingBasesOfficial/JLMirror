// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { validate, getValidatedData } from "../middleware/validate.js";

interface MockContext {
  req: {
    json: () => Promise<unknown>;
    query: () => Record<string, string>;
    param: () => Record<string, string>;
    method: string;
  };
  json: (data: unknown, status?: number) => { data: unknown; status: number };
  set: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
}

// Mock minimal para Context do Hono
function createMockContext(body: unknown, method: string = "POST"): MockContext {
  return {
    req: {
      json: async () => body,
      query: () => ({}),
      param: () => ({}),
      method,
    },
    json: (data: unknown, status?: number) => ({ data, status: status ?? 200 }),
    set: vi.fn(),
    get: vi.fn(),
  };
}

describe("validate middleware", () => {
  const testSchema = z.object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
  });

  it("passa quando body é válido", async () => {
    const ctx = createMockContext({ name: "Test", email: "test@example.com" });
    const next = vi.fn();
    const middleware = validate({ schema: testSchema });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await middleware(ctx as any, next);

    expect(next).toHaveBeenCalled();
    expect(ctx.set).toHaveBeenCalledWith("validatedData", expect.objectContaining({
      name: "Test",
      email: "test@example.com",
    }));
  });

  it("retorna 400 quando body é inválido", async () => {
    const ctx = createMockContext({ name: "", email: "not-an-email" });
    const next = vi.fn();
    const middleware = validate({ schema: testSchema });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await middleware(ctx as any, next) as { data: unknown; status: number } | undefined;

    expect(next).not.toHaveBeenCalled();
    expect(result?.status).toBe(400);
    expect(result?.data).toHaveProperty("error.code", "VALIDATION_ERROR");
  });

  it("retorna 400 quando JSON é malformado", async () => {
    const ctx = {
      req: {
        json: async () => { throw new SyntaxError("Unexpected token"); },
        query: () => ({}),
        param: () => ({}),
        method: "POST",
      },
      json: (data: unknown, status?: number) => ({ data, status: status ?? 200 }),
      set: vi.fn(),
      get: vi.fn(),
    };
    const next = vi.fn();
    const middleware = validate({ schema: testSchema });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await middleware(ctx as any, next) as { data: unknown; status: number } | undefined;

    expect(next).not.toHaveBeenCalled();
    expect(result?.status).toBe(400);
    expect(result?.data).toHaveProperty("error.code", "INVALID_JSON");
  });

  it("getValidatedData extrai dados do contexto", () => {
    const mockCtx = {
      get: vi.fn().mockReturnValue({ name: "Test", email: "test@example.com" }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = getValidatedData<{ name: string }>(mockCtx as any);
    expect(data.name).toBe("Test");
  });
});
