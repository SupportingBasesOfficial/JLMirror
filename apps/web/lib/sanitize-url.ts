// Utilitario de sanitizacao de URLs para prevenir ataques XSS via javascript: ou data: schemes.
// React escapa automaticamente valores em JSX, mas href/src podem executar javascript: em alguns navegadores.
// Esta funcao garante que apenas protocols seguros sejam permitidos.

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:", "ftp:"]);

export function sanitizeUrl(url: string | undefined | null): string {
  if (!url) return "";

  const trimmed = url.trim();

  // Permite URLs relativas (comecam com / ou # ou ?)
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("?")
  ) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed, window.location.origin);
    if (SAFE_PROTOCOLS.has(parsed.protocol)) {
      return trimmed;
    }
  } catch {
    // URL invalida — retorna string vazia para nao renderizar
    return "";
  }

  return "";
}

export function sanitizeSrc(url: string | undefined | null): string {
  if (!url) return "";

  const trimmed = url.trim();

  // Permite URLs relativas
  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  // Permite data: URIs apenas para imagens (base64)
  if (trimmed.startsWith("data:image/")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed, window.location.origin);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return trimmed;
    }
  } catch {
    return "";
  }

  return "";
}
