// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
"use client";

interface SparklineProps {
  data: number[];
  color: string;
  height?: number;
  label?: string;
  gradientId?: string;
}

export function Sparkline({ data, color, height = 70, label, gradientId }: SparklineProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-[#6E7F88] text-[9px]"
        style={{ height }}
      >
        Sem dados
      </div>
    );
  }

  const width = 300;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - 10 - ((v - min) / range) * (height - 20);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const polylinePoints = points.join(" ");
  const polygonPoints = `${polylinePoints} ${width},${height} 0,${height}`;

  return (
    <div className="bg-[#10171C] rounded-md p-2.5 px-3.5">
      {label && (
        <div className="text-[#6E7F88] text-[9px] mb-1.5">{label}</div>
      )}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
      >
        {gradientId && (
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
        )}
        {gradientId && (
          <polygon points={polygonPoints} fill={`url(#${gradientId})`} />
        )}
        <polyline
          points={polylinePoints}
          fill="none"
          stroke={color}
          strokeWidth="2"
        />
        <line
          x1="0"
          y1={height - 10}
          x2={width}
          y2={height - 10}
          stroke="#1E2530"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}
