// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import { collectReportData } from "../lib/report-generator.js";

// Nota: generatePDF nao é testado aqui porque pdfkit depende de streams
// nativas do Node que nao funcionam no ambiente vitest. O teste e2e
// (FAIXA 2.10) valida generatePDF indiretamente via rota /reports/:id/run.

describe("collectReportData", () => {
  // Mock query function
  function makeMockQueryFn(rows: Record<string, unknown>[]) {
    return async (_sql: string, _params: unknown[]) => ({
      data: { rows },
    });
  }

  it("coleta dados de devices", async () => {
    const mockRows = [
      {
        id: "1",
        hostname: "server-01",
        ip: "10.0.0.1",
        type: "server",
        status: "active",
        created_at: "2025-01-01",
      },
    ];
    const result = await collectReportData(
      "tenant-123",
      ["devices"],
      [],
      "Relatório de Devices",
      makeMockQueryFn(mockRows),
    );

    expect(result.title).toBe("Relatório de Devices");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.hostname).toBe("server-01");
    expect(result.columns).toContain("id");
    expect(result.columns).toContain("hostname");
  });

  it("coleta dados de tickets", async () => {
    const mockRows = [
      {
        id: "t1",
        subject: "Problema CPU",
        status: "open",
        priority: "high",
        created_at: "2025-01-01",
      },
    ];
    const result = await collectReportData(
      "tenant-123",
      ["tickets"],
      [],
      "Relatório de Tickets",
      makeMockQueryFn(mockRows),
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.subject).toBe("Problema CPU");
  });

  it("coleta dados de multiplas fontes", async () => {
    let callCount = 0;
    const mockQueryFn = async (_sql: string, _params: unknown[]) => {
      callCount++;
      if (callCount === 1) {
        return { data: { rows: [{ id: "d1", hostname: "dev-01" }] } };
      }
      return { data: { rows: [{ id: "t1", subject: "Ticket 1" }] } };
    };

    const result = await collectReportData(
      "tenant-123",
      ["devices", "tickets"],
      [],
      "Relatório Misto",
      mockQueryFn,
    );

    expect(result.rows).toHaveLength(2);
  });

  it("usa columns customizadas quando fornecidas", async () => {
    const result = await collectReportData(
      "tenant-123",
      ["devices"],
      ["custom_col1", "custom_col2"],
      "Relatório Custom",
      makeMockQueryFn([{ custom_col1: "a", custom_col2: "b" }]),
    );

    expect(result.columns).toEqual(["custom_col1", "custom_col2"]);
  });

  it("lida com fonte desconhecida sem erro", async () => {
    const result = await collectReportData(
      "tenant-123",
      ["unknown_source"],
      [],
      "Relatório",
      makeMockQueryFn([]),
    );

    expect(result.rows).toHaveLength(0);
    expect(result.columns).toEqual([]);
  });

  it("lida com queryFn retornando null", async () => {
    const result = await collectReportData(
      "tenant-123",
      ["devices"],
      ["id"],
      "Relatório",
      async () => ({ data: null }),
    );

    expect(result.rows).toHaveLength(0);
    expect(result.columns).toEqual(["id"]);
  });

  it("gera generatedAt como ISO string", async () => {
    const result = await collectReportData(
      "tenant-123",
      [],
      [],
      "Teste",
      makeMockQueryFn([]),
    );

    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
