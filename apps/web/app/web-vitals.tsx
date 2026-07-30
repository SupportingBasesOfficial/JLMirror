"use client";

import { useReportWebVitals } from "next/web-vitals";
import { logger } from "@repo/logger";

/**
 * Web Vitals reporter — captura métricas de performance do Next.js.
 *
 * Métricas capturadas:
 * - CLS (Cumulative Layout Shift)
 * - FID/INP (Interaction to Next Paint)
 * - LCP (Largest Contentful Paint)
 * - FCP (First Contentful Paint)
 * - TTFB (Time to First Byte)
 *
 * Em produção, envia para Sentry/Analytics.
 * Em desenvolvimento, apenas loga.
 */
export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (process.env.NODE_ENV === "production") {
      // Em produção, envie para seu serviço de analytics
      // Ex: Sentry, Vercel Analytics, Google Analytics, Datadog
      logger.info(
        { name: metric.name, value: metric.value, rating: metric.rating },
        "Web Vital reportado",
      );
    } else {
      logger.debug(
        { name: metric.name, value: metric.value, rating: metric.rating },
        "Web Vital (dev)",
      );
    }
  });

  return null;
}
