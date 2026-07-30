import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.API_INTERNAL_URL ?? "http://localhost:3001";

// Proxy para POST /api/v1/mfa/verify — verifica código TOTP durante login
export async function POST(request: NextRequest) {
  const body = await request.json();

  const res = await fetch(`${API_BASE_URL}/api/v1/mfa/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const data = await res.json();

  if (!res.ok) {
    return NextResponse.json(data, { status: res.status });
  }

  // Setar cookies httpOnly com os tokens recebidos
  const typedData = data as Record<string, unknown> & { user?: { must_change_password?: boolean } };
  const response = NextResponse.json({
    user: typedData.user,
    tenants: typedData.tenants,
    must_change_password: typedData.must_change_password ?? typedData.user?.must_change_password ?? false,
  });

  const isProduction = process.env.NODE_ENV === "production";
  const maxAge = 30 * 24 * 60 * 60;

  response.cookies.set("access_token", data.access_token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60,
  });

  response.cookies.set("refresh_token", data.refresh_token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge,
  });

  return response;
}
