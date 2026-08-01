// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Gera um fingerprint único do dispositivo baseado em características do navegador.
// Usa canvas fingerprinting, timezone, idioma, resolução de tela e cores.
// O fingerprint é enviado no login para rastrear sessões por dispositivo.

export function generateDeviceFingerprint(): string {
  if (typeof window === "undefined") return "server-side";

  const components: string[] = [];

  // User Agent
  components.push(navigator.userAgent);

  // Idioma
  components.push(navigator.language);

  // Timezone
  components.push(Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown");

  // Resolução de tela
  components.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);

  // Profundidade de cor
  components.push(String(screen.colorDepth));

  // Platform
  components.push(navigator.platform || "unknown");

  // Hardware concurrency (CPU cores)
  components.push(String(navigator.hardwareConcurrency || 0));

  // Device memory (quando disponível)
  components.push(String((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 0));

  // Canvas fingerprint
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px 'Arial'";
      ctx.fillStyle = "#1BA898";
      ctx.fillRect(0, 0, 200, 50);
      ctx.fillStyle = "#0B1015";
      ctx.fillText("JLMIRROR-fp", 2, 2);
      components.push(canvas.toDataURL());
    }
  } catch {
    components.push("canvas-blocked");
  }

  // WebRTC não é usado para fingerprinting por privacidade

  // Combina todos os componentes e gera hash simples
  const combined = components.join("|");
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const hashHex = Math.abs(hash).toString(16).padStart(8, "0");

  // Adiciona parte do user agent para mais entropia
  const uaHash = btoa(navigator.userAgent.slice(0, 32)).replace(/=/g, "").slice(0, 16);

  return `fp_${hashHex}${uaHash}`;
}

export function getDeviceLabel(): string {
  if (typeof window === "undefined") return "Server";
  const ua = navigator.userAgent.toLowerCase();
  const browser = ua.includes("edg") ? "Edge" : ua.includes("chrome") ? "Chrome" : ua.includes("firefox") ? "Firefox" : ua.includes("safari") ? "Safari" : "Browser";
  const os = ua.includes("windows") ? "Windows" : ua.includes("mac") ? "macOS" : ua.includes("linux") ? "Linux" : ua.includes("android") ? "Android" : ua.includes("iphone") || ua.includes("ipad") ? "iOS" : "Unknown";
  return `${browser} · ${os}`;
}
