import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.API_INTERNAL_URL ?? "http://localhost:3001";

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("access_token")?.value;
  const refreshToken = request.cookies.get("refresh_token")?.value;

  let effectiveToken: string | undefined = accessToken ?? undefined;

  if (!effectiveToken && refreshToken) {
    try {
      const refreshRes = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
        cache: "no-store",
      });
      if (refreshRes.ok) {
        const data = (await refreshRes.json()) as { access_token?: string };
        effectiveToken = data.access_token ?? undefined;
      }
    } catch {
      return NextResponse.json({ connected: false }, { status: 200 });
    }
  }

  if (!effectiveToken) {
    return NextResponse.json({ connected: false }, { status: 200 });
  }

  try {
    let res = await fetch(`${API_BASE_URL}/api/v1/zabbix/ping`, {
      headers: { Authorization: `Bearer ${effectiveToken}` },
      cache: "no-store",
    });

    // Se 401 e tem refresh token, tenta renovar e refaz
    if (res.status === 401 && refreshToken) {
      try {
        const refreshRes = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
          cache: "no-store",
        });
        if (refreshRes.ok) {
          const refreshData = (await refreshRes.json()) as { access_token?: string };
          const newToken = refreshData.access_token;
          if (newToken) {
            // Refaz o ping com o novo token
            res = await fetch(`${API_BASE_URL}/api/v1/zabbix/ping`, {
              headers: { Authorization: `Bearer ${newToken}` },
              cache: "no-store",
            });

            // Atualiza cookie do access_token
            if (res.ok) {
              const data = await res.json();
              const response = NextResponse.json(data, { status: 200 });
              response.cookies.set("access_token", newToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                path: "/",
                maxAge: 15 * 60,
              });
              return response;
            }
          }
        }
      } catch {
        return NextResponse.json({ connected: false }, { status: 200 });
      }
    }

    if (!res.ok) {
      return NextResponse.json({ connected: false }, { status: 200 });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: 200 });
  } catch {
    return NextResponse.json({ connected: false }, { status: 200 });
  }
}
