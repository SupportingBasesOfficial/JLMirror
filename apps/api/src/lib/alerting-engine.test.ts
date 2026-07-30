import { describe, it, expect } from "vitest";

// Replica da função mapZabbixSeverity do alerting-engine.ts
// Zabbix API retorna severity como string ("0"-"5"), mas a função
// precisa comparar numericamente para classificar
function mapZabbixSeverity(zabbixSeverity: string): "info" | "warning" | "critical" {
  const sev = Number(zabbixSeverity);
  if (sev >= 4) return "critical";
  if (sev >= 2) return "warning";
  return "info";
}

describe("mapZabbixSeverity — mapeamento de severidade Zabbix", () => {
  it("classifica severity 0 como info", () => {
    expect(mapZabbixSeverity("0")).toBe("info");
  });

  it("classifica severity 1 como info", () => {
    expect(mapZabbixSeverity("1")).toBe("info");
  });

  it("classifica severity 2 como warning", () => {
    expect(mapZabbixSeverity("2")).toBe("warning");
  });

  it("classifica severity 3 como warning", () => {
    expect(mapZabbixSeverity("3")).toBe("warning");
  });

  it("classifica severity 4 como critical", () => {
    expect(mapZabbixSeverity("4")).toBe("critical");
  });

  it("classifica severity 5 como critical", () => {
    expect(mapZabbixSeverity("5")).toBe("critical");
  });

  it("trata string vazia como info (NaN >= 4 é false)", () => {
    expect(mapZabbixSeverity("")).toBe("info");
  });

  it("trata valor invalido como info", () => {
    expect(mapZabbixSeverity("invalid")).toBe("info");
  });

  it("trata valor alto como critical", () => {
    expect(mapZabbixSeverity("99")).toBe("critical");
  });
});
