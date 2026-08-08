"use client";

import React from "react";

interface ErrorInfo {
  message: string;
  stack?: string;
  componentStack?: string;
  url: string;
  route: string;
  userAgent: string;
  lastAction?: unknown;
  inputData?: unknown;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

// Captura contexto do erro para enviar ao backend
function captureErrorContext(
  error: Error,
  errorInfo: React.ErrorInfo | null,
): ErrorInfo {
  return {
    message: error.message || "Erro desconhecido",
    stack: error.stack ?? undefined,
    componentStack: errorInfo?.componentStack ?? undefined,
    url: typeof window !== "undefined" ? window.location.href : "",
    route: typeof window !== "undefined" ? window.location.pathname : "",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
  };
}

// Envia relatorio de erro para a API
async function sendErrorReport(
  errorData: ErrorInfo,
): Promise<{ ticket_number: string; ticket_id: string }> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

  const response = await fetch("/api/v1/errors/report", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      error_message: errorData.message,
      error_stack: errorData.stack,
      component_stack: errorData.componentStack,
      error_type: "ReactErrorBoundary",
      url: errorData.url,
      route: errorData.route,
      user_agent: errorData.userAgent,
      browser_info: {
        language: typeof navigator !== "undefined" ? navigator.language : "",
        platform: typeof navigator !== "undefined" ? navigator.platform : "",
        cookie_enabled:
          typeof navigator !== "undefined" ? navigator.cookieEnabled : false,
      },
      last_action: errorData.lastAction,
      input_data: errorData.inputData,
      severity: "error",
    }),
  });

  if (!response.ok) {
    throw new Error(`Falha ao enviar relatorio: ${response.status}`);
  }

  return response.json();
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo });
    console.error("[ErrorBoundary] Erro capturado:", error, errorInfo);
  }

  handleSendReport = async (): Promise<void> => {
    if (!this.state.error) return;

    const errorData = captureErrorContext(
      this.state.error,
      this.state.errorInfo,
    );

    try {
      const result = await sendErrorReport(errorData);
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
      });
      // Redireciona para o dashboard apos enviar
      if (typeof window !== "undefined") {
        alert(
          `Chamado ${result.ticket_number} criado com sucesso. Nossa equipe foi notificada.`,
        );
        window.location.href = "/dashboard";
      }
    } catch (err) {
      console.error("[ErrorBoundary] Erro ao enviar relatorio:", err);
      alert("Erro ao enviar relatorio. Tente novamente ou contate o suporte.");
    }
  };

  handleReload = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const error = this.state.error;
    const errorInfo = this.state.errorInfo;

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0, 0, 0, 0.85)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div
          style={{
            maxWidth: "600px",
            width: "90%",
            background: "#0d1117",
            border: "1px solid #f85149",
            borderRadius: "16px",
            padding: "32px",
            color: "#e6edf3",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          {/* Icone de erro */}
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              background: "rgba(248, 81, 73, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
              fontSize: "32px",
            }}
          >
            ⚠️
          </div>

          <h1
            style={{
              fontSize: "22px",
              fontWeight: 700,
              textAlign: "center",
              marginBottom: "12px",
              color: "#f85149",
            }}
          >
            Erro Inesperado
          </h1>

          <p
            style={{
              fontSize: "14px",
              textAlign: "center",
              color: "#8b949e",
              marginBottom: "24px",
              lineHeight: 1.6,
            }}
          >
            Ocorreu um erro inesperado no sistema. Todas as informacoes sobre
            este erro podem ser enviadas automaticamente para nossa equipe de
            suporte para investigacao e correcao.
          </p>

          {/* Detalhes do erro (colapsados) */}
          <details
            style={{
              marginBottom: "24px",
              background: "#161b22",
              borderRadius: "8px",
              padding: "12px",
              border: "1px solid #30363d",
            }}
          >
            <summary
              style={{
                cursor: "pointer",
                fontSize: "12px",
                color: "#8b949e",
                fontWeight: 600,
              }}
            >
              Detalhes tecnicos do erro
            </summary>
            <pre
              style={{
                fontSize: "11px",
                color: "#f85149",
                marginTop: "12px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: "200px",
                overflow: "auto",
              }}
            >
              {error?.message}
              {"\n\n"}
              {error?.stack}
              {"\n\n"}
              {errorInfo?.componentStack}
            </pre>
          </details>

          {/* Botao unico: Enviar para Suporte JL */}
          <button
            type="button"
            onClick={this.handleSendReport}
            style={{
              width: "100%",
              padding: "14px 24px",
              background: "#1f6feb",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              fontSize: "15px",
              fontWeight: 700,
              cursor: "pointer",
              transition: "background 0.2s",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "#388bfd";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "#1f6feb";
            }}
          >
            📧 Enviar para Suporte JL
          </button>

          <button
            type="button"
            onClick={this.handleReload}
            style={{
              width: "100%",
              padding: "10px 24px",
              background: "transparent",
              color: "#8b949e",
              border: "none",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
              marginTop: "8px",
            }}
          >
            Recarregar pagina
          </button>
        </div>
      </div>
    );
  }
}
