// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";

// Testes da lógica de rate limiting — extrai a lógica pura para testar isoladamente
// O middleware real usa Redis/cache, mas a lógica de contagem é testável aqui

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

function checkRateLimit(
  entry: RateLimitEntry | undefined,
  maxRequests: number,
  now: number,
  windowMs: number,
): { allowed: boolean; remaining: number; entry: RateLimitEntry } {
  if (!entry || entry.resetAt <= now) {
    const newEntry = { count: 1, resetAt: now + windowMs };
    return { allowed: true, remaining: maxRequests - 1, entry: newEntry };
  }

  entry.count++;
  const remaining = Math.max(0, maxRequests - entry.count);
  return { allowed: entry.count <= maxRequests, remaining, entry };
}

describe("rate limit — lógica de contagem sliding window", () => {
  it("permite primeira requisição", () => {
    const result = checkRateLimit(undefined, 300, 1000, 60000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(299);
    expect(result.entry.count).toBe(1);
  });

  it("permite requisição dentro do limite", () => {
    const entry = { count: 50, resetAt: 61000 };
    const result = checkRateLimit(entry, 300, 1000, 60000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(249);
  });

  it("bloqueia requisição acima do limite", () => {
    const entry = { count: 300, resetAt: 61000 };
    const result = checkRateLimit(entry, 300, 1000, 60000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("reseta contador quando janela expira", () => {
    const entry = { count: 300, resetAt: 500 };
    const result = checkRateLimit(entry, 300, 1000, 60000);
    expect(result.allowed).toBe(true);
    expect(result.entry.count).toBe(1);
    expect(result.entry.resetAt).toBe(61000);
  });

  it("remaining nunca é negativo", () => {
    const entry = { count: 500, resetAt: 61000 };
    const result = checkRateLimit(entry, 300, 1000, 60000);
    expect(result.remaining).toBe(0);
  });
});
