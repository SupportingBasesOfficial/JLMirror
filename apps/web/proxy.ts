// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { type NextRequest, NextResponse } from "next/server";

const publicRoutes = ["/", "/auth/login"];

// Rotas que exigem scope global (JL staff). Bloqueio server-side precoce.
// A verificacao criptografica do JWT continua no backend via jwtAuth.
const ADMIN_ONLY_PREFIXES = ["/admin", "/white-label", "/status-page-admin"];

// Rotas admin-only com match exato (não podem ser prefix de rotas do cliente)
const ADMIN_ONLY_EXACT = ["/settings/modules"];

// Decodifica o payload de um JWT sem verificar assinatura.
// Usado apenas para bloqueio precoce no proxy (Node.js runtime).
// O backend valida criptograficamente via jwtAuth + RS256.
function decodeJwtPayload(
  token: string,
): { scope?: string; type?: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    // Base64url -> Base64
    const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payloadJson = atob(payloadB64);
    return JSON.parse(payloadJson);
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname, origin } = request.nextUrl;
  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  // CSRF protection — valida Origin header em mutações (POST/PUT/DELETE/PATCH)
  // Previne cross-site request forgery sem necessidade de token CSRF separado
  const mutationMethods = ["POST", "PUT", "DELETE", "PATCH"];
  if (mutationMethods.includes(request.method)) {
    const originHeader = request.headers.get("origin");
    if (!originHeader || originHeader !== origin) {
      return NextResponse.json(
        {
          error: {
            code: "CSRF_INVALID",
            message: "Origem da requisição inválida",
          },
        },
        { status: 403 },
      );
    }
  }

  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Autenticação obrigatória em todos os ambientes — sem bypass de dev
  const accessToken = request.cookies.get("access_token");

  if (!accessToken) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  // Bloqueio precoce de rotas admin-only para usuarios nao-global
  // Decodifica o payload do JWT (sem verificar assinatura — leitura apenas)
  // A verificacao criptografica completa continua no backend via jwtAuth
  const isAdminOnlyRoute =
    ADMIN_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    ADMIN_ONLY_EXACT.some((route) => pathname === route);
  if (isAdminOnlyRoute) {
    const payload = decodeJwtPayload(accessToken.value);
    if (!payload || payload.scope !== "global") {
      // Usuario sem scope global tentando acessar rota admin — redireciona para dashboard
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api).*)",
  ],
};
