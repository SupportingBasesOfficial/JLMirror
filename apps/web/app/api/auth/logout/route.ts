import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.API_INTERNAL_URL ?? "http://localhost:3001";

// Rota dedicada de logout: revoga refresh token na API e limpa cookies
export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get("refresh_token")?.value;

  if (refreshToken) {
    await fetch(`${API_BASE_URL}/api/v1/auth/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    }).catch(() => {
      // Ignora erro de revogação — cookies serão limpos independente
    });
  }

  const response = NextResponse.json({ revoked: true });
  response.cookies.delete("access_token");
  response.cookies.delete("refresh_token");
  return response;
}
