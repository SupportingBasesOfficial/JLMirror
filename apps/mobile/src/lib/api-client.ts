// @ai-context: .zero-error/architecture-map.md#ingress
// API client — fetch wrapper com interceptors de auth e refresh automatico.
// Espelha a logica do apps/web/lib/api-client.ts, adaptado para React Native.
import { apiRoutes, type RefreshResponse } from "./api-routes";
import {
  getAccessToken,
  getRefreshToken,
  saveTokens,
  clearAll,
} from "./secure-storage";

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

// Tipo para opcoes do fetch
interface ApiFetchOptions extends RequestInit {
  // Se true, nao injeta Authorization header (para login/refresh)
  skipAuth?: boolean;
}

// Faz refresh do access_token usando o refresh_token
async function doRefresh(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(apiRoutes.auth.refresh, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) return null;

    const data: RefreshResponse = await res.json();
    await saveTokens(data.access_token, data.refresh_token);
    return data.access_token;
  } catch {
    return null;
  }
}

// Garante que apenas um refresh acontece por vez (evita thundering herd)
async function refreshAccessToken(): Promise<string | null> {
  if (isRefreshing && refreshPromise) return refreshPromise;

  isRefreshing = true;
  refreshPromise = doRefresh().finally(() => {
    isRefreshing = false;
    refreshPromise = null;
  });

  return refreshPromise;
}

// Fetch wrapper com auth + refresh automatico
export async function apiFetch<T>(
  url: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { skipAuth, headers, ...rest } = options;

  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string>),
  };

  if (!skipAuth) {
    const token = await getAccessToken();
    if (token) {
      requestHeaders.Authorization = `Bearer ${token}`;
    }
  }

  const res = await fetch(url, {
    ...rest,
    headers: requestHeaders,
  });

  // Se 401 e nao estamos ja pulando auth, tenta refresh e retenta (1x)
  if (res.status === 401 && !skipAuth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      requestHeaders.Authorization = `Bearer ${newToken}`;
      const retryRes = await fetch(url, { ...rest, headers: requestHeaders });
      if (!retryRes.ok) {
        throw new ApiError(retryRes.status, await parseErrorBody(retryRes));
      }
      return parseBody<T>(retryRes);
    }

    // Refresh falhou — limpa tudo (usuario precisa logar de novo)
    await clearAll();
    throw new ApiError(401, {
      error: { code: "SESSION_EXPIRED", message: "Sessao expirada" },
    });
  }

  if (!res.ok) {
    throw new ApiError(res.status, await parseErrorBody(res));
  }

  return parseBody<T>(res);
}

// Helpers
async function parseBody<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

async function parseErrorBody(res: Response): Promise<unknown> {
  try {
    const text = await res.text();
    return text
      ? JSON.parse(text)
      : { error: { code: "UNKNOWN", message: "Erro desconhecido" } };
  } catch {
    return { error: { code: "UNKNOWN", message: "Erro desconhecido" } };
  }
}

// Error class com status code + body estruturado
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    const errBody = body as { error?: { message?: string; code?: string } };
    super(errBody?.error?.message ?? "Erro de API");
    this.name = "ApiError";
  }

  get code(): string | undefined {
    const errBody = this.body as { error?: { code?: string } };
    return errBody?.error?.code;
  }
}

// Convenience methods
export const api = {
  get: <T>(url: string, options?: ApiFetchOptions) =>
    apiFetch<T>(url, { ...options, method: "GET" }),

  post: <T>(url: string, body?: unknown, options?: ApiFetchOptions) =>
    apiFetch<T>(url, {
      ...options,
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(url: string, body?: unknown, options?: ApiFetchOptions) =>
    apiFetch<T>(url, {
      ...options,
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T>(url: string, body?: unknown, options?: ApiFetchOptions) =>
    apiFetch<T>(url, {
      ...options,
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(url: string, options?: ApiFetchOptions) =>
    apiFetch<T>(url, { ...options, method: "DELETE" }),
};
