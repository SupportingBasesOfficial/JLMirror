// Response compression middleware usando hono/compress
import { compress } from "hono/compress";

export const compressionMiddleware = compress({
  encoding: "gzip",
  threshold: 1024,
});
