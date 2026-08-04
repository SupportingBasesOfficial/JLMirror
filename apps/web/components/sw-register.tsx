// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useEffect } from "react";

// Registra o service worker e gerencia atualizacoes
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Registra apenas em producao ou se explicitamente habilitado
    const isDev = process.env.NODE_ENV === "development";
    if (isDev && !localStorage.getItem("sw-dev-enabled")) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        // Verifica atualizacoes a cada 1 hora
        setInterval(() => reg.update(), 60 * 60 * 1000);

        // Listener para nova versao do SW
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // Nova versao disponivel — recarrega para ativar
              window.location.reload();
            }
          });
        });
      })
      .catch(() => {
        // Silencioso — SW e opcional
      });

    // Listener para controller change (nova versao ativada)
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
  }, []);

  return null;
}
