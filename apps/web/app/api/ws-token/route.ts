import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.API_INTERNAL_URL ?? "http://localhost:3001";

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("access_token")?.value;
  const refreshToken = request.cookies.get("refresh_token")?.value;

  if (!accessToken) {
    if (!refreshToken) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Sem sessão ativa" } },
        { status: 401 },
      );
    }

    // Tenta renovar o access_token via refresh_token
    try {
      const refreshRes = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
        cache: "no-store",
      });

      if (!refreshRes.ok) {
        return NextResponse.json(
          { error: { code: "UNAUTHORIZED", message: "Sessão expirada" } },
          { status: 401 },
        );
      }

      const data = (await refreshRes.json()) as { access_token?: string };
      const newToken = data.access_token;
      if (!newToken) {
        return NextResponse.json(
          {
            error: { code: "UNAUTHORIZED", message: "Falha ao renovar token" },
          },
          { status: 401 },
        );
      }

      const response = NextResponse.json({ token: newToken });
      const cookieSecure = process.env.COOKIE_SECURE === "true";
      response.cookies.set("access_token", newToken, {
        httpOnly: true,
        secure: cookieSecure,
        sameSite: "lax",
        path: "/",
        maxAge: 15 * 60,
      });
      return response;
    } catch {
      return NextResponse.json(
        { error: { code: "SERVER_ERROR", message: "Erro ao renovar sessão" } },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({ token: accessToken });
}
