// @ai-context: .zero-error/architecture-map.md#ingress
// Auth context — provider de autenticacao para o app mobile.
// Espelha a logica do apps/web/lib/use-auth.ts, adaptado para React Native.
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { api } from "./api-client";
import {
  apiRoutes,
  type LoginResponse,
  type AuthMeResponse,
  type AuthUser,
  type TenantMembership,
} from "./api-routes";
import {
  saveTokens,
  getAccessToken,
  getRefreshToken,
  saveUserData,
  clearAll,
} from "./secure-storage";

interface AuthState {
  user: AuthUser | null;
  tenants: TenantMembership[];
  scope: "global" | "tenant" | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (
    email: string,
    password: string,
    deviceFingerprint?: string,
  ) => Promise<LoginResponse>;
  verifyMfa: (challengeToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    tenants: [],
    scope: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // Hidrata estado na inicializacao — verifica se tem token salvo
  useEffect(() => {
    hydrateAuth();
  }, []);

  async function hydrateAuth(): Promise<void> {
    try {
      const token = await getAccessToken();
      if (!token) {
        setState({
          user: null,
          tenants: [],
          scope: null,
          isLoading: false,
          isAuthenticated: false,
        });
        return;
      }

      // Tenta buscar /auth/me para validar o token
      try {
        const me: AuthMeResponse = await api.get(apiRoutes.auth.me);
        setState({
          user: me.user,
          tenants: me.tenants,
          scope: me.scope,
          isLoading: false,
          isAuthenticated: true,
        });
      } catch {
        // Token invalido — tenta refresh
        const refreshToken = await getRefreshToken();
        if (refreshToken) {
          const res = await api.post<LoginResponse>(
            apiRoutes.auth.refresh,
            { refresh_token: refreshToken },
            { skipAuth: true },
          );
          await saveTokens(res.access_token, res.refresh_token);
          await saveUserData(res.user);
          setState({
            user: res.user,
            tenants: res.tenants,
            scope: res.tenants[0]?.scope ?? "tenant",
            isLoading: false,
            isAuthenticated: true,
          });
        } else {
          await clearAll();
          setState({
            user: null,
            tenants: [],
            scope: null,
            isLoading: false,
            isAuthenticated: false,
          });
        }
      }
    } catch {
      setState({
        user: null,
        tenants: [],
        scope: null,
        isLoading: false,
        isAuthenticated: false,
      });
    }
  }

  const login = useCallback(
    async (
      email: string,
      password: string,
      deviceFingerprint?: string,
    ): Promise<LoginResponse> => {
      const res = await api.post<LoginResponse>(
        apiRoutes.auth.login,
        { email, password, device_fingerprint: deviceFingerprint },
        { skipAuth: true },
      );

      // Se MFA requerido, nao salva tokens — retorna para a tela de MFA
      if (res.mfa_required) {
        return res;
      }

      // Login direto (sem MFA) — salva tokens e atualiza estado
      await saveTokens(res.access_token, res.refresh_token);
      await saveUserData(res.user);
      setState({
        user: res.user,
        tenants: res.tenants,
        scope: res.tenants[0]?.scope ?? "tenant",
        isLoading: false,
        isAuthenticated: true,
      });

      return res;
    },
    [],
  );

  const verifyMfa = useCallback(
    async (challengeToken: string, code: string): Promise<void> => {
      const res = await api.post<LoginResponse>(
        apiRoutes.mfa.verify,
        { challenge_token: challengeToken, code },
        { skipAuth: true },
      );

      await saveTokens(res.access_token, res.refresh_token);
      await saveUserData(res.user);
      setState({
        user: res.user,
        tenants: res.tenants,
        scope: res.tenants[0]?.scope ?? "tenant",
        isLoading: false,
        isAuthenticated: true,
      });
    },
    [],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await api.post(apiRoutes.auth.logout);
    } catch {
      // Ignora erro de logout no servidor — limpa local de qualquer forma
    }
    await clearAll();
    setState({
      user: null,
      tenants: [],
      scope: null,
      isLoading: false,
      isAuthenticated: false,
    });
  }, []);

  const refreshUser = useCallback(async (): Promise<void> => {
    try {
      const me: AuthMeResponse = await api.get(apiRoutes.auth.me);
      setState((prev) => ({
        ...prev,
        user: me.user,
        tenants: me.tenants,
        scope: me.scope,
      }));
    } catch {
      // Silencioso — nao derruba o usuario por erro de refresh
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ ...state, login, verifyMfa, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
