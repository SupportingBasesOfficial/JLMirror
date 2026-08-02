// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  zabbixAcknowledgeSchema,
  zabbixCreateHostSchema,
  zabbixUpdateHostSchema,
  zabbixCreateItemSchema,
  zabbixCreateTriggerSchema,
  zabbixCreateMaintenanceSchema,
} from "@repo/shared-validation";

describe("zabbix schemas — zabbixAcknowledgeSchema", () => {
  it("valida acknowledge com eventids", () => {
    const result = zabbixAcknowledgeSchema.safeParse({
      eventids: ["123", "456"],
      message: "Reconhecido",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sem eventids", () => {
    const result = zabbixAcknowledgeSchema.safeParse({
      message: "Reconhecido",
    });
    expect(result.success).toBe(false);
  });
});

describe("zabbix schemas — zabbixCreateHostSchema", () => {
  it("valida criacao de host", () => {
    const result = zabbixCreateHostSchema.safeParse({
      host: "server-01",
      name: "Server 01",
      groupids: ["1"],
      interfaces: [{ ip: "192.168.1.1", type: 1, port: "10050", main: 1, useip: 1 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sem host", () => {
    const result = zabbixCreateHostSchema.safeParse({
      name: "Server 01",
    });
    expect(result.success).toBe(false);
  });
});

describe("zabbix schemas — zabbixUpdateHostSchema", () => {
  it("valida update de host", () => {
    const result = zabbixUpdateHostSchema.safeParse({
      name: "Server 01 Updated",
    });
    expect(result.success).toBe(true);
  });
});

describe("zabbix schemas — zabbixCreateItemSchema", () => {
  it("valida criacao de item", () => {
    const result = zabbixCreateItemSchema.safeParse({
      name: "CPU Load",
      key_: "system.cpu.load[all,avg1]",
      hostid: "10084",
      type: 0,
      value_type: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sem key_", () => {
    const result = zabbixCreateItemSchema.safeParse({
      name: "CPU Load",
      hostid: "10084",
      type: 0,
      value_type: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("zabbix schemas — zabbixCreateTriggerSchema", () => {
  it("valida criacao de trigger", () => {
    const result = zabbixCreateTriggerSchema.safeParse({
      description: "High CPU",
      expression: "{server:system.cpu.load.last()}>5",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sem expression", () => {
    const result = zabbixCreateTriggerSchema.safeParse({
      description: "High CPU",
    });
    expect(result.success).toBe(false);
  });
});

describe("zabbix schemas — zabbixCreateMaintenanceSchema", () => {
  it("valida manutencao com active_since e active_till", () => {
    const result = zabbixCreateMaintenanceSchema.safeParse({
      name: "Janela de manutencao",
      active_since: 1700000000,
      active_till: 1700003600,
      hostids: ["10084"],
      timeperiods: [{ start_date: 1700000000, period: 3600 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sem name", () => {
    const result = zabbixCreateMaintenanceSchema.safeParse({
      active_since: 1700000000,
      active_till: 1700003600,
      hostids: ["10084"],
      timeperiods: [{ start_date: 1700000000 }],
    });
    expect(result.success).toBe(false);
  });
});
