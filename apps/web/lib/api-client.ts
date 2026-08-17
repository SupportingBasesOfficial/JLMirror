// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { env } from "@/env";
import { apiRoutes } from "@/lib/api-routes";

export type ApiResult<T> =
  | { data: T; error: null }
  | { data: null; error: { code: string; message: string } };

// SSR usa API_INTERNAL_URL (Docker service name), client usa NEXT_PUBLIC_API_URL
const BASE_URL =
  (typeof window === "undefined" ? process.env.API_INTERNAL_URL : null) ??
  env.NEXT_PUBLIC_API_URL;

// Para Server Components: passa cookies do request incoming
export async function serverApiGet<T>(
  path: string,
  cookieHeader?: string,
): Promise<ApiResult<T>> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (cookieHeader) {
      headers["Cookie"] = cookieHeader;
    }

    const res = await fetch(`${BASE_URL}${path}`, {
      headers,
      cache: "no-store",
    });
    const json = await res.json();
    if (!res.ok) {
      return {
        data: null,
        error: {
          code: json.error?.code ?? "UNKNOWN",
          message: json.error?.message ?? "Erro desconhecido",
        },
      };
    }
    return { data: json as T, error: null };
  } catch (error) {
    return {
      data: null,
      error: {
        code: "NETWORK_ERROR",
        message: error instanceof Error ? error.message : "Erro de rede",
      },
    };
  }
}

// Para Server Components com auth via Bearer token direto
// Em caso de 401, tenta renovar o access token usando o refresh token e refaz a request
export async function serverApiGetWithToken<T>(
  path: string,
  accessToken: string,
  refreshToken?: string,
): Promise<ApiResult<T>> {
  try {
    let res = await fetch(`${BASE_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    // Se 401 e tem refresh token, tenta renovar e refaz a request
    if (res.status === 401 && refreshToken) {
      const refreshRes = await fetch(`${BASE_URL}${apiRoutes.auth.refresh}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
        cache: "no-store",
      });

      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        const newAccessToken = refreshData.access_token as string;

        // Refaz a request original com o novo token
        res = await fetch(`${BASE_URL}${path}`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${newAccessToken}`,
          },
          cache: "no-store",
        });
      }
    }

    const json = await res.json();
    if (!res.ok) {
      return {
        data: null,
        error: {
          code: json.error?.code ?? "UNKNOWN",
          message: json.error?.message ?? "Erro desconhecido",
        },
      };
    }
    return { data: json as T, error: null };
  } catch (error) {
    return {
      data: null,
      error: {
        code: "NETWORK_ERROR",
        message: error instanceof Error ? error.message : "Erro de rede",
      },
    };
  }
}

// Cliente-side (sem auth direto — passa pelo BFF proxy)
export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    const json = await res.json();
    if (!res.ok) {
      return {
        data: null,
        error: {
          code: json.error?.code ?? "UNKNOWN",
          message: json.error?.message ?? "Erro desconhecido",
        },
      };
    }
    return { data: json as T, error: null };
  } catch (error) {
    return {
      data: null,
      error: {
        code: "NETWORK_ERROR",
        message: error instanceof Error ? error.message : "Erro de rede",
      },
    };
  }
}

export async function apiPost<T>(
  path: string,
  body: unknown,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = await res.json();
    if (!res.ok) {
      return {
        data: null,
        error: {
          code: json.error?.code ?? "UNKNOWN",
          message: json.error?.message ?? "Erro desconhecido",
        },
      };
    }
    return { data: json as T, error: null };
  } catch (error) {
    return {
      data: null,
      error: {
        code: "NETWORK_ERROR",
        message: error instanceof Error ? error.message : "Erro de rede",
      },
    };
  }
}
