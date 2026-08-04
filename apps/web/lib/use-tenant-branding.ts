// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useEffect, useCallback } from "react";

export interface TenantBranding {
  company_name: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  custom_css: string | null;
  login_message: string | null;
}

const DEFAULT_BRANDING: TenantBranding = {
  company_name: null,
  logo_url: null,
  primary_color: "#1BA898",
  secondary_color: "#35D0C4",
  custom_css: null,
  login_message: null,
};

// Hook que busca branding do tenant baseado no subdominio ou slug
export function useTenantBranding(tenantSlug?: string): {
  branding: TenantBranding;
  loading: boolean;
} {
  const [branding, setBranding] = useState<TenantBranding>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);

  const fetchBranding = useCallback(async () => {
    // Determina o slug: parametro explicito, subdominio, ou "default"
    let slug = tenantSlug;
    if (!slug && typeof window !== "undefined") {
      const host = window.location.hostname;
      const parts = host.split(".");
      // Se tem subdominio (ex: cliente.jlmirror.com.br), usa como slug
      if (parts.length > 2) {
        slug = parts[0];
      }
    }

    try {
      const url = slug
        ? `/api/branding/${encodeURIComponent(slug)}`
        : "/api/branding";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setBranding({ ...DEFAULT_BRANDING, ...data });
      }
    } catch {
      // Silencioso — usa defaults
    }
    setLoading(false);
  }, [tenantSlug]);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  return { branding, loading };
}
