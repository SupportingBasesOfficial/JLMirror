/**
 * OpenTelemetry instrumentation — registra o instrumentation hook do Next.js.
 *
 * O Next.js chama register() automaticamente no startup do servidor.
 * Ativo apenas se @vercel/otel estiver disponível.
 *
 * Para usar em produção (Vercel):
 * 1. As variáveis OTEL_EXPORTER_OTLP_ENDPOINT e OTEL_EXPORTER_OTLP_HEADERS
 *    são configuradas automaticamente pela Vercel.
 * 2. Em outros ambientes, configure manualmente.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // @vercel/otel foi removido das dependencias para reduzir o bundle.
    // Para reativar OpenTelemetry no Vercel: pnpm add @vercel/otel e
    // descomente o bloco abaixo.
    /*
    try {
      const { registerOTel } = await import("@vercel/otel");
      registerOTel({ serviceName: "jlmirror-web" });
    } catch {
      // @vercel/otel não instalado — silencioso
    }
    */
  }
}
