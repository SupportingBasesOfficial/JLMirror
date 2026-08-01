// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";

// Replica da função zabbixErrorResponse do zabbix.ts para testar classificacao
function zabbixErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro desconhecido";
  const lowerMsg = message.toLowerCase();

  if (lowerMsg.includes("timeout") || lowerMsg.includes("etimedout") || lowerMsg.includes("aborted")) {
    return { error: { code: "ZABBIX_TIMEOUT", message: "Timeout na comunicação com Zabbix" } };
  }
  if (lowerMsg.includes("econnrefused") || lowerMsg.includes("enotfound") || lowerMsg.includes("econnreset")) {
    return { error: { code: "ZABBIX_UNREACHABLE", message: "Servidor Zabbix indisponível" } };
  }
  if (lowerMsg.includes("unauthorized") || lowerMsg.includes("forbidden") || lowerMsg.includes("403")) {
    return { error: { code: "ZABBIX_AUTH_ERROR", message: "Token Zabbix inválido ou sem permissão" } };
  }
  return { error: { code: "ZABBIX_API_ERROR", message } };
}

describe("zabbixErrorResponse — classificação de erros", () => {
  it("classifica timeout corretamente", () => {
    const result = zabbixErrorResponse(new Error("Request timeout after 5000ms"));
    expect(result.error.code).toBe("ZABBIX_TIMEOUT");
  });

  it("classifica ETIMEDOUT corretamente", () => {
    const result = zabbixErrorResponse(new Error("connect ETIMEDOUT 10.0.0.1:80"));
    expect(result.error.code).toBe("ZABBIX_TIMEOUT");
  });

  it("classifica aborted corretamente", () => {
    const result = zabbixErrorResponse(new Error("The user aborted a request"));
    expect(result.error.code).toBe("ZABBIX_TIMEOUT");
  });

  it("classifica ECONNREFUSED corretamente", () => {
    const result = zabbixErrorResponse(new Error("connect ECONNREFUSED 127.0.0.1:80"));
    expect(result.error.code).toBe("ZABBIX_UNREACHABLE");
  });

  it("classifica ENOTFOUND corretamente", () => {
    const result = zabbixErrorResponse(new Error("getaddrinfo ENOTFOUND zabbix.example.com"));
    expect(result.error.code).toBe("ZABBIX_UNREACHABLE");
  });

  it("classifica ECONNRESET corretamente", () => {
    const result = zabbixErrorResponse(new Error("read ECONNRESET"));
    expect(result.error.code).toBe("ZABBIX_UNREACHABLE");
  });

  it("classifica unauthorized corretamente", () => {
    const result = zabbixErrorResponse(new Error("Unauthorized access"));
    expect(result.error.code).toBe("ZABBIX_AUTH_ERROR");
  });

  it("classifica 403 corretamente", () => {
    const result = zabbixErrorResponse(new Error("HTTP 403 Forbidden"));
    expect(result.error.code).toBe("ZABBIX_AUTH_ERROR");
  });

  it("classifica forbidden corretamente", () => {
    const result = zabbixErrorResponse(new Error("Forbidden: insufficient permissions"));
    expect(result.error.code).toBe("ZABBIX_AUTH_ERROR");
  });

  it("classifica erro genérico como ZABBIX_API_ERROR", () => {
    const result = zabbixErrorResponse(new Error("Invalid parameters"));
    expect(result.error.code).toBe("ZABBIX_API_ERROR");
    expect(result.error.message).toBe("Invalid parameters");
  });

  it("trata erro não-Error (string)", () => {
    const result = zabbixErrorResponse("some string error");
    expect(result.error.code).toBe("ZABBIX_API_ERROR");
    expect(result.error.message).toBe("Erro desconhecido");
  });

  it("trata null/undefined", () => {
    const result = zabbixErrorResponse(null);
    expect(result.error.code).toBe("ZABBIX_API_ERROR");
    expect(result.error.message).toBe("Erro desconhecido");
  });

  it("trata objeto sem message", () => {
    const result = zabbixErrorResponse({ foo: "bar" });
    expect(result.error.code).toBe("ZABBIX_API_ERROR");
    expect(result.error.message).toBe("Erro desconhecido");
  });
});
