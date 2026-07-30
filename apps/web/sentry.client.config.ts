import * as Sentry from "@sentry/nextjs";

/**
 * Sentry client config — error tracking no navegador.
 *
 * Ativo apenas se NEXT_PUBLIC_SENTRY_DSN estiver configurado.
 * Em desenvolvimento, não envia eventos.
 *
 * Nota: No client bundle, Next.js só expõe variáveis com prefixo NEXT_PUBLIC_.
 * O server/edge config usa SENTRY_DSN (server-only).
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
});
