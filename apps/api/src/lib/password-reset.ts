// @ai-context: .zero-error/architecture-map.md#logic-core
// @ai-restriction: .zero-error/code-standards.md#error-handling
import crypto from "node:crypto";
import { query } from "@repo/db";
import { logger } from "@repo/logger";
import { sendSmtpEmail } from "./notification-delivery.js";

// Logica de negocio do fluxo "esqueci minha senha" — extraida das rotas
// para manter Ingress fino (rotas delegam para ca).

const TOKEN_TTL_MINUTES = 60;

interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  from: string;
  useTls: boolean;
}

// Resolve config SMTP: env vars do sistema primeiro, fallback para
// tenant_settings do tenant do usuario (smtp_enabled = true).
async function resolveSmtpConfig(userId: string): Promise<SmtpConfig | null> {
  if (process.env.SMTP_HOST && process.env.SMTP_FROM_EMAIL) {
    return {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      username: process.env.SMTP_USERNAME ?? "",
      password: process.env.SMTP_PASSWORD ?? "",
      from: process.env.SMTP_FROM_EMAIL,
      useTls: process.env.SMTP_USE_TLS !== "false",
    };
  }

  const result = await query<{
    smtp_host: string | null;
    smtp_port: number | null;
    smtp_username: string | null;
    smtp_password_encrypted: string | null;
    smtp_from_email: string | null;
    smtp_use_tls: boolean | null;
  }>(
    `SELECT ts.smtp_host, ts.smtp_port, ts.smtp_username,
       ts.smtp_password_encrypted, ts.smtp_from_email, ts.smtp_use_tls
     FROM public.tenant_settings ts
     JOIN public.tenant_users tu ON tu.tenant_id = ts.tenant_id
     WHERE tu.user_id = $1 AND ts.smtp_enabled = true
       AND ts.smtp_host IS NOT NULL AND ts.smtp_from_email IS NOT NULL
     LIMIT 1`,
    [userId],
  );

  const row = result.data?.rows[0];
  if (!row?.smtp_host || !row.smtp_from_email) return null;

  return {
    host: row.smtp_host,
    port: row.smtp_port ?? 587,
    username: row.smtp_username ?? "",
    password: row.smtp_password_encrypted ?? "",
    from: row.smtp_from_email,
    useTls: row.smtp_use_tls ?? true,
  };
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Cria token de reset e envia email. Retorna sempre sucesso silencioso
// (anti user-enumeration) — falhas sao apenas logadas.
export async function requestPasswordReset(
  email: string,
  requestIp: string | null,
): Promise<void> {
  const userResult = await query<{
    id: string;
    full_name: string | null;
    is_active: boolean;
  }>("SELECT id, full_name, is_active FROM public.users WHERE email = $1", [
    email,
  ]);

  const user = userResult.data?.rows[0];
  if (!user || !user.is_active) {
    // Nao revela se o email existe — resposta identica em ambos os casos
    logger.info("Solicitacao de reset para email inexistente ou inativo", {
      email,
    });
    return;
  }

  // Invalida tokens anteriores nao usados do mesmo usuario
  await query(
    "DELETE FROM public.password_reset_tokens WHERE user_id = $1 AND used_at IS NULL",
    [user.id],
  );

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);

  await query(
    `INSERT INTO public.password_reset_tokens (user_id, token_hash, expires_at, requested_ip)
     VALUES ($1, $2, timezone('utc'::text, now()) + INTERVAL '${TOKEN_TTL_MINUTES} minutes', $3)`,
    [user.id, tokenHash, requestIp],
  );

  const smtp = await resolveSmtpConfig(user.id);
  if (!smtp) {
    logger.error("SMTP nao configurado — email de reset nao enviado", {
      userId: user.id,
    });
    return;
  }

  const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
  const resetLink = `${webUrl}/auth/reset-password?token=${rawToken}`;
  const displayName = user.full_name ?? email;

  const sendResult = await sendSmtpEmail({
    host: smtp.host,
    port: smtp.port,
    username: smtp.username,
    password: smtp.password,
    from: smtp.from,
    to: email,
    subject: "JLMIRROR — Recuperação de Senha",
    body: [
      `Olá, ${displayName}!`,
      "",
      "Recebemos uma solicitação para redefinir sua senha no JLMIRROR.",
      "",
      `Acesse o link abaixo para criar uma nova senha (válido por ${TOKEN_TTL_MINUTES} minutos):`,
      resetLink,
      "",
      "Se você não solicitou esta recuperação, ignore este email — sua senha permanece inalterada.",
    ].join("\n"),
    useTls: smtp.useTls,
  });

  if (!sendResult.success) {
    logger.error("Falha ao enviar email de reset de senha", {
      userId: user.id,
      error: sendResult.error,
    });
  } else {
    logger.info("Email de reset de senha enviado", { userId: user.id });
  }
}

// Valida token e retorna user_id — ou null se invalido/expirado/usado.
export async function validateResetToken(
  token: string,
): Promise<string | null> {
  const tokenHash = hashToken(token);

  const result = await query<{ user_id: string }>(
    `SELECT user_id FROM public.password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL
       AND expires_at > timezone('utc'::text, now())
     LIMIT 1`,
    [tokenHash],
  );

  return result.data?.rows[0]?.user_id ?? null;
}

// Consome o token: marca como usado, atualiza a senha e revoga sessoes.
export async function consumeResetToken(
  token: string,
  newPasswordHash: string,
): Promise<{ success: boolean; userId: string | null }> {
  const userId = await validateResetToken(token);
  if (!userId) {
    return { success: false, userId: null };
  }

  const tokenHash = hashToken(token);

  await query(
    "UPDATE public.password_reset_tokens SET used_at = timezone('utc'::text, now()) WHERE token_hash = $1",
    [tokenHash],
  );

  await query(
    "UPDATE public.users SET password_hash = $1, must_change_password = false WHERE id = $2",
    [newPasswordHash, userId],
  );

  // Revoga todas as sessoes — forca re-login com a nova senha
  await query("DELETE FROM public.sessions WHERE user_id = $1", [userId]);

  return { success: true, userId };
}
