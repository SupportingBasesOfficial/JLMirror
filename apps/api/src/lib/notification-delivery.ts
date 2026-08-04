// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import nodemailer from "nodemailer";
import { sendPushToUser } from "./web-push.js";

// Modulo central de entrega de notificacoes — extraido de routes/notifications.ts
// para eliminar dynamic import no alerting-engine.ts
// Usa nodemailer para SMTP com suporte completo a TLS/SSL (STARTTLS e implicit TLS)

export async function sendWebhook(
  url: string,
  payload: Record<string, unknown>,
): Promise<{ success: boolean; statusCode: number; error: string | null }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    return {
      success: res.ok,
      statusCode: res.status,
      error: res.ok ? null : `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      success: false,
      statusCode: 0,
      error: err instanceof Error ? err.message : "Erro desconhecido",
    };
  }
}

export async function sendSmtpEmail(options: {
  host: string;
  port: number;
  username: string;
  password: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  useTls: boolean;
}): Promise<{ success: boolean; error: string | null }> {
  try {
    const transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.port === 465,
      auth:
        options.username && options.password
          ? { user: options.username, pass: options.password }
          : undefined,
      requireTLS: options.useTls && options.port !== 465,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000,
    });

    await transporter.sendMail({
      from: options.from,
      to: options.to,
      subject: options.subject,
      text: options.body,
      html: options.body.replace(/\n/g, "<br>"),
    });

    transporter.close();
    return { success: true, error: null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro desconhecido no SMTP",
    };
  }
}

// Envia mensagem WhatsApp via Evolution API
export async function sendWhatsAppMessage(
  apiUrl: string,
  apiKey: string | undefined,
  instance: string | undefined,
  phone: string,
  message: string,
): Promise<{ success: boolean; statusCode: number; error: string | null }> {
  try {
    // Evolution API v2: POST /message/sendText/{instance}
    const url = `${apiUrl.replace(/\/$/, "")}/message/sendText/${instance ?? "default"}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["apikey"] = apiKey;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        number: phone,
        textMessage: { text: message },
      }),
      signal: AbortSignal.timeout(15000),
    });

    return {
      success: res.ok,
      statusCode: res.status,
      error: res.ok ? null : `Evolution API HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      success: false,
      statusCode: 0,
      error:
        err instanceof Error ? err.message : "Erro desconhecido no WhatsApp",
    };
  }
}

export async function deliverNotification(
  channelType: string,
  config: Record<string, unknown>,
  subject: string,
  body: string,
): Promise<{ success: boolean; statusCode: number; error: string | null }> {
  switch (channelType) {
    case "slack": {
      const webhookUrl = config.webhook_url as string;
      if (!webhookUrl)
        return {
          success: false,
          statusCode: 0,
          error: "Webhook URL nao configurado",
        };
      return sendWebhook(webhookUrl, { text: `${subject}\n${body}` });
    }
    case "discord": {
      const webhookUrl = config.webhook_url as string;
      if (!webhookUrl)
        return {
          success: false,
          statusCode: 0,
          error: "Webhook URL nao configurado",
        };
      return sendWebhook(webhookUrl, { content: `${subject}\n${body}` });
    }
    case "telegram": {
      const botToken = config.bot_token as string;
      const chatId = config.chat_id as string;
      if (!botToken || !chatId)
        return {
          success: false,
          statusCode: 0,
          error: "Bot token ou chat ID nao configurado",
        };
      const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
      return sendWebhook(telegramUrl, {
        chat_id: chatId,
        text: `${subject}\n${body}`,
        parse_mode: "HTML",
      });
    }
    case "teams": {
      const webhookUrl = config.webhook_url as string;
      if (!webhookUrl)
        return {
          success: false,
          statusCode: 0,
          error: "Webhook URL nao configurado",
        };
      return sendWebhook(webhookUrl, { text: `${subject}\n${body}` });
    }
    case "email": {
      const host = config.smtp_host as string;
      const port = config.smtp_port as number;
      const username = config.smtp_username as string;
      const password = config.smtp_password as string;
      const from = config.smtp_from_email as string;
      const to = config.recipient_email as string;
      if (!host || !from || !to)
        return {
          success: false,
          statusCode: 0,
          error: "Configuracao SMTP incompleta",
        };
      const result = await sendSmtpEmail({
        host,
        port: port ?? 587,
        username: username ?? "",
        password: password ?? "",
        from,
        to,
        subject,
        body,
        useTls: (config.smtp_use_tls as boolean) ?? true,
      });
      return {
        success: result.success,
        statusCode: result.success ? 200 : 0,
        error: result.error,
      };
    }
    case "webhook": {
      const webhookUrl = config.url as string;
      if (!webhookUrl)
        return {
          success: false,
          statusCode: 0,
          error: "URL do webhook nao configurado",
        };
      return sendWebhook(webhookUrl, {
        subject,
        body,
        timestamp: new Date().toISOString(),
      });
    }
    case "web_push": {
      const userId = config.user_id as string;
      if (!userId)
        return {
          success: false,
          statusCode: 0,
          error: "user_id nao configurado para web_push",
        };
      const result = await sendPushToUser(userId, {
        title: subject,
        body: body.substring(0, 200),
        icon: "/icon.svg",
        badge: "/icon.svg",
        tag: "alert",
        data: { type: "alert", subject },
      });
      return {
        success: result.sent > 0,
        statusCode: result.sent > 0 ? 200 : 0,
        error:
          result.failed > 0 ? `${result.failed} inscricoes falharam` : null,
      };
    }
    case "whatsapp": {
      const apiUrl = config.evolution_api_url as string;
      const apiKey = config.evolution_api_key as string;
      const instance = config.instance as string;
      const phone = config.phone as string;
      if (!apiUrl || !phone)
        return {
          success: false,
          statusCode: 0,
          error: "Evolution API URL e telefone sao obrigatorios",
        };
      return sendWhatsAppMessage(
        apiUrl,
        apiKey,
        instance,
        phone,
        `${subject}\n\n${body}`,
      );
    }
    default:
      return {
        success: false,
        statusCode: 0,
        error: `Tipo de canal nao suportado: ${channelType}`,
      };
  }
}
