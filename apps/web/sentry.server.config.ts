import * as Sentry from "@sentry/nextjs";

/**
 * Sentry server config — error tracking no servidor.
 *
 * Ativo apenas se SENTRY_DSN estiver configurado.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
  enabled: !!process.env.SENTRY_DSN,
});
