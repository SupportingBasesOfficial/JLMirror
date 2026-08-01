// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

interface GaugeProps {
  value: number;
  max?: number;
  label: string;
  color: string;
  unit?: string;
  tooltip?: {
    title: string;
    lines: string[];
  };
}

export function Gauge({ value, max = 100, label, color, unit = "%", tooltip }: GaugeProps) {
  const pct = Math.min(value / max, 1);
  const angle = pct * 180;
  const radians = (angle - 180) * (Math.PI / 180);
  const cx = 60;
  const cy = 55;
  const r = 45;
  const endX = cx + r * Math.cos(radians);
  const endY = cy + r * Math.sin(radians);
  const largeArc = angle > 180 ? 1 : 0;
  const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY}`;

  return (
    <div
      className="relative rounded-md p-2.5 flex flex-col items-center cursor-pointer group"
      style={{ background: "var(--surface-2)" }}
    >
      {tooltip && (
        <div
          className="absolute top-1 left-1/2 -translate-x-1/2 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            borderRadius: "6px",
            padding: "8px 12px",
            fontSize: "11px",
            lineHeight: 1.6,
            whiteSpace: "nowrap",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          <div className="font-bold mb-0.5" style={{ color: "var(--text-muted)" }}>
            {tooltip.title}
          </div>
          {tooltip.lines.map((line, i) => (
            <div key={i} dangerouslySetInnerHTML={{ __html: line }} />
          ))}
        </div>
      )}
      <svg
        className="transition-[filter] duration-150 group-hover:brightness-108"
        viewBox="0 0 120 70"
        width="100%"
        style={{ maxWidth: "140px" }}
      >
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <path
          d={arcPath}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
        />
        <text
          x={cx}
          y={cy - 10}
          textAnchor="middle"
          fill={color}
          fontSize="18"
          fontWeight="bold"
          fontFamily="'JetBrains Mono','Consolas',monospace"
        >
          {value.toFixed(1)}{unit}
        </text>
        <text
          x={cx}
          y={cy + 6}
          textAnchor="middle"
          fill="var(--text-muted)"
          fontSize="8"
          fontFamily="'JetBrains Mono','Consolas',monospace"
        >
          {label}
        </text>
      </svg>
    </div>
  );
}
