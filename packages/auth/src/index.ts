import jwt from "jsonwebtoken";
import { authenticator } from "otplib";
import crypto from "node:crypto";
import { cacheGet, cacheSet, cacheDel } from "@repo/cache";

// Tipos de payload do JWT
export interface JwtPayload {
  sub: string;
  tenant_id: string;
  roles: string[];
  scope: "global" | "tenant";
  tenant_ids?: string[];
  type: "access" | "refresh";
  jti: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

interface SignOptions {
  sub: string;
  tenant_id: string;
  roles: string[];
  scope: "global" | "tenant";
  tenant_ids?: string[];
}

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "30d";

function getPrivateKey(): string {
  const key = process.env.JWT_PRIVATE_KEY;
  if (!key) throw new Error("JWT_PRIVATE_KEY não configurado");
  return key;
}

function getPublicKey(): string {
  const key = process.env.JWT_PUBLIC_KEY;
  if (!key) throw new Error("JWT_PUBLIC_KEY não configurado");
  return key;
}

function getIssuer(): string {
  return process.env.JWT_ISSUER ?? "jlmirror";
}

function getAudience(): string {
  return process.env.JWT_AUDIENCE ?? "jlmirror-api";
}

// Assina access token JWT (RS256)
export function signAccessToken(opts: SignOptions): string {
  const jti = crypto.randomUUID();
  return jwt.sign(
    { type: "access", jti, tenant_id: opts.tenant_id, roles: opts.roles, scope: opts.scope, ...(opts.tenant_ids ? { tenant_ids: opts.tenant_ids } : {}) },
    getPrivateKey(),
    {
      algorithm: "RS256",
      expiresIn: ACCESS_TOKEN_TTL,
      issuer: getIssuer(),
      audience: getAudience(),
      subject: opts.sub,
    } as jwt.SignOptions,
  );
}

// Assina refresh token JWT (RS256)
export function signRefreshToken(opts: SignOptions): string {
  const jti = crypto.randomUUID();
  return jwt.sign(
    { type: "refresh", jti, tenant_id: opts.tenant_id, roles: opts.roles, scope: opts.scope, ...(opts.tenant_ids ? { tenant_ids: opts.tenant_ids } : {}) },
    getPrivateKey(),
    {
      algorithm: "RS256",
      expiresIn: REFRESH_TOKEN_TTL,
      issuer: getIssuer(),
      audience: getAudience(),
      subject: opts.sub,
    } as jwt.SignOptions,
  );
}

// Verifica e decodifica token JWT
export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, getPublicKey(), {
    algorithms: ["RS256"],
    issuer: getIssuer(),
    audience: getAudience(),
  }) as jwt.JwtPayload;

  const record = decoded as Record<string, unknown>;
  return {
    sub: decoded.sub as string,
    tenant_id: record.tenant_id as string,
    roles: record.roles as string[],
    scope: (record.scope as "global" | "tenant") ?? "tenant",
    ...(record.tenant_ids ? { tenant_ids: record.tenant_ids as string[] } : {}),
    type: record.type as "access" | "refresh",
    jti: decoded.jti as string,
    iat: decoded.iat,
    exp: decoded.exp,
    iss: decoded.iss,
    aud: decoded.aud as string | undefined,
  };
}

// Armazena jti do refresh token no Redis para validacao posterior
export async function storeRefreshJti(jti: string): Promise<void> {
  await cacheSet(`refresh:jti:${jti}`, "1", 30 * 24 * 60 * 60);
}

// Verifica se o jti foi revogado
export async function isTokenRevoked(jti: string): Promise<boolean> {
  const revoked = await cacheGet(`revoked:jti:${jti}`);
  return revoked === "1";
}

// Revoga um token removendo seu jti do Redis
export async function revokeToken(jti: string, ttlSeconds: number): Promise<void> {
  await cacheSet(`revoked:jti:${jti}`, "1", ttlSeconds);
  await cacheDel(`refresh:jti:${jti}`);
}

// Verifica se o jti do refresh token existe no Redis (token valido)
export async function isRefreshJtiValid(jti: string): Promise<boolean> {
  const exists = await cacheGet(`refresh:jti:${jti}`);
  return exists === "1";
}

// TOTP — setup e verificacao
export function generateTotpSetup(email: string): { secret: string; otpauthUrl: string } {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(email, "JLMIRROR", secret);
  return { secret, otpauthUrl };
}

export function verifyTotpCode(secret: string, code: string): boolean {
  try {
    return authenticator.verify({ token: code, secret });
  } catch {
    return false;
  }
}

// Hash de codigos de recuperacao MFA
export async function hashRecoveryCodes(codes: string[]): Promise<string[]> {
  return Promise.all(
    codes.map(async (code) => {
      const hash = crypto.createHash("sha256").update(code).digest("hex");
      return hash;
    }),
  );
}

export async function verifyRecoveryCode(
  hashedCode: string,
  inputCode: string,
): Promise<boolean> {
  const inputHash = crypto.createHash("sha256").update(inputCode).digest("hex");
  return inputHash === hashedCode;
}

// Checker de permissoes com cache em memoria
export async function getPermissionChecker(
  userId: string,
  roles: string[],
  fetcher: (userId: string) => Promise<string[]>,
): Promise<(permission: string) => boolean> {
  // Admin tem todas as permissoes (global:admin, jl:superadmin, admin, super_admin)
  const isAdmin = roles.some(r => r === "admin" || r === "super_admin" || r === "jl:superadmin" || r.endsWith(":admin") || r.startsWith("admin:"));
  if (isAdmin) {
    return () => true;
  }

  // Busca permissoes do DB
  const permissions = await fetcher(userId);
  const permSet = new Set(permissions);

  return (permission: string) => {
    // Wildcard *:* tem acesso a tudo
    if (permSet.has("*:*")) return true;
    // Verifica permissao exata
    if (permSet.has(permission)) return true;
    // Verifica wildcard de dominio (ex: zabbix:*:read)
    const [domain, , action] = permission.split(":");
    if (permSet.has(`${domain}:*:*`)) return true;
    if (permSet.has(`${domain}:*:${action}`)) return true;
    return false;
  };
}

// ========== Google OAuth Provider ==========
export class GoogleOAuthProvider {
  private clientId: string | undefined;
  private clientSecret: string | undefined;
  private redirectUri: string | undefined;

  constructor() {
    this.clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    this.clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    this.redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret && this.redirectUri);
  }

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId ?? "",
      redirect_uri: this.redirectUri ?? "",
      response_type: "code",
      scope: "openid email profile",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<{ access_token: string; id_token: string }> {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.clientId ?? "",
        client_secret: this.clientSecret ?? "",
        redirect_uri: this.redirectUri ?? "",
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) throw new Error("Falha ao trocar code por tokens");
    return res.json() as Promise<{ access_token: string; id_token: string }>;
  }

  async getUserInfo(accessToken: string): Promise<{ email: string; name: string }> {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error("Falha ao obter dados do usuario");
    return res.json() as Promise<{ email: string; name: string }>;
  }
}

// ========== LDAP Auth Provider ==========
export class LdapAuthProvider {
  private ldapUrl: string | undefined;
  private baseDn: string | undefined;

  constructor() {
    this.ldapUrl = process.env.LDAP_URL;
    this.baseDn = process.env.LDAP_BASE_DN;
  }

  isConfigured(): boolean {
    return !!(this.ldapUrl && this.baseDn);
  }

  async authenticate(username: string, password: string): Promise<{ dn: string; email: string } | null> {
    // Implementacao LDAP simplificada — usa bind simples
    // Em producao, usar ldapjs com TLS
    if (!this.isConfigured()) return null;

    const userDn = `uid=${username},${this.baseDn}`;
    // Placeholder — integracao real depende do schema LDAP do cliente
    throw new Error("LDAP auth requer configuracao especifica do cliente");
  }
}
