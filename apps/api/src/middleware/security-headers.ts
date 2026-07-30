// Security headers middleware usando hono/secure-headers
// Configura CSP, HSTS, X-Frame-Options, X-Content-Type-Options, etc.

import { secureHeaders } from "hono/secure-headers";

export const securityHeaders = secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "blob:"],
    fontSrc: ["'self'", "data:"],
    connectSrc: ["'self'", "ws://localhost:*", "wss://*.jlmirror.com"],
    frameAncestors: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
  },
  strictTransportSecurity: process.env.NODE_ENV === "production"
    ? "max-age=63072000; includeSubDomains; preload"
    : undefined,
  xFrameOptions: "DENY",
  xContentTypeOptions: "nosniff",
  referrerPolicy: "strict-origin-when-cross-origin",
  xXssProtection: "0",
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: "same-origin",
  crossOriginResourcePolicy: "same-origin",
});
