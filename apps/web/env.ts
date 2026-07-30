import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  client: {
    NEXT_PUBLIC_API_URL: z.string().url(),
    NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().or(z.literal("")).optional(),
    NEXT_PUBLIC_WS_URL: z.string().optional(),
  },
  server: {
    SENTRY_DSN: z.string().url().or(z.literal("")).optional(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
    SENTRY_DSN: process.env.SENTRY_DSN,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION || !!process.env.CI,
});
