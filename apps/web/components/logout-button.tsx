// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

export function LogoutButton({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/auth/login");
      router.refresh();
    } catch {
      router.push("/auth/login");
    }
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      data-testid="logout"
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all text-left"
      style={{
        color: loading ? "var(--text-muted)" : "var(--status-error-text)",
        cursor: loading ? "not-allowed" : "pointer",
        background: loading ? "transparent" : "var(--status-error-bg)",
        border: "1px solid var(--status-error-border)",
        justifyContent: collapsed ? "center" : "flex-start",
      }}
      onMouseEnter={(e) => {
        if (!loading) {
          e.currentTarget.style.background = "var(--status-error-border)";
          e.currentTarget.style.borderColor = "var(--status-error-text)";
        }
      }}
      onMouseLeave={(e) => {
        if (!loading) {
          e.currentTarget.style.background = "var(--status-error-bg)";
          e.currentTarget.style.borderColor = "var(--status-error-border)";
        }
      }}
    >
      <LogOut size={14} className="shrink-0" />
      <span className={collapsed ? "md:hidden" : ""}>
        {loading ? "Saindo..." : "Sair"}
      </span>
    </button>
  );
}
