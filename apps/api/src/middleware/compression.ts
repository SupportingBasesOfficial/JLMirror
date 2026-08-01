// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Response compression middleware usando hono/compress
import { compress } from "hono/compress";

export const compressionMiddleware = compress({
  encoding: "gzip",
  threshold: 1024,
});
