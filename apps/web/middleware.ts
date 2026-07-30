import { type NextRequest, NextResponse } from "next/server";

const publicRoutes = ["/", "/auth/login"];

export async function middleware(request: NextRequest) {
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
        { error: { code: "CSRF_INVALID", message: "Origem da requisição inválida" } },
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

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api).*)",
  ],
};
