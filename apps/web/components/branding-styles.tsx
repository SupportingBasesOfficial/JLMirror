// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useEffect } from "react";
import { useTenantBranding } from "@/lib/use-tenant-branding";

// Componente que injeta CSS variables de branding do tenant no documento
// Deve ser renderizado no layout raiz ou em layouts especificos de portal
export function BrandingStyles({ tenantSlug }: { tenantSlug?: string }) {
  const { branding } = useTenantBranding(tenantSlug);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--brand-primary", branding.primary_color);
    root.style.setProperty("--brand-secondary", branding.secondary_color);

    if (branding.company_name) {
      root.style.setProperty(
        "--brand-company-name",
        `"${branding.company_name}"`,
      );
    }

    // Injeta CSS customizado se existir
    let styleEl = document.getElementById("tenant-custom-css");
    if (branding.custom_css) {
      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = "tenant-custom-css";
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = branding.custom_css;
    } else if (styleEl) {
      styleEl.remove();
    }
  }, [branding]);

  return null;
}
