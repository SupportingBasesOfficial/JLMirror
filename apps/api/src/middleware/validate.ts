// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import type { Context, Next } from "hono";
import type { ZodSchema, ZodError } from "zod";

type ValidationTarget = "json" | "query" | "param";

interface ValidationOptions {
  target?: ValidationTarget;
  schema: ZodSchema;
}

// Middleware factory que valida body/query/params usando Zod
// Retorna 400 com detalhes do erro se validacao falhar
export function validate(opts: ValidationOptions) {
  const target: ValidationTarget = opts.target ?? "json";
  const schema = opts.schema;

  return async (c: Context, next: Next) => {
    let data: unknown;

    try {
      if (target === "json") {
        data = await c.req.json();
      } else if (target === "query") {
        data = Object.fromEntries(new URLSearchParams(c.req.query() as Record<string, string>));
      } else {
        data = c.req.param();
      }
    } catch {
      return c.json(
        { error: { code: "INVALID_JSON", message: "Body JSON inválido ou malformado" } },
        400,
      );
    }

    const result = schema.safeParse(data);
    if (!result.success) {
      const error = result.error as ZodError;
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Dados inválidos",
            details: error.flatten(),
          },
        },
        400,
      );
    }

    // Armazena dados validados no contexto para uso no handler
    c.set("validatedData", result.data);
    await next();
  };
}

// Helper para extrair dados validados no handler
export function getValidatedData<T>(c: Context): T {
  return c.get("validatedData") as T;
}
