// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.API_INTERNAL_URL ?? "http://localhost:3001";

// Proxy para /api/v1/auth/oauth/google — redireciona para Google
export async function GET(request: NextRequest) {
  const returnUrl =
    request.nextUrl.searchParams.get("return_url") ?? "/dashboard";

  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/auth/oauth/google`, {
      cache: "no-store",
    });
    const data = await res.json();

    if (!res.ok) {
      return NextResponse.redirect(
        new URL("/auth/login?error=oauth_not_configured", request.url),
      );
    }

    // Anexa return_url ao state para recuperar apos callback
    const authUrl = new URL(data.redirect_url);
    authUrl.searchParams.set("state", encodeURIComponent(returnUrl));
    return NextResponse.redirect(authUrl);
  } catch {
    return NextResponse.redirect(
      new URL("/auth/login?error=oauth_failed", request.url),
    );
  }
}
