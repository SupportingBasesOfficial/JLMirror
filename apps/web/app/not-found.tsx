// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import Link from "next/link";

export default function NotFound() {
  return (
    <main
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{
        background: "#0B1015",
        fontFamily: "'JetBrains Mono','Consolas',monospace",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(27, 168, 152, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(27, 168, 152, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          width: 500,
          height: 500,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(27, 168, 152, 0.06) 0%, transparent 70%)",
        }}
      />
      <div className="relative z-10 w-full max-w-md text-center space-y-6" style={{ animation: "fadeIn 0.3s ease-out" }}>
        <div className="flex justify-center">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#1BA898" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="8" y1="12" x2="16" y2="12" />
            <line x1="12" y1="8" x2="12" y2="16" />
          </svg>
        </div>
        <div className="space-y-2">
          <h1 className="text-5xl font-bold" style={{ color: "#1BA898" }}>
            404
          </h1>
          <p className="text-sm" style={{ color: "#6E7F88" }}>
            A página que você procura não existe ou foi movida.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-block px-4 py-2 rounded-md text-sm font-bold transition-all hover:scale-105 no-underline"
          style={{
            background: "#1BA89815",
            border: "1px solid #1BA89855",
            color: "#1BA898",
          }}
        >
          Voltar para o Dashboard
        </Link>
      </div>
    </main>
  );
}
