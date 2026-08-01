// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { Inter, JetBrains_Mono } from "next/font/google";
import { AdminSidebar } from "@/components/admin-sidebar";
import { ClientSidebar } from "@/components/client-sidebar";
import { TopBar } from "@/components/top-bar";
import { RealtimeWrapper } from "@/components/realtime-wrapper";
import { ScopeAwareSidebar } from "@/components/scope-aware-sidebar";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RealtimeWrapper>
      <div
        className={`min-h-screen flex ${inter.variable} ${jetbrainsMono.variable}`}
        style={{
          background: "var(--surface-0)",
          fontFamily: "var(--font-inter), system-ui, sans-serif",
        }}
      >
        <ScopeAwareSidebar />
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <TopBar />
          <div style={{ animation: "fadeIn 0.2s ease-out" }}>
            {children}
          </div>
        </main>
      </div>
    </RealtimeWrapper>
  );
}
