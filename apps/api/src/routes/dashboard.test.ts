import { describe, it, expect } from "vitest";

// Replica das funções helper do dashboard.ts para testar isoladamente
function safeCount(result: { data?: { rows?: Array<Record<string, unknown>> } | null }): number {
  const row = result.data?.rows?.[0];
  return row ? parseInt((row.count as string) ?? "0", 10) : 0;
}

function safeRows(result: { data?: { rows?: Array<Record<string, unknown>> } | null }): Array<Record<string, unknown>> {
  return result.data?.rows ?? [];
}

describe("dashboard helpers — safeCount", () => {
  it("extrai count de resultado valido", () => {
    const result = { data: { rows: [{ count: "42" }] } };
    expect(safeCount(result)).toBe(42);
  });

  it("retorna 0 quando rows esta vazio", () => {
    const result = { data: { rows: [] } };
    expect(safeCount(result)).toBe(0);
  });

  it("retorna 0 quando data é null", () => {
    const result = { data: null };
    expect(safeCount(result)).toBe(0);
  });

  it("retorna 0 quando rows é undefined", () => {
    const result = { data: { rows: undefined } };
    expect(safeCount(result)).toBe(0);
  });

  it("trata count como string (PostgreSQL retorna string)", () => {
    const result = { data: { rows: [{ count: "0" }] } };
    expect(safeCount(result)).toBe(0);
  });

  it("trata count ausente como 0", () => {
    const result = { data: { rows: [{}] } };
    expect(safeCount(result)).toBe(0);
  });
});

describe("dashboard helpers — safeRows", () => {
  it("extrai rows de resultado valido", () => {
    const result = { data: { rows: [{ id: "1" }, { id: "2" }] } };
    expect(safeRows(result)).toHaveLength(2);
  });

  it("retorna array vazio quando data é null", () => {
    const result = { data: null };
    expect(safeRows(result)).toEqual([]);
  });

  it("retorna array vazio quando rows é undefined", () => {
    const result = { data: { rows: undefined } };
    expect(safeRows(result)).toEqual([]);
  });
});
