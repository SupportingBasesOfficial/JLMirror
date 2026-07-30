// Predictive Failure Engine — predicao de falhas baseada em tendencias de metricas
// Modelos: Linear Trend (regressao linear), Exponential, Moving Average, Threshold Proximity

export interface PredictionResult {
  predictedFailure: boolean;
  failureProbability: number;
  estimatedFailureHours: number | null;
  estimatedFailureAt: Date | null;
  currentValue: number;
  predictedValue: number;
  thresholdValue: number;
  trendSlope: number | null;
  rSquared: number | null;
  severity: "info" | "warning" | "critical";
}

export interface PredictionConfig {
  modelType: string;
  windowSize: number;
  thresholdValue: number;
  thresholdDirection: string;
  predictionHorizonHours: number;
  warningProbability: number;
  criticalProbability: number;
}

// Regressao linear simples (least squares)
function linearRegression(values: number[]): { slope: number; intercept: number; rSquared: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0, rSquared: 0 };

  const x = Array.from({ length: n }, (_, i) => i);
  const xMean = x.reduce((a, b) => a + b, 0) / n;
  const yMean = values.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (x[i] - xMean) * (values[i] - yMean);
    denominator += Math.pow(x[i] - xMean, 2);
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yMean - slope * xMean;

  // R-squared
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = slope * x[i] + intercept;
    ssRes += Math.pow(values[i] - predicted, 2);
    ssTot += Math.pow(values[i] - yMean, 2);
  }
  const rSquared = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return { slope, intercept, rSquared };
}

// Modelo 1: Linear Trend — extrapola a tendencia linear ate cruzar o threshold
function predictLinearTrend(
  values: number[],
  config: PredictionConfig,
): PredictionResult {
  const n = values.length;
  const currentValue = values[n - 1] ?? 0;
  const { slope, intercept, rSquared } = linearRegression(values);

  // Prediz o valor no horizonte
  const predictedValue = slope * (n - 1 + config.predictionHorizonHours) + intercept;

  // Estima quando o threshold sera cruzado
  let estimatedFailureHours: number | null = null;
  if (slope !== 0) {
    if (config.thresholdDirection === "above" && slope > 0) {
      const hoursToThreshold = (config.thresholdValue - currentValue) / slope;
      if (hoursToThreshold > 0 && hoursToThreshold <= config.predictionHorizonHours * 2) {
        estimatedFailureHours = Math.round(hoursToThreshold);
      }
    } else if (config.thresholdDirection === "below" && slope < 0) {
      const hoursToThreshold = (config.thresholdValue - currentValue) / slope;
      if (hoursToThreshold > 0 && hoursToThreshold <= config.predictionHorizonHours * 2) {
        estimatedFailureHours = Math.round(hoursToThreshold);
      }
    }
  }

  // Calcula probabilidade baseada em R-squared e proximidade do threshold
  const distanceToThreshold = Math.abs(config.thresholdValue - currentValue);
  const thresholdRange = Math.abs(config.thresholdValue);
  const proximityRatio = thresholdRange === 0 ? 1 : distanceToThreshold / thresholdRange;

  let failureProbability = 0;
  if (estimatedFailureHours !== null) {
    // Quanto mais proximo, maior a probabilidade
    const horizonRatio = 1 - estimatedFailureHours / (config.predictionHorizonHours * 2);
    failureProbability = Math.min(1, Math.max(0, rSquared * horizonRatio));
  } else {
    failureProbability = Math.min(0.3, proximityRatio * 0.1);
  }

  const predictedFailure = failureProbability >= config.warningProbability;
  const severity = failureProbability >= config.criticalProbability ? "critical" : failureProbability >= config.warningProbability ? "warning" : "info";

  const estimatedFailureAt = estimatedFailureHours !== null
    ? new Date(Date.now() + estimatedFailureHours * 60 * 60 * 1000)
    : null;

  return {
    predictedFailure,
    failureProbability,
    estimatedFailureHours,
    estimatedFailureAt,
    currentValue,
    predictedValue,
    thresholdValue: config.thresholdValue,
    trendSlope: slope,
    rSquared,
    severity,
  };
}

// Modelo 2: Exponential — ajusta crescimento exponencial
function predictExponential(
  values: number[],
  config: PredictionConfig,
): PredictionResult {
  const n = values.length;
  const currentValue = values[n - 1] ?? 0;

  // Log-transform para regressao linear
  const logValues = values.map((v) => Math.log(Math.max(v, 0.0001)));
  const { slope, rSquared } = linearRegression(logValues);

  const growthRate = Math.exp(slope);
  const predictedValue = currentValue * Math.pow(growthRate, config.predictionHorizonHours);

  // Estima quando cruza o threshold
  let estimatedFailureHours: number | null = null;
  if (growthRate > 1 && config.thresholdDirection === "above" && currentValue > 0) {
    const ratio = config.thresholdValue / currentValue;
    if (ratio > 1) {
      const hours = Math.log(ratio) / Math.log(growthRate);
      if (hours > 0 && hours <= config.predictionHorizonHours * 2) {
        estimatedFailureHours = Math.round(hours);
      }
    }
  }

  let failureProbability = 0;
  if (estimatedFailureHours !== null) {
    const horizonRatio = 1 - estimatedFailureHours / (config.predictionHorizonHours * 2);
    failureProbability = Math.min(1, Math.max(0, rSquared * horizonRatio));
  }

  const predictedFailure = failureProbability >= config.warningProbability;
  const severity = failureProbability >= config.criticalProbability ? "critical" : failureProbability >= config.warningProbability ? "warning" : "info";

  const estimatedFailureAt = estimatedFailureHours !== null
    ? new Date(Date.now() + estimatedFailureHours * 60 * 60 * 1000)
    : null;

  return {
    predictedFailure,
    failureProbability,
    estimatedFailureHours,
    estimatedFailureAt,
    currentValue,
    predictedValue,
    thresholdValue: config.thresholdValue,
    trendSlope: slope,
    rSquared,
    severity,
  };
}

// Modelo 3: Moving Average — suaviza ruido e extrapola
function predictMovingAverage(
  values: number[],
  config: PredictionConfig,
): PredictionResult {
  const n = values.length;
  const currentValue = values[n - 1] ?? 0;

  // Media movel simples
  const window = Math.min(10, n);
  const recentValues = values.slice(-window);
  const movingAvg = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;

  // Calcula tendencia da media movel
  const maValues: number[] = [];
  for (let i = window; i <= n; i++) {
    const slice = values.slice(i - window, i);
    maValues.push(slice.reduce((a, b) => a + b, 0) / window);
  }
  const { slope, rSquared } = linearRegression(maValues);

  const predictedValue = movingAvg + slope * config.predictionHorizonHours;

  let estimatedFailureHours: number | null = null;
  if (slope !== 0) {
    const hoursToThreshold = (config.thresholdValue - movingAvg) / slope;
    if (hoursToThreshold > 0 && hoursToThreshold <= config.predictionHorizonHours * 2) {
      estimatedFailureHours = Math.round(hoursToThreshold);
    }
  }

  let failureProbability = 0;
  if (estimatedFailureHours !== null) {
    const horizonRatio = 1 - estimatedFailureHours / (config.predictionHorizonHours * 2);
    failureProbability = Math.min(1, Math.max(0, rSquared * horizonRatio));
  }

  const predictedFailure = failureProbability >= config.warningProbability;
  const severity = failureProbability >= config.criticalProbability ? "critical" : failureProbability >= config.warningProbability ? "warning" : "info";

  const estimatedFailureAt = estimatedFailureHours !== null
    ? new Date(Date.now() + estimatedFailureHours * 60 * 60 * 1000)
    : null;

  return {
    predictedFailure,
    failureProbability,
    estimatedFailureHours,
    estimatedFailureAt,
    currentValue,
    predictedValue,
    thresholdValue: config.thresholdValue,
    trendSlope: slope,
    rSquared,
    severity,
  };
}

// Modelo 4: Threshold Proximity — probabilidade baseada apenas na distancia ao threshold
function predictThresholdProximity(
  values: number[],
  config: PredictionConfig,
): PredictionResult {
  const currentValue = values[values.length - 1] ?? 0;
  const distance = Math.abs(config.thresholdValue - currentValue);
  const thresholdRange = Math.abs(config.thresholdValue) || 1;
  const proximityRatio = Math.min(1, distance / thresholdRange);

  // Quanto mais proximo do threshold, maior a probabilidade
  const failureProbability = 1 - proximityRatio;

  // Estima falha baseado na taxa de aproximacao
  const recentSlope = values.length >= 3
    ? (values[values.length - 1] - values[values.length - 3]) / 2
    : 0;

  let estimatedFailureHours: number | null = null;
  if (recentSlope !== 0) {
    const hoursToThreshold = (config.thresholdValue - currentValue) / recentSlope;
    if (hoursToThreshold > 0 && hoursToThreshold <= config.predictionHorizonHours * 2) {
      estimatedFailureHours = Math.round(hoursToThreshold);
    }
  }

  const predictedFailure = failureProbability >= config.warningProbability;
  const severity = failureProbability >= config.criticalProbability ? "critical" : failureProbability >= config.warningProbability ? "warning" : "info";

  const estimatedFailureAt = estimatedFailureHours !== null
    ? new Date(Date.now() + estimatedFailureHours * 60 * 60 * 1000)
    : null;

  return {
    predictedFailure,
    failureProbability,
    estimatedFailureHours,
    estimatedFailureAt,
    currentValue,
    predictedValue: currentValue + recentSlope * config.predictionHorizonHours,
    thresholdValue: config.thresholdValue,
    trendSlope: recentSlope,
    rSquared: null,
    severity,
  };
}

// Funcao principal
export function predictFailure(
  values: number[],
  config: PredictionConfig,
): PredictionResult {
  if (values.length < 2) {
    return {
      predictedFailure: false,
      failureProbability: 0,
      estimatedFailureHours: null,
      estimatedFailureAt: null,
      currentValue: values[0] ?? 0,
      predictedValue: values[0] ?? 0,
      thresholdValue: config.thresholdValue,
      trendSlope: null,
      rSquared: null,
      severity: "info",
    };
  }

  switch (config.modelType) {
    case "linear_trend":
      return predictLinearTrend(values, config);
    case "exponential":
      return predictExponential(values, config);
    case "moving_average":
      return predictMovingAverage(values, config);
    case "threshold_proximity":
      return predictThresholdProximity(values, config);
    default:
      return predictLinearTrend(values, config);
  }
}
