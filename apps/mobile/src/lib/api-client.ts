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

// Mapa de codigos de erro da API para mensagens amigaveis em portugues
const ERROR_CODE_MESSAGES: Record<string, string> = {
  // Auth
  SESSION_EXPIRED: "Sua sessao expirou. Faca login novamente.",
  INVALID_CREDENTIALS: "Email ou senha incorretos.",
  ACCOUNT_LOCKED:
    "Conta bloqueada por tentativas invalidas. Tente novamente mais tarde.",
  ACCOUNT_DISABLED: "Conta desativada. Contate o administrador.",
  EMAIL_NOT_VERIFIED: "Email nao verificado. Verifique sua caixa de entrada.",
  REFRESH_TOKEN_INVALID: "Sessao invalida. Faca login novamente.",
  MFA_REQUIRED: "Autenticacao de dois fatores necessaria.",
  MFA_INVALID: "Codigo MFA invalido.",

  // Permissoes
  ACCESS_DENIED: "Voce nao tem permissao para realizar esta acao.",
  INSUFFICIENT_PERMISSIONS: "Permissoes insuficientes para este recurso.",
  TENANT_MISMATCH: "Recurso nao pertence a sua organizacao.",
  RESOURCE_FORBIDDEN: "Acesso negado a este recurso.",

  // Validacao
  VALIDATION_ERROR: "Dados invalidos. Verifique os campos e tente novamente.",
  INVALID_INPUT: "Entrada invalida.",
  DUPLICATE_ENTRY: "Registro duplicado. Este item ja existe.",
  NOT_FOUND: "Recurso nao encontrado.",
  ALREADY_EXISTS: "Este item ja existe.",

  // Rate limiting
  RATE_LIMIT_EXCEEDED: "Muitas requisicoes. Aguarde alguns instantes.",
  QUOTA_EXCEEDED: "Cota de uso excedida.",

  // Zabbix
  ZABBIX_UNAVAILABLE: "Servidor Zabbix indisponivel. Tente novamente.",
  ZABBIX_AUTH_FAILED: "Falha de autenticacao com o Zabbix.",
  ZABBIX_TIMEOUT: "Tempo limite excedido ao consultar o Zabbix.",

  // Infrastructure
  DATABASE_ERROR: "Erro no banco de dados. Tente novamente.",
  INTERNAL_ERROR: "Erro interno do servidor. Tente novamente.",
  SERVICE_UNAVAILABLE: "Servico temporariamente indisponivel.",
  NETWORK_ERROR: "Erro de rede. Verifique sua conexao.",
  TIMEOUT: "Tempo limite excedido. Tente novamente.",

  // Tickets
  TICKET_NOT_FOUND: "Ticket nao encontrado.",
  TICKET_CLOSED: "Ticket ja fechado. Nao e possivel modificar.",
  CATEGORY_IN_USE: "Categoria em uso. Nao pode ser excluida.",

  // Profile
  PASSWORD_TOO_WEAK:
    "Senha muito fraca. Use pelo menos 8 caracteres com letras e numeros.",
  PASSWORD_REUSE: "Nao e possivel reutilizar a senha atual.",
  AVATAR_TOO_LARGE: "Avatar muito grande. Maximo 2MB.",
};

// Mapa de status HTTP para mensagens padrao
const HTTP_STATUS_MESSAGES: Record<number, string> = {
  400: "Requisicao invalida.",
  401: "Nao autenticado. Faca login.",
  403: "Acesso negado.",
  404: "Recurso nao encontrado.",
  408: "Tempo limite excedido.",
  409: "Conflito. Recurso ja existe.",
  422: "Dados invalidos.",
  429: "Muitas requisicoes. Aguarde.",
  500: "Erro interno do servidor.",
  502: "Servidor indisponivel.",
  503: "Servico indisponivel temporariamente.",
  504: "Gateway timeout.",
};

// Retorna mensagem de erro amigavel em portugues para qualquer erro
export function getFriendlyErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    // Prioriza codigo de erro especifico da API
    if (err.code && ERROR_CODE_MESSAGES[err.code]) {
      return ERROR_CODE_MESSAGES[err.code]!;
    }
    // Fallback para mensagem do body
    if (err.message && err.message !== "Erro de API") {
      return err.message;
    }
    // Fallback para status HTTP
    if (HTTP_STATUS_MESSAGES[err.status]) {
      return HTTP_STATUS_MESSAGES[err.status]!;
    }
    return `Erro ${err.status}`;
  }

  if (err instanceof TypeError) {
    // Erro de rede (fetch falhou)
    return "Erro de rede. Verifique sua conexao com a internet.";
  }

  if (err instanceof Error) {
    return err.message;
  }

  return "Erro inesperado. Tente novamente.";
}

// Retorna true se o erro indica que o usuario precisa re-autenticar
export function isAuthError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  return (
    err.status === 401 ||
    err.code === "SESSION_EXPIRED" ||
    err.code === "INVALID_CREDENTIALS" ||
    err.code === "REFRESH_TOKEN_INVALID"
  );
}

// Retorna true se o erro indica falta de permissao
export function isPermissionError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  return (
    err.status === 403 ||
    err.code === "ACCESS_DENIED" ||
    err.code === "INSUFFICIENT_PERMISSIONS" ||
    err.code === "TENANT_MISMATCH" ||
    err.code === "RESOURCE_FORBIDDEN"
  );
}

// Retorna true se o erro e de validacao (400/422)
export function isValidationError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  return (
    err.status === 400 ||
    err.status === 422 ||
    err.code === "VALIDATION_ERROR" ||
    err.code === "INVALID_INPUT"
  );
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
