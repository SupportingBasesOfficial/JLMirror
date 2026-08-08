// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/zabbix-fetch";
import { useRealtime } from "@/lib/realtime-provider";

// Hook para operacoes de escrita no Zabbix que agora sao assincronas (202 + fila)
// Fluxo:
// 1. Componente chama write() — faz POST/PUT/DELETE
// 2. API responde 202 Accepted com { jobId, status: "queued" }
// 3. Hook registra callback no RealtimeProvider para o jobId
// 4. Worker processa o job e envia WebSocket zabbix_write_complete
// 5. RealtimeProvider dispara callback — hook atualiza estado para "success" ou "error"
// 6. Componente revalida dados (mutate) e mostra feedback visual

type WriteStatus = "idle" | "pending" | "success" | "error";

interface UseZabbixWriteOptions {
  // Callback chamado quando o write completa com sucesso
  onSuccess?: (result: unknown) => void;
  // Callback chamado quando o write falha
  onError?: (error: string) => void;
}

interface UseZabbixWriteResult {
  status: WriteStatus;
  error: string | null;
  jobId: string | null;
  // Executa o write — retorna true se aceito (202), false se erro de validacao
  write: (url: string, options?: RequestInit) => Promise<boolean>;
  // Reseta o estado para idle
  reset: () => void;
}

export function useZabbixWrite(
  options: UseZabbixWriteOptions = {},
): UseZabbixWriteResult {
  const [status, setStatus] = useState<WriteStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { registerWriteCallback, unregisterWriteCallback } = useRealtime();

  const write = useCallback(
    async (url: string, requestOptions?: RequestInit): Promise<boolean> => {
      setStatus("pending");
      setError(null);
      setJobId(null);

      try {
        const response = await apiFetch<{
          ok: boolean;
          jobId: string;
          status: string;
        }>(url, requestOptions);

        if (response.jobId && response.status === "queued") {
          setJobId(response.jobId);

          // Registra callback para quando o WebSocket notificar a conclusao
          registerWriteCallback(
            response.jobId,
            (writeStatus, result, writeError) => {
              if (writeStatus === "success") {
                setStatus("success");
                setError(null);
                options.onSuccess?.(result);
              } else {
                setStatus("error");
                setError(writeError ?? "Erro desconhecido");
                options.onError?.(writeError ?? "Erro desconhecido");
              }
              // Limpa o estado apos 5 segundos
              if (timeoutRef.current) clearTimeout(timeoutRef.current);
              timeoutRef.current = setTimeout(() => {
                setStatus("idle");
                setJobId(null);
              }, 5000);
            },
          );

          // Timeout de seguranca — se o WebSocket nao notificar em 30s, assume erro
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => {
            unregisterWriteCallback(response.jobId);
            setStatus("error");
            setError("Timeout aguardando confirmação do servidor");
            options.onError?.("Timeout aguardando confirmação do servidor");
          }, 30_000);

          return true;
        }

        // Se nao retornou jobId (operacao sincrona), assume sucesso
        setStatus("success");
        options.onSuccess?.(response);
        setTimeout(() => setStatus("idle"), 3000);
        return true;
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Erro na requisição");
        options.onError?.(
          err instanceof Error ? err.message : "Erro na requisição",
        );
        return false;
      }
    },
    [options, registerWriteCallback, unregisterWriteCallback],
  );

  const reset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (jobId) {
      unregisterWriteCallback(jobId);
    }
    setStatus("idle");
    setError(null);
    setJobId(null);
  }, [jobId, unregisterWriteCallback]);

  return { status, error, jobId, write, reset };
}
