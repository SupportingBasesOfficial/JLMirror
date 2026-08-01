// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import type { Context } from "hono";

// Helper que faz parse do body JSON com tratamento de erro
// Retorna { success: true, data } ou { success: false, response }
export async function safeJsonBody<T = Record<string, unknown>>(
  c: Context,
): Promise<{ success: true; data: T } | { success: false; response: Response }> {
  try {
    const data = await c.req.json<T>();
    return { success: true, data };
  } catch {
    return {
      success: false,
      response: c.json(
        { error: { code: "INVALID_JSON", message: "Body nao e um JSON valido" } },
        400,
      ),
    };
  }
}
