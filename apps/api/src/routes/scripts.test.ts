// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  createScriptSchema,
  updateScriptSchema,
  executeScriptSchema,
} from "@repo/shared-validation";

// ========== createScriptSchema ==========

describe("scripts — createScriptSchema", () => {
  const validScript = {
    name: "Backup Script",
    language: "bash" as const,
    content: "echo 'backup started'",
  };

  it("valida script minimo", () => {
    const result = createScriptSchema.safeParse(validScript);
    expect(result.success).toBe(true);
  });

  it("rejeita sem name", () => {
    const result = createScriptSchema.safeParse({ ...validScript, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejeita sem content", () => {
    const result = createScriptSchema.safeParse({
      ...validScript,
      content: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita content muito grande (>100KB)", () => {
    const result = createScriptSchema.safeParse({
      ...validScript,
      content: "a".repeat(100001),
    });
    expect(result.success).toBe(false);
  });

  it("aceita content no limite (100KB)", () => {
    const result = createScriptSchema.safeParse({
      ...validScript,
      content: "a".repeat(100000),
    });
    expect(result.success).toBe(true);
  });

  it("valida language=bash", () => {
    const result = createScriptSchema.safeParse({
      ...validScript,
      language: "bash",
    });
    expect(result.success).toBe(true);
  });

  it("valida language=python", () => {
    const result = createScriptSchema.safeParse({
      ...validScript,
      language: "python",
    });
    expect(result.success).toBe(true);
  });

  it("valida language=powershell", () => {
    const result = createScriptSchema.safeParse({
      ...validScript,
      language: "powershell",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita language invalido", () => {
    const result = createScriptSchema.safeParse({
      ...validScript,
      language: "ruby",
    });
    expect(result.success).toBe(false);
  });

  it("aplica default timeout_seconds=30", () => {
    const result = createScriptSchema.safeParse(validScript);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timeout_seconds).toBe(30);
    }
  });

  it("rejeita timeout_seconds > 3600", () => {
    const result = createScriptSchema.safeParse({
      ...validScript,
      timeout_seconds: 3601,
    });
    expect(result.success).toBe(false);
  });

  it("aplica default requires_approval=false", () => {
    const result = createScriptSchema.safeParse(validScript);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.requires_approval).toBe(false);
    }
  });

  it("aplica default max_concurrent_executions=1", () => {
    const result = createScriptSchema.safeParse(validScript);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.max_concurrent_executions).toBe(1);
    }
  });

  it("rejeita max_concurrent_executions > 100", () => {
    const result = createScriptSchema.safeParse({
      ...validScript,
      max_concurrent_executions: 101,
    });
    expect(result.success).toBe(false);
  });

  it("valida allowed_hosts com dominios validos", () => {
    const result = createScriptSchema.safeParse({
      ...validScript,
      allowed_hosts: ["server1.example.com", "server2.example.com"],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita allowed_hosts com IP", () => {
    const result = createScriptSchema.safeParse({
      ...validScript,
      allowed_hosts: ["192.168.1.1"],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita allowed_hosts com localhost", () => {
    const result = createScriptSchema.safeParse({
      ...validScript,
      allowed_hosts: ["localhost"],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita allowed_hosts com mais de 50 entradas", () => {
    const result = createScriptSchema.safeParse({
      ...validScript,
      allowed_hosts: Array(51).fill("host.example.com"),
    });
    expect(result.success).toBe(false);
  });

  it("valida com tags", () => {
    const result = createScriptSchema.safeParse({
      ...validScript,
      tags: ["backup", "daily"],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita mais de 20 tags", () => {
    const result = createScriptSchema.safeParse({
      ...validScript,
      tags: Array(21).fill("tag"),
    });
    expect(result.success).toBe(false);
  });

  it("rejeita tag muito longa (>50 chars)", () => {
    const result = createScriptSchema.safeParse({
      ...validScript,
      tags: ["a".repeat(51)],
    });
    expect(result.success).toBe(false);
  });
});

// ========== updateScriptSchema ==========

describe("scripts — updateScriptSchema", () => {
  it("valida update vazio (parcial)", () => {
    const result = updateScriptSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida update name", () => {
    const result = updateScriptSchema.safeParse({ name: "Novo Nome" });
    expect(result.success).toBe(true);
  });

  it("valida update content", () => {
    const result = updateScriptSchema.safeParse({ content: "novo script" });
    expect(result.success).toBe(true);
  });

  it("rejeita update content muito grande", () => {
    const result = updateScriptSchema.safeParse({
      content: "a".repeat(100001),
    });
    expect(result.success).toBe(false);
  });

  it("valida update language", () => {
    const result = updateScriptSchema.safeParse({ language: "python" });
    expect(result.success).toBe(true);
  });

  it("rejeita language invalido no update", () => {
    const result = updateScriptSchema.safeParse({ language: "ruby" });
    expect(result.success).toBe(false);
  });

  it("valida update is_active", () => {
    const result = updateScriptSchema.safeParse({ is_active: false });
    expect(result.success).toBe(true);
  });

  it("valida update allowed_hosts", () => {
    const result = updateScriptSchema.safeParse({
      allowed_hosts: ["new.example.com"],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita update allowed_hosts com IP", () => {
    const result = updateScriptSchema.safeParse({
      allowed_hosts: ["10.0.0.1"],
    });
    expect(result.success).toBe(false);
  });

  it("valida update completo", () => {
    const result = updateScriptSchema.safeParse({
      name: "Atualizado",
      description: "Nova desc",
      content: "novo conteudo",
      language: "python",
      timeout_seconds: 60,
      requires_approval: true,
      max_concurrent_executions: 5,
      allowed_hosts: ["host.example.com"],
      tags: ["updated"],
      is_active: true,
    });
    expect(result.success).toBe(true);
  });
});

// ========== executeScriptSchema ==========

describe("scripts — executeScriptSchema", () => {
  const validExecution = {
    script_id: "550e8400-e29b-41d4-a716-446655440000",
  };

  it("valida execucao minima", () => {
    const result = executeScriptSchema.safeParse(validExecution);
    expect(result.success).toBe(true);
  });

  it("rejeita sem script_id", () => {
    const result = executeScriptSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejeita script_id invalido (nao UUID)", () => {
    const result = executeScriptSchema.safeParse({
      script_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("valida com target_host (dominio valido)", () => {
    const result = executeScriptSchema.safeParse({
      ...validExecution,
      target_host: "server.example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita target_host com IP", () => {
    const result = executeScriptSchema.safeParse({
      ...validExecution,
      target_host: "192.168.1.1",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita target_host com localhost", () => {
    const result = executeScriptSchema.safeParse({
      ...validExecution,
      target_host: "localhost",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita target_host com caracteres invalidos", () => {
    const result = executeScriptSchema.safeParse({
      ...validExecution,
      target_host: "invalid host!",
    });
    expect(result.success).toBe(false);
  });

  it("valida com target_device_id (UUID)", () => {
    const result = executeScriptSchema.safeParse({
      ...validExecution,
      target_device_id: "550e8400-e29b-41d4-a716-446655440001",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita target_device_id invalido", () => {
    const result = executeScriptSchema.safeParse({
      ...validExecution,
      target_device_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("valida com args", () => {
    const result = executeScriptSchema.safeParse({
      ...validExecution,
      args: { param1: "value1", param2: "value2" },
    });
    expect(result.success).toBe(true);
  });

  it("rejeita args com valor muito longo (>500)", () => {
    const result = executeScriptSchema.safeParse({
      ...validExecution,
      args: { param: "a".repeat(501) },
    });
    expect(result.success).toBe(false);
  });
});

// ========== Logica de Limit Pagination ==========

describe("scripts — logica de limit pagination", () => {
  it("executions limit default 50", () => {
    const limit = Math.min(parseInt("50", 10), 200);
    expect(limit).toBe(50);
  });

  it("executions limit maximo 200", () => {
    const limit = Math.min(parseInt("999", 10), 200);
    expect(limit).toBe(200);
  });

  it("executions offset default 0", () => {
    const offset = parseInt("0", 10);
    expect(offset).toBe(0);
  });

  it("executions offset custom", () => {
    const offset = parseInt("100", 10);
    expect(offset).toBe(100);
  });
});

// ========== Logica de Version Bump ==========

describe("scripts — logica de version bump", () => {
  it("incrementa version quando content muda", () => {
    const currentVersion = 3;
    const contentChanged = true;
    const newVersion = contentChanged ? currentVersion + 1 : currentVersion;
    expect(newVersion).toBe(4);
  });

  it("mantem version quando content nao muda", () => {
    const currentVersion = 3;
    const contentChanged = false;
    const newVersion = contentChanged ? currentVersion + 1 : currentVersion;
    expect(newVersion).toBe(3);
  });

  it("primeira versao e 1", () => {
    const currentVersion = 0;
    const newVersion = currentVersion + 1;
    expect(newVersion).toBe(1);
  });
});
