import type { ReactNode } from "react";

interface DataTableProps {
  children: ReactNode;
  className?: string;
}

export function DataTable({ children, className = "" }: DataTableProps) {
  return (
    <div
      className={`rounded-xl overflow-hidden ${className}`}
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border-default)",
      }}
    >
      <div className="overflow-x-auto">
        <table className="w-full">{children}</table>
      </div>
    </div>
  );
}

export function TableHeader({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
        {children}
      </tr>
    </thead>
  );
}

export function TableHeaderCell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <th
      className={`text-left text-xs font-semibold uppercase tracking-wider px-4 py-3 ${className}`}
      style={{ color: "var(--text-muted)" }}
    >
      {children}
    </th>
  );
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TableRow({ children, onClick, hover = true }: { children: ReactNode; onClick?: () => void; hover?: boolean }) {
  return (
    <tr
      onClick={onClick}
      style={{
        borderBottom: "1px solid var(--border-subtle)",
        cursor: onClick ? "pointer" : "default",
        transition: hover ? "background 0.15s" : undefined,
      }}
      onMouseEnter={hover ? (e) => { e.currentTarget.style.background = "var(--surface-hover)"; } : undefined}
      onMouseLeave={hover ? (e) => { e.currentTarget.style.background = "transparent"; } : undefined}
    >
      {children}
    </tr>
  );
}

export function TableCell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <td className={`px-4 py-3 text-sm ${className}`} style={{ color: "var(--text-secondary)" }}>
      {children}
    </td>
  );
}
