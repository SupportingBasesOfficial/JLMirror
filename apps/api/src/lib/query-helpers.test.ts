// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import { safeRows, safeCount, safeFirstRow } from "../lib/query-helpers.js";

describe("query-helpers — safeRows", () => {
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

  it("retorna array vazio quando data é undefined", () => {
    const result = {};
    expect(safeRows(result)).toEqual([]);
  });
});

describe("query-helpers — safeCount", () => {
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

describe("query-helpers — safeFirstRow", () => {
  it("extrai primeira row de resultado valido", () => {
    const result = { data: { rows: [{ id: "1" }, { id: "2" }] } };
    expect(safeFirstRow(result)).toEqual({ id: "1" });
  });

  it("retorna null quando rows esta vazio", () => {
    const result = { data: { rows: [] } };
    expect(safeFirstRow(result)).toBeNull();
  });

  it("retorna null quando data é null", () => {
    const result = { data: null };
    expect(safeFirstRow(result)).toBeNull();
  });

  it("retorna null quando rows é undefined", () => {
    const result = { data: { rows: undefined } };
    expect(safeFirstRow(result)).toBeNull();
  });

  it("preserva tipagem generica", () => {
    const result = { data: { rows: [{ name: "test" }] } };
    const row = safeFirstRow<{ name: string }>(result);
    expect(row?.name).toBe("test");
  });
});
