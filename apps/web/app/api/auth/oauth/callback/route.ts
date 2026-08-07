// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.API_INTERNAL_URL ?? "http://localhost:3001";

// Proxy para /api/v1/auth/oauth/callback — troca code por tokens e seta cookies
export async function POST(request: NextRequest) {
  const body = await request.json();

  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/auth/oauth/callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    // Seta cookies httpOnly com os tokens
    const response = NextResponse.json({
      user: data.user,
      scope: data.scope,
      must_change_password: data.must_change_password ?? false,
    });

    if (data.access_token) {
      response.cookies.set("access_token", data.access_token, {
        httpOnly: true,
        secure: process.env.COOKIE_SECURE === "true",
        sameSite: "lax",
        path: "/",
        maxAge: 15 * 60,
      });
    }
    if (data.refresh_token) {
      response.cookies.set("refresh_token", data.refresh_token, {
        httpOnly: true,
        secure: process.env.COOKIE_SECURE === "true",
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
      });
    }

    return response;
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "OAUTH_FAILED",
          message: "Erro de conexão com o servidor",
        },
      },
      { status: 500 },
    );
  }
}
