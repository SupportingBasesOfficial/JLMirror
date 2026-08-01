// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.API_INTERNAL_URL ?? "http://localhost:3001";

// Rota dedicada de login: chama a API, seta cookies httpOnly, retorna user sem tokens
export async function POST(request: NextRequest) {
  const body = await request.json();

  let res: Response;
  try {
    const forwardedHeaders: Record<string, string> = { "Content-Type": "application/json" };
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
    const clientUa = request.headers.get("user-agent") || "";
    if (clientIp) forwardedHeaders["x-forwarded-for"] = clientIp;
    if (clientUa) forwardedHeaders["user-agent"] = clientUa;

    res = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: forwardedHeaders,
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Não foi possível conectar ao servidor de autenticação" } },
      { status: 502 },
    );
  }

  // Trata resposta não-JSON (ex: "Internal Server Error" do Hono em crash)
  const responseText = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(responseText);
  } catch {
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Erro interno no servidor de autenticação" } },
      { status: res.status || 500 },
    );
  }

  if (!res.ok) {
    return NextResponse.json(data, { status: res.status });
  }

  // Extrai tokens e seta como cookies httpOnly
  const typedData = data as Record<string, unknown> & { user?: { must_change_password?: boolean } };
  const response = NextResponse.json({
    user: typedData.user,
    tenants: typedData.tenants,
    must_change_password: typedData.must_change_password ?? typedData.user?.must_change_password ?? false,
  });

  const isProduction = process.env.NODE_ENV === "production";
  const maxAge = 30 * 24 * 60 * 60; // 30 dias

  response.cookies.set("access_token", data.access_token as string, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60, // 15 minutos — access token
  });

  response.cookies.set("refresh_token", data.refresh_token as string, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge,
  });

  return response;
}
