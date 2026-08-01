// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling

// Circuit Breaker distribuido via Redis para API Zabbix
// Estados: CLOSED (normal) -> OPEN (falhas, rejeita) -> HALF_OPEN (teste) -> CLOSED
// Usa Redis para compartilhar estado entre replicas

import { cacheGet, cacheSet } from "@repo/cache";

type CircuitState = "closed" | "open" | "half_open";

interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxCalls: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenMaxCalls: 3,
};

// Cache in-memory para evitar round-trip Redis a cada chamada
const localState = new Map<string, { state: CircuitState; failures: number; lastFailureAt: number; halfOpenCalls: number }>();

function getLocalState(key: string): { state: CircuitState; failures: number; lastFailureAt: number; halfOpenCalls: number } {
  if (!localState.has(key)) {
    localState.set(key, { state: "closed", failures: 0, lastFailureAt: 0, halfOpenCalls: 0 });
  }
  return localState.get(key)!;
}

// Verifica se o circuito permite a chamada
export async function circuitCanCall(circuitKey: string, config: Partial<CircuitBreakerConfig> = {}): Promise<boolean> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const redisKey = `circuit:${circuitKey}`;
  const state = getLocalState(circuitKey);

  // Sincroniza com Redis (best-effort)
  try {
    const remote = await cacheGet(redisKey);
    if (remote) {
      const parsed = JSON.parse(remote) as { state: CircuitState; failures: number; lastFailureAt: number };
      // Redis tem estado mais recente
      if (parsed.lastFailureAt > state.lastFailureAt) {
        state.state = parsed.state;
        state.failures = parsed.failures;
        state.lastFailureAt = parsed.lastFailureAt;
      }
    }
  } catch {
    // Silencioso — usa estado local
  }

  if (state.state === "closed") {
    return true;
  }

  if (state.state === "open") {
    // Verifica se ja passou o reset timeout
    const elapsed = Date.now() - state.lastFailureAt;
    if (elapsed >= cfg.resetTimeoutMs) {
      // Transita para half_open
      state.state = "half_open";
      state.halfOpenCalls = 0;
      console.warn(`[circuit] ${circuitKey}: OPEN -> HALF_OPEN`);
      return true;
    }
    return false;
  }

  // half_open — permite apenas N chamadas de teste
  if (state.halfOpenCalls < cfg.halfOpenMaxCalls) {
    state.halfOpenCalls++;
    return true;
  }

  return false;
}

// Registra sucesso — reseta falhas e fecha o circuito
export async function circuitOnSuccess(circuitKey: string): Promise<void> {
  const state = getLocalState(circuitKey);
  const wasNotClosed = state.state !== "closed";

  state.state = "closed";
  state.failures = 0;
  state.halfOpenCalls = 0;

  if (wasNotClosed) {
    console.warn(`[circuit] ${circuitKey}: -> CLOSED (sucesso)`);
    try {
      await cacheSet(`circuit:${circuitKey}`, JSON.stringify({ state: "closed", failures: 0, lastFailureAt: 0 }), 300);
    } catch {
      // Silencioso
    }
  }
}

// Registra falha — incrementa contador e abre circuito se passar do threshold
export async function circuitOnFailure(circuitKey: string, config: Partial<CircuitBreakerConfig> = {}): Promise<void> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const state = getLocalState(circuitKey);

  state.failures++;
  state.lastFailureAt = Date.now();

  if (state.state === "half_open") {
    // Falha em half_open -> volta para open
    state.state = "open";
    console.warn(`[circuit] ${circuitKey}: HALF_OPEN -> OPEN (falha no teste)`);
  } else if (state.failures >= cfg.failureThreshold) {
    state.state = "open";
    console.warn(`[circuit] ${circuitKey}: CLOSED -> OPEN (${state.failures} falhas)`);
  }

  // Sincroniza com Redis
  try {
    await cacheSet(
      `circuit:${circuitKey}`,
      JSON.stringify({ state: state.state, failures: state.failures, lastFailureAt: state.lastFailureAt }),
      300,
    );
  } catch {
    // Silencioso
  }
}

// Retorna estado atual do circuito (para health check e metricas)
export function circuitGetState(circuitKey: string): CircuitState {
  return getLocalState(circuitKey).state;
}
