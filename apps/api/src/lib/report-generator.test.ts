// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import { generateCSV, type ReportData } from "../lib/report-generator.js";

describe("generateCSV", () => {
  it("gera CSV com header e linhas corretamente", () => {
    const data: ReportData = {
      title: "Teste",
      generatedAt: "2025-01-01T00:00:00Z",
      columns: ["id", "name", "status"],
      rows: [
        { id: "1", name: "Device A", status: "active" },
        { id: "2", name: "Device B", status: "inactive" },
      ],
    };

    const csv = generateCSV(data);
    const lines = csv.split("\n");

    expect(lines[0]).toBe("id,name,status");
    expect(lines[1]).toBe("1,Device A,active");
    expect(lines[2]).toBe("2,Device B,inactive");
  });

  it("escapa valores com vírgula, aspas e quebra de linha", () => {
    const data: ReportData = {
      title: "Teste",
      generatedAt: "2025-01-01T00:00:00Z",
      columns: ["description"],
      rows: [
        { description: "Valor, com vírgula" },
        { description: 'Valor com "aspas"' },
      ],
    };

    const csv = generateCSV(data);
    const lines = csv.split("\n");

    expect(lines[0]).toBe("description");
    expect(lines[1]).toBe('"Valor, com vírgula"');
    expect(lines[2]).toBe('"Valor com ""aspas"""');
  });

  it("escapa valores com quebra de linha", () => {
    const data: ReportData = {
      title: "Teste",
      generatedAt: "2025-01-01T00:00:00Z",
      columns: ["description"],
      rows: [
        { description: "Valor\ncom quebra" },
      ],
    };

    const csv = generateCSV(data);
    expect(csv).toContain('"Valor');
    expect(csv).toContain('com quebra"');
  });

  it("lida com dados vazios", () => {
    const data: ReportData = {
      title: "Vazio",
      generatedAt: "2025-01-01T00:00:00Z",
      columns: ["col1", "col2"],
      rows: [],
    };

    const csv = generateCSV(data);
    expect(csv).toBe("col1,col2");
  });

  it("lida com valores nulos e undefined", () => {
    const data: ReportData = {
      title: "Nulls",
      generatedAt: "2025-01-01T00:00:00Z",
      columns: ["a", "b"],
      rows: [{ a: null, b: undefined }],
    };

    const csv = generateCSV(data);
    expect(csv).toBe("a,b\n,");
  });
});
