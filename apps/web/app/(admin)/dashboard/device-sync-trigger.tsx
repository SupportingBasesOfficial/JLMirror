// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useEffect, useRef } from "react";

// Dispara sync de devices do Zabbix sob demanda ao montar
// Usado no dashboard para sincronizar imediatamente sem esperar o intervalo de 5 min
export function DeviceSyncTrigger() {
  const hasSynced = useRef(false);

  useEffect(() => {
    if (hasSynced.current) return;
    hasSynced.current = true;

    fetch("/api/v1/dashboard/sync-devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
      .then(() => {
        // Sync disparado — o próximo refresh do dashboard já terá dados
      })
      .catch(() => {
        // Erro silencioso — o sync em background continua rodando a cada 5 min
      });
  }, []);

  return null;
}
