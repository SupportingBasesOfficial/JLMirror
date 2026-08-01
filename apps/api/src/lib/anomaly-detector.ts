// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// AI Anomaly Detection — deteccao estatistica de anomalias em metricas
// Algoritmos: Z-score, IQR (Interquartile Range), EWMA (Exponentially Weighted Moving Average)

export interface AnomalyResult {
  isAnomaly: boolean;
  observedValue: number;
  expectedValue: number;
  deviationScore: number;
  thresholdLow: number | null;
  thresholdHigh: number | null;
  severity: "info" | "warning" | "critical";
}

export interface AnomalyConfig {
  algorithm: string;
  windowSize: number;
  zscoreThreshold: number;
  iqrMultiplier: number;
  ewmaAlpha: number;
  warningThreshold: number;
  criticalThreshold: number;
}

// Z-Score: mede quantos desvios-padrão o valor está da média
export function detectZScore(
  values: number[],
  observed: number,
  config: AnomalyConfig,
): AnomalyResult {
  if (values.length < 2) {
    return { isAnomaly: false, observedValue: observed, expectedValue: observed, deviationScore: 0, thresholdLow: null, thresholdHigh: null, severity: "info" };
  }

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) {
    return { isAnomaly: false, observedValue: observed, expectedValue: mean, deviationScore: 0, thresholdLow: mean, thresholdHigh: mean, severity: "info" };
  }

  const zScore = Math.abs((observed - mean) / stdDev);
  const thresholdHigh = mean + config.zscoreThreshold * stdDev;
  const thresholdLow = mean - config.zscoreThreshold * stdDev;

  const isAnomaly = zScore > config.zscoreThreshold;
  const severity = zScore > config.criticalThreshold ? "critical" : zScore > config.warningThreshold ? "warning" : "info";

  return {
    isAnomaly,
    observedValue: observed,
    expectedValue: mean,
    deviationScore: zScore,
    thresholdLow,
    thresholdHigh,
    severity: isAnomaly ? severity : "info",
  };
}

// IQR: detecção baseada em quartis
export function detectIQR(
  values: number[],
  observed: number,
  config: AnomalyConfig,
): AnomalyResult {
  if (values.length < 4) {
    return { isAnomaly: false, observedValue: observed, expectedValue: observed, deviationScore: 0, thresholdLow: null, thresholdHigh: null, severity: "info" };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const q1Index = Math.floor(sorted.length * 0.25);
  const q3Index = Math.floor(sorted.length * 0.75);
  const q1 = sorted[q1Index];
  const q3 = sorted[q3Index];
  const iqr = q3 - q1;

  const thresholdLow = q1 - config.iqrMultiplier * iqr;
  const thresholdHigh = q3 + config.iqrMultiplier * iqr;
  const median = sorted[Math.floor(sorted.length / 2)];

  const isAnomaly = observed < thresholdLow || observed > thresholdHigh;
  const deviation = median !== 0 ? Math.abs(observed - median) / Math.abs(median) : Math.abs(observed - median);

  const severity = deviation > config.criticalThreshold ? "critical" : deviation > config.warningThreshold ? "warning" : "info";

  return {
    isAnomaly,
    observedValue: observed,
    expectedValue: median,
    deviationScore: deviation,
    thresholdLow,
    thresholdHigh,
    severity: isAnomaly ? severity : "info",
  };
}

// EWMA: média móvel exponencialmente ponderada
export function detectEWMA(
  values: number[],
  observed: number,
  config: AnomalyConfig,
): AnomalyResult {
  if (values.length < 2) {
    return { isAnomaly: false, observedValue: observed, expectedValue: observed, deviationScore: 0, thresholdLow: null, thresholdHigh: null, severity: "info" };
  }

  const alpha = config.ewmaAlpha;
  let ewma = values[0];
  for (let i = 1; i < values.length; i++) {
    ewma = alpha * values[i] + (1 - alpha) * ewma;
  }

  // Calcula desvio dos residuos EWMA
  const residuals: number[] = [];
  let prevEwma = values[0];
  for (let i = 1; i < values.length; i++) {
    residuals.push(values[i] - prevEwma);
    prevEwma = alpha * values[i] + (1 - alpha) * prevEwma;
  }
  const residualMean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
  const residualVariance = residuals.reduce((sum, v) => sum + Math.pow(v - residualMean, 2), 0) / residuals.length;
  const residualStdDev = Math.sqrt(residualVariance);

  if (residualStdDev === 0) {
    return { isAnomaly: false, observedValue: observed, expectedValue: ewma, deviationScore: 0, thresholdLow: ewma, thresholdHigh: ewma, severity: "info" };
  }

  const deviation = Math.abs(observed - ewma) / residualStdDev;
  const thresholdHigh = ewma + config.zscoreThreshold * residualStdDev;
  const thresholdLow = ewma - config.zscoreThreshold * residualStdDev;

  const isAnomaly = deviation > config.zscoreThreshold;
  const severity = deviation > config.criticalThreshold ? "critical" : deviation > config.warningThreshold ? "warning" : "info";

  return {
    isAnomaly,
    observedValue: observed,
    expectedValue: ewma,
    deviationScore: deviation,
    thresholdLow,
    thresholdHigh,
    severity: isAnomaly ? severity : "info",
  };
}

// Funcao principal que seleciona o algoritmo
export function detectAnomaly(
  values: number[],
  observed: number,
  config: AnomalyConfig,
): AnomalyResult {
  switch (config.algorithm) {
    case "zscore":
      return detectZScore(values, observed, config);
    case "iqr":
      return detectIQR(values, observed, config);
    case "ewma":
      return detectEWMA(values, observed, config);
    case "seasonal":
      // Seasonal usa Z-score com janela maior — implementacao futura com decomposicao sazonal
      return detectZScore(values, observed, config);
    default:
      return detectZScore(values, observed, config);
  }
}
