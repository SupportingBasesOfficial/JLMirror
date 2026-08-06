// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useState, useEffect } from "react";
import { Download, X, Smartphone } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Verifica se ja esta instalado (standalone)
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    // Verifica se o usuario ja dispensou o prompt
    const dismissed = localStorage.getItem("pwa-install-dismissed");
    if (dismissed === "true") return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // Detecta app instalado
    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setShowPrompt(false);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setIsInstalled(true);
    }
    setShowPrompt(false);
    setDeferredPrompt(null);
  }

  function handleDismiss() {
    setShowPrompt(false);
    localStorage.setItem("pwa-install-dismissed", "true");
  }

  if (!showPrompt || isInstalled) return null;

  return (
    <div
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-sm rounded-xl p-4"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border-default)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex items-center justify-center rounded-lg shrink-0"
          style={{
            width: 40,
            height: 40,
            background: "var(--brand-primary)",
          }}
        >
          <Smartphone size={20} style={{ color: "var(--surface-0)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3
            className="text-sm font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Instalar App
          </h3>
          <p
            className="text-[12px] mt-0.5"
            style={{ color: "var(--text-muted)" }}
          >
            Acesso rápido direto da tela inicial
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={handleInstall}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-bold"
              style={{
                background: "var(--brand-primary)",
                color: "var(--surface-0)",
                cursor: "pointer",
              }}
            >
              <Download size={12} />
              Instalar
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="px-3 py-1.5 rounded-md text-[12px]"
              style={{
                color: "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              Agora não
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0"
          style={{ color: "var(--text-muted)", cursor: "pointer" }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
