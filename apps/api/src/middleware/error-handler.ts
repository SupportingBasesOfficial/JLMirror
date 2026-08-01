// @ai-context: .zero-error/architecture-map.md#logic-core
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { createMiddleware } from "hono/factory";
import { logger } from "@repo/logger";

export const errorHandler = createMiddleware(
  async (c, next) => {
    try {
      await next();
    } catch (error) {
      // Detecta erros de parse JSON e retorna 400 em vez de 500
      const msg = error instanceof Error ? error.message : "";
      if (
        msg.includes("Unexpected token") ||
        msg.includes("JSON") ||
        msg.includes("json") ||
        (error instanceof SyntaxError && msg.includes("JSON"))
      ) {
        return c.json(
          {
            error: {
              code: "INVALID_JSON",
              message: "Body nao e um JSON valido",
            },
          },
          400,
        );
      }

      logger.error("Erro nao tratado", { error: error instanceof Error ? error.message : String(error) });
      return c.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message:
              error instanceof Error ? error.message : "Erro interno do servidor",
          },
        },
        500,
      );
    }
  },
);
