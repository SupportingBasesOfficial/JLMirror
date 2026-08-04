// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import { buildDynamicUpdate } from "../lib/dynamic-update.js";

describe("dynamic-update — buildDynamicUpdate", () => {
  it("gera SET clause com um campo", () => {
    const { setClause, params } = buildDynamicUpdate(
      { name: "Novo Nome" },
      { name: "name" },
    );
    expect(setClause).toBe("name = $1");
    expect(params).toEqual(["Novo Nome"]);
  });

  it("gera SET clause com multiplos campos", () => {
    const { setClause, params } = buildDynamicUpdate(
      { name: "Novo", status: "active" },
      { name: "name", status: "status" },
    );
    expect(setClause).toBe("name = $1, status = $2");
    expect(params).toEqual(["Novo", "active"]);
  });

  it("ignora campos undefined", () => {
    const { setClause, params } = buildDynamicUpdate(
      { name: "Novo", status: undefined },
      { name: "name", status: "status" },
    );
    expect(setClause).toBe("name = $1");
    expect(params).toEqual(["Novo"]);
  });

  it("retorna setClause vazio quando nenhum campo match", () => {
    const { setClause, params } = buildDynamicUpdate(
      { unknown: "value" },
      { name: "name" },
    );
    expect(setClause).toBe("");
    expect(params).toEqual([]);
  });

  it("serializa campos JSON quando jsonFields especificado", () => {
    const { setClause, params } = buildDynamicUpdate(
      { config: { key: "value" } },
      { config: "config" },
      { jsonFields: ["config"] },
    );
    expect(setClause).toBe("config = $1");
    expect(params).toEqual([JSON.stringify({ key: "value" })]);
  });

  it("pula valores quando skipValues especificado", () => {
    const { setClause, params } = buildDynamicUpdate(
      { name: "***", status: "active" },
      { name: "name", status: "status" },
      { skipValues: ["***"] },
    );
    expect(setClause).toBe("status = $1");
    expect(params).toEqual(["active"]);
  });

  it("nao serializa campos nao-JSON como JSON", () => {
    const { setClause, params } = buildDynamicUpdate(
      { name: "test", config: { a: 1 } },
      { name: "name", config: "config" },
      { jsonFields: ["config"] },
    );
    expect(setClause).toBe("name = $1, config = $2");
    expect(params).toEqual(["test", JSON.stringify({ a: 1 })]);
  });
});
