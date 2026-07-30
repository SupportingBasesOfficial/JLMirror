"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface Series {
  data: number[];
  color: string;
  label: string;
}

interface Threshold {
  value: number;
  color: string;
  label?: string;
}

interface MultiSparklineProps {
  series: Series[];
  height?: number;
  unit?: string;
  formatValue?: (v: number) => string;
  timeRangeSeconds?: number;
  nowSec?: number;
  thresholds?: Threshold[];
}

const SVG_WIDTH = 600;
const TIME_AXIS_HEIGHT = 14;

function formatTimeLabel(ts: number): string {
  const d = new Date(ts * 1000);
 const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function MultiSparkline({ series, height = 120, unit, formatValue, timeRangeSeconds, nowSec, thresholds }: MultiSparklineProps) {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const isDragging = useRef(false);
  const lastDragX = useRef(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const hasData = series.some((s) => s.data.length > 0);

  // Event listener nativo para wheel com zoom-to-cursor
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mouseRatio = (e.clientX - rect.left) / rect.width;
      const delta = e.deltaY > 0 ? 0.85 : 1.18;
      // Calcula zoom e pan juntos para manter o ponto sob o cursor
      setZoom((prevZoom) => {
        const nextZoom = Math.max(1, Math.min(20, prevZoom * delta));
        if (nextZoom === prevZoom) return prevZoom;
        // Conteudo sob cursor: panX + mouseRatio * SVG_WIDTH / prevZoom
        // Apos zoom: panX' + mouseRatio * SVG_WIDTH / nextZoom = mesmo conteudo
        const contentX = panX + mouseRatio * SVG_WIDTH / prevZoom;
        const newPan = contentX - mouseRatio * SVG_WIDTH / nextZoom;
        const maxPan = SVG_WIDTH - SVG_WIDTH / nextZoom;
        setPanX(Math.max(0, Math.min(maxPan, newPan)));
        return nextZoom;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [hasData, panX]);

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (zoom === 1) return;
    isDragging.current = true;
    lastDragX.current = e.clientX;
  }, [zoom]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseRatio = (e.clientX - rect.left) / rect.width;
    const vbX = mouseRatio * SVG_WIDTH;
    setHoverX(vbX);
    if (!isDragging.current) return;
    const dx = e.clientX - lastDragX.current;
    lastDragX.current = e.clientX;
    const dxVb = (dx / rect.width) * SVG_WIDTH;
    const dxContent = dxVb / zoom;
    const maxPan = SVG_WIDTH - SVG_WIDTH / zoom;
    setPanX((prev) => Math.max(0, Math.min(maxPan, prev - dxContent)));
  }, [zoom]);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleMouseLeave = useCallback(() => {
    isDragging.current = false;
    setHoverX(null);
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPanX(0);
  }, []);

  if (!hasData) {
    return (
      <div
        className="flex items-center justify-center text-[11px]"
        style={{ height, color: "var(--text-muted)" }}
      >
        Sem dados
      </div>
    );
  }

  const allValues = series.flatMap((s) => s.data);
  const max = Math.max(...allValues, 1);
  const min = Math.min(...allValues, 0);
  const range = max - min || 1;

  const maxPan = SVG_WIDTH - SVG_WIDTH / zoom;
  const clampedPan = Math.max(0, Math.min(maxPan, panX));

  // Largura dinamica de linha baseada na quantidade de pontos
  const dataLen = series.find((s) => s.data.length > 0)?.data.length ?? 0;
  const baseStroke = dataLen > 500 ? 0.8 : dataLen > 200 ? 1.0 : dataLen > 100 ? 1.3 : 1.6;

  // Timestamps derivados do range
  const currentNowSec = nowSec ?? 0;
  const fromSec = timeRangeSeconds ? currentNowSec - timeRangeSeconds : currentNowSec - 3600;
  const durationSec = currentNowSec - fromSec;

  // Ticks de tempo: posicao fixa no viewBox, label calculado do range visivel
  const visibleFromContent = clampedPan;
  const visibleToContent = clampedPan + SVG_WIDTH / zoom;
  const tickCount = Math.min(6, Math.max(3, Math.floor(SVG_WIDTH / 55)));
  const ticks: { x: number; label: string }[] = [];
  for (let i = 0; i <= tickCount; i++) {
    const frac = i / tickCount;
    const x = frac * SVG_WIDTH;
    const contentFrac = (visibleFromContent + frac * (visibleToContent - visibleFromContent)) / SVG_WIDTH;
    const ts = fromSec + contentFrac * durationSec;
    ticks.push({ x, label: formatTimeLabel(ts) });
  }

  const getOpacity = (i: number) => {
    if (focusedIndex === null) return 1;
    if (focusedIndex === i) return 1;
    return 0.25;
  };

  const getStrokeWidth = (i: number) => {
    if (focusedIndex === null) return baseStroke;
    if (focusedIndex === i) return baseStroke + 0.8;
    return baseStroke * 0.6;
  };

  const getGradOpacity = (i: number) => {
    if (focusedIndex === null) return 0.2;
    if (focusedIndex === i) return 0.35;
    return 0.05;
  };

  // Ordena renderizacao: serie focada por ultimo (fica acima)
  const renderOrder = focusedIndex !== null
    ? [...series.keys()].sort((a, _b) => (a === focusedIndex ? 1 : -1))
    : series.keys();

  // Transform: translada e escala apenas o conteudo do grafico
  // Conteudo na posicao p aparece em viewBox x: (p - panX) * zoom
  const transform = `translate(${-clampedPan * zoom} 0) scale(${zoom} 1)`;

  // Calcula ponto mais proximo do hover para tooltip
  const hoverDataIndex = hoverX !== null && dataLen > 1
    ? Math.round((clampedPan + hoverX / zoom) / SVG_WIDTH * (dataLen - 1))
    : null;
  const clampedHoverIdx = hoverDataIndex !== null
    ? Math.max(0, Math.min(dataLen - 1, hoverDataIndex))
    : null;
  const hoverTs = clampedHoverIdx !== null && dataLen > 1
    ? fromSec + (clampedHoverIdx / (dataLen - 1)) * durationSec
    : null;
  const hoverVbX = clampedHoverIdx !== null && dataLen > 1
    ? ((clampedHoverIdx / Math.max(dataLen - 1, 1)) * SVG_WIDTH - clampedPan) * zoom
    : null;

  return (
    <div className="rounded-md p-2.5 px-3.5" style={{ background: "var(--surface-2)" }}>
      {/* Legenda interativa + controles de zoom */}
      <div className="flex gap-3 mb-1.5 flex-wrap items-center">
        {series.map((s, i) => {
          const isFocused = focusedIndex === i;
          const isDimmed = focusedIndex !== null && focusedIndex !== i;
          return (
            <button
              key={i}
              onClick={() => setFocusedIndex(isFocused ? null : i)}
              className="flex items-center gap-1.5 text-[11px] transition-all duration-200"
              style={{
                color: isDimmed ? "var(--text-muted)" : "var(--text-primary)",
                opacity: getOpacity(i),
                cursor: "pointer",
                padding: "2px 6px",
                borderRadius: 4,
                background: isFocused ? "var(--border-subtle)" : "transparent",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  background: s.color,
                  borderRadius: 2,
                  display: "inline-block",
                  boxShadow: isFocused ? `0 0 6px ${s.color}` : "none",
                }}
              />
              {s.label}
              {s.data.length > 0 && (
                <span style={{ color: s.color, fontWeight: "bold" }}>
                  {formatValue ? formatValue(s.data[s.data.length - 1]) : s.data[s.data.length - 1].toFixed(2)}{unit ? ` ${unit}` : ""}
                </span>
              )}
            </button>
          );
        })}
        {zoom > 1 && (
          <button
            onClick={resetZoom}
            className="text-[11px] px-2 py-0.5 rounded ml-auto transition-colors"
            style={{ background: "var(--border-subtle)", color: "var(--text-primary)", cursor: "pointer" }}
          >
            Reset zoom ({zoom.toFixed(1)}x)
          </button>
        )}
      </div>
      <div ref={containerRef} style={{ position: "relative" }}>
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${height}`}
          width="100%"
          height={height}
          preserveAspectRatio="none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          style={{ cursor: zoom > 1 ? "grab" : "default", display: "block" }}
        >
          {/* Clip para limitar area visivel do grafico */}
          <defs>
            <clipPath id="chart-clip">
              <rect x="0" y="0" width={SVG_WIDTH} height={height} />
            </clipPath>
          </defs>
          {/* Grupo transformado: polylines + areas */}
          <g clipPath="url(#chart-clip)">
            <g transform={transform}>
              {Array.from(renderOrder).map((idx) => {
                 
                const s = series[idx];
                if (!s || s.data.length === 0) return null;
                const points = s.data.map((v, i) => {
                  const x = (i / Math.max(s.data.length - 1, 1)) * SVG_WIDTH;
                  const y = height - 8 - ((v - min) / range) * (height - 16);
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                });
                const polylinePoints = points.join(" ");
                const gradId = `multi-spark-grad-${idx}-${s.color.replace("#", "")}`;
                return (
                  <g key={idx} style={{ transition: "opacity 0.3s ease", opacity: getOpacity(idx) }}>
                    <defs>
                      <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={s.color} stopOpacity={getGradOpacity(idx)} />
                        <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <polygon
                      points={`${polylinePoints} ${SVG_WIDTH},${height} 0,${height}`}
                      fill={`url(#${gradId})`}
                    />
                    <polyline
                      points={polylinePoints}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={getStrokeWidth(idx)}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                      style={{ transition: "opacity 0.3s ease" }}
                    />
                  </g>
                );
              })}
            </g>
          </g>
          {/* Linha de base */}
          <line
            x1="0"
            y1={height - 8}
            x2={SVG_WIDTH}
            y2={height - 8}
            stroke="var(--border-default)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          {/* Linhas de threshold (alertas visuais) */}
          {thresholds?.map((t, idx) => {
            const y = height - 8 - ((t.value - min) / range) * (height - 16);
            if (y < 0 || y > height - 8) return null;
            return (
              <g key={`threshold-${idx}`}>
                <line
                  x1="0"
                  y1={y}
                  x2={SVG_WIDTH}
                  y2={y}
                  stroke={t.color}
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  vectorEffect="non-scaling-stroke"
                  opacity="0.4"
                />
                {t.label && (
                  <text
                    x={SVG_WIDTH - 4}
                    y={y - 3}
                    textAnchor="end"
                    fill={t.color}
                    fontSize="9"
                    opacity="0.6"
                    style={{ fontFamily: "inherit" }}
                  >
                    {t.label}
                  </text>
                )}
              </g>
            );
          })}
          {/* Linha vertical e pontos de hover */}
          {hoverVbX !== null && hoverVbX >= 0 && hoverVbX <= SVG_WIDTH && clampedHoverIdx !== null && (
            <>
              <line
                x1={hoverVbX}
                y1="0"
                x2={hoverVbX}
                y2={height - 8}
                stroke="var(--text-muted)"
                strokeWidth="1"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
                opacity="0.6"
              />
              {series.map((s, i) => {
                if (s.data.length === 0) return null;
                 
                const v = s.data[clampedHoverIdx];
                if (v === undefined) return null;
                const y = height - 8 - ((v - min) / range) * (height - 16);
                return (
                  <circle
                    key={i}
                    cx={hoverVbX}
                    cy={y}
                    r="3"
                    fill={s.color}
                    stroke="var(--surface-2)"
                    strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                    style={{ opacity: getOpacity(i) }}
                  />
                );
              })}
            </>
          )}
        </svg>
        {/* Tooltip HTML com valores do ponto hover */}
        {hoverVbX !== null && hoverVbX >= 0 && hoverVbX <= SVG_WIDTH && clampedHoverIdx !== null && hoverTs !== null && (
          <div
            className="absolute pointer-events-none rounded-md px-2.5 py-1.5 z-10"
            style={{
              background: "rgba(16,23,28,0.92)",
              border: "1px solid var(--border-default)",
              left: `${(hoverVbX / SVG_WIDTH) * 100}%`,
              top: 0,
              transform: hoverVbX > SVG_WIDTH / 2 ? "translateX(-100%) translateX(-8px)" : "translateX(8px)",
            }}
          >
            <div className="text-[10px] mb-1" style={{ color: "var(--text-muted)", fontFamily: "'JetBrains Mono','Consolas',monospace" }}>
              {formatTimeLabel(hoverTs)}
            </div>
            {series.map((s, i) => {
              if (s.data.length === 0) return null;
               
              const v = s.data[clampedHoverIdx];
              if (v === undefined) return null;
              return (
                <div key={i} className="flex items-center gap-1.5 text-[11px]" style={{ opacity: getOpacity(i) }}>
                  <span style={{ width: 6, height: 6, background: s.color, borderRadius: 1, display: "inline-block" }} />
                  <span style={{ color: "var(--text-primary)" }}>{s.label}:</span>
                  <span style={{ color: s.color, fontWeight: "bold" }}>
                    {formatValue ? formatValue(v) : v.toFixed(2)}{unit ? ` ${unit}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {/* Eixo de tempo em HTML para nao distorcer */}
        <div className="flex justify-between px-0.5" style={{ height: TIME_AXIS_HEIGHT }}>
          {ticks.map((tick, i) => (
            <span
              key={i}
              className="text-[10px]"
              style={{
                color: "var(--text-muted)",
                fontFamily: "'JetBrains Mono','Consolas',monospace",
                textAlign: i === 0 ? "left" : i === ticks.length - 1 ? "right" : "center",
                flex: 1,
              }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>
      <div className="text-[10px] text-center mt-0.5" style={{ color: "var(--text-muted)" }}>
        {zoom === 1 ? "Scroll para zoom · Arraste para navegar" : `Zoom ${zoom.toFixed(1)}x — arraste para navegar`}
      </div>
    </div>
  );
}
