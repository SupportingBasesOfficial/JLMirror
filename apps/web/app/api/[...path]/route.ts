// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.API_INTERNAL_URL ?? "http://localhost:3001";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, params);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, params);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, params);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, params);
}

// Tenta renovar o access token usando o refresh token do cookie
async function tryRefreshToken(
  request: NextRequest,
): Promise<string | null> {
  const refreshToken = request.cookies.get("refresh_token")?.value;
  if (!refreshToken) {
    return null;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    });

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

async function proxyRequest(
  request: NextRequest,
  paramsPromise: Promise<{ path: string[] }>,
) {
  try {
    const params = await paramsPromise;
    const path = params.path.join("/");
    const url = new URL(`/api/${path}`, API_BASE_URL);
    url.search = request.nextUrl.search;

    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("accept-encoding");

    // Repassa IP real do cliente para rate limiting da API
    const clientIp = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
    headers.set("x-forwarded-for", clientIp);

    // Repassa cookies de auth para a API
    const accessToken = request.cookies.get("access_token")?.value;
    const refreshToken = request.cookies.get("refresh_token")?.value;

    // Se não tem access token mas tem refresh token, tenta renovar antes da request
    let effectiveToken: string | undefined = accessToken ?? undefined;
    if (!effectiveToken && refreshToken) {
      effectiveToken = (await tryRefreshToken(request)) ?? undefined;
    }

    if (effectiveToken) {
      headers.set("Authorization", `Bearer ${effectiveToken}`);
    }

    let response = await fetch(url.toString(), {
      method: request.method,
      headers,
      body: request.method !== "GET" && request.method !== "DELETE" ? request.body : null,
      // @ts-expect-error — duplex é necessário para streaming no Node mas não está nos tipos DOM
      duplex: "half",
    });

    // Se 401 e tem refresh token, tenta renovar e refaz a request
    if (response.status === 401 && refreshToken) {
      const newToken = await tryRefreshToken(request);
      if (newToken) {
        // Recria a request com o novo token
        const newHeaders = new Headers(request.headers);
        newHeaders.delete("host");
        newHeaders.delete("accept-encoding");
        newHeaders.set("Authorization", `Bearer ${newToken}`);

        // Recria o body se era POST/PUT (já consumido pelo stream)
        if (request.method !== "GET" && request.method !== "DELETE") {
          // Para requests com body, não dá para re-streamar — retorna 401 com header de refresh
          const responseHeaders = new Headers();
          responseHeaders.set("Content-Type", "application/json");
          responseHeaders.set("X-Token-Refreshed", "true");
          const refreshResponse = new NextResponse(
            JSON.stringify({
              error: {
                code: "TOKEN_REFRESHED",
                message: "Token renovado. Refaça a requisição.",
              },
            }),
            { status: 401, headers: responseHeaders },
          );
          // Atualiza o cookie do access token para que o retry do client use o token valido
          refreshResponse.cookies.set("access_token", newToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 15 * 60,
          });
          return refreshResponse;
        }

        response = await fetch(url.toString(), {
          method: request.method,
          headers: newHeaders,
          // @ts-expect-error — duplex é necessário para streaming no Node mas não está nos tipos DOM
          duplex: "half",
        });

        // Adiciona header indicando que o token foi renovado
        const data = await response.text();
        const responseHeaders = new Headers(response.headers);
        responseHeaders.delete("set-cookie");
        responseHeaders.delete("content-encoding");
        responseHeaders.delete("content-length");
        responseHeaders.set("X-Token-Refreshed", "true");

        // Atualiza o cookie do access token na resposta
        const nextResponse = new NextResponse(data, {
          status: response.status,
          headers: responseHeaders,
        });
        nextResponse.cookies.set("access_token", newToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 15 * 60,
        });
        return nextResponse;
      }
    }

    const data = await response.text();
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete("set-cookie");
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");
    responseHeaders.set("X-Proxy", "true");

    return new NextResponse(data, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error(`[proxy] ERROR`, err);
    return NextResponse.json(
      {
        error: {
          code: "PROXY_ERROR",
          message: `Erro no proxy: ${err instanceof Error ? err.message : "unknown"}`,
        },
      },
      { status: 500 },
    );
  }
}
