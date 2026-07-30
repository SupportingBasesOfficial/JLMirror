import { describe, it, expect } from "vitest";

// Testes da lógica de device-sync — valida o mapeamento de status do Zabbix para o banco
// Zabbix retorna status como string ("0" = active, "1" = inactive)

function mapDeviceStatus(zabbixStatus: string): "active" | "inactive" {
  return zabbixStatus === "0" ? "active" : "inactive";
}

function resolveHostname(device: { name: string; host: string; hostid: string }): string {
  return device.name || device.host || `host-${device.hostid}`;
}

function resolveIp(device: { interfaces?: { ip: string }[] }): string {
  return device.interfaces?.[0]?.ip ?? "0.0.0.0";
}

describe("device-sync — mapDeviceStatus", () => {
  it("mapeia status 0 para active", () => {
    expect(mapDeviceStatus("0")).toBe("active");
  });

  it("mapeia status 1 para inactive", () => {
    expect(mapDeviceStatus("1")).toBe("inactive");
  });

  it("mapeia status desconhecido para inactive", () => {
    expect(mapDeviceStatus("2")).toBe("inactive");
  });

  it("mapeia string vazia para inactive", () => {
    expect(mapDeviceStatus("")).toBe("inactive");
  });
});

describe("device-sync — resolveHostname", () => {
  it("usa name quando disponivel", () => {
    expect(resolveHostname({ name: "Server 01", host: "server01", hostid: "1001" })).toBe("Server 01");
  });

  it("usa host quando name está vazio", () => {
    expect(resolveHostname({ name: "", host: "server01", hostid: "1001" })).toBe("server01");
  });

  it("usa hostid quando name e host estão vazios", () => {
    expect(resolveHostname({ name: "", host: "", hostid: "1001" })).toBe("host-1001");
  });
});

describe("device-sync — resolveIp", () => {
  it("extrai IP da primeira interface", () => {
    expect(resolveIp({ interfaces: [{ ip: "192.168.1.1" }] })).toBe("192.168.1.1");
  });

  it("retorna 0.0.0.0 quando não há interfaces", () => {
    expect(resolveIp({})).toBe("0.0.0.0");
  });

  it("retorna 0.0.0.0 quando interfaces está vazio", () => {
    expect(resolveIp({ interfaces: [] })).toBe("0.0.0.0");
  });
});
