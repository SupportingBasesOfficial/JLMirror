// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling

// Downsampling de series temporais — reduz N pontos para maxPoints mantendo fidelidade visual
// Algoritmo: LTTB (Largest Triangle Three Buckets) simplificado para avg/min/max por bucket

interface TimePoint {
  clock: number;
  value: string;
}

export interface DownsampledPoint {
  clock: number;
  value: string;
  min?: string;
  max?: string;
}

// Reduz pontos para no maximo maxPoints usando bucketing com avg/min/max
export function downsamplePoints(
  points: TimePoint[],
  maxPoints: number = 500,
): DownsampledPoint[] {
  if (points.length <= maxPoints) {
    return points.map((p) => ({ clock: p.clock, value: p.value }));
  }

  const bucketSize = Math.ceil(points.length / maxPoints);
  const result: DownsampledPoint[] = [];

  for (let i = 0; i < points.length; i += bucketSize) {
    const bucket = points.slice(i, i + bucketSize);
    if (bucket.length === 0) continue;

    const values = bucket.map((p) => parseFloat(p.value));
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    // Usa o ponto medio do bucket como timestamp representativo
    const midIdx = Math.floor(bucket.length / 2);
    result.push({
      clock: bucket[midIdx].clock,
      value: avg.toFixed(4),
      min: min.toFixed(4),
      max: max.toFixed(4),
    });
  }

  return result;
}

// Aplica downsampling a multiplas series mantendo consistencia de buckets
export function downsampleSeries<T extends { points: TimePoint[] }>(
  series: T[],
  maxPointsPerSeries: number = 500,
): Array<T & { points: DownsampledPoint[]; downsampled: boolean }> {
  return series.map((s) => ({
    ...s,
    points: downsamplePoints(s.points, maxPointsPerSeries),
    downsampled: s.points.length > maxPointsPerSeries,
  }));
}
