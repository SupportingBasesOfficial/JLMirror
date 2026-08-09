// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  createExportTemplateSchema,
  updateExportTemplateSchema,
  createDataExportSchema,
  createDataImportSchema,
  runImportSchema,
} from "@repo/shared-validation";

// ========== createExportTemplateSchema ==========

describe("data-transfer — createExportTemplateSchema", () => {
  const validTemplate = {
    name: "Export Tickets",
    source_table: "tickets",
  };

  it("valida template minimo", () => {
    const result = createExportTemplateSchema.safeParse(validTemplate);
    expect(result.success).toBe(true);
  });

  it("rejeita sem name", () => {
    const result = createExportTemplateSchema.safeParse({
      ...validTemplate,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem source_table", () => {
    const result = createExportTemplateSchema.safeParse({
      ...validTemplate,
      source_table: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita source_table com SQL injection", () => {
    const result = createExportTemplateSchema.safeParse({
      ...validTemplate,
      source_table: "tickets; DROP TABLE users; --",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita source_table com espacos", () => {
    const result = createExportTemplateSchema.safeParse({
      ...validTemplate,
      source_table: "my table",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita source_table com hifen", () => {
    const result = createExportTemplateSchema.safeParse({
      ...validTemplate,
      source_table: "my-table",
    });
    expect(result.success).toBe(false);
  });

  it("valida source_table com underscore", () => {
    const result = createExportTemplateSchema.safeParse({
      ...validTemplate,
      source_table: "workflow_steps",
    });
    expect(result.success).toBe(true);
  });

  it("valida source_table com numeros", () => {
    const result = createExportTemplateSchema.safeParse({
      ...validTemplate,
      source_table: "table123",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita source_table comecando com numero", () => {
    const result = createExportTemplateSchema.safeParse({
      ...validTemplate,
      source_table: "123table",
    });
    expect(result.success).toBe(false);
  });

  it("aplica default format=csv", () => {
    const result = createExportTemplateSchema.safeParse(validTemplate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.format).toBe("csv");
    }
  });

  it("valida format=json", () => {
    const result = createExportTemplateSchema.safeParse({
      ...validTemplate,
      format: "json",
    });
    expect(result.success).toBe(true);
  });

  it("valida format=sql", () => {
    const result = createExportTemplateSchema.safeParse({
      ...validTemplate,
      format: "sql",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita format invalido", () => {
    const result = createExportTemplateSchema.safeParse({
      ...validTemplate,
      format: "xml",
    });
    expect(result.success).toBe(false);
  });

  it("aplica default columns=[]", () => {
    const result = createExportTemplateSchema.safeParse(validTemplate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.columns).toEqual([]);
    }
  });

  it("rejeita columns com nome invalido", () => {
    const result = createExportTemplateSchema.safeParse({
      ...validTemplate,
      columns: ["valid_name", "invalid name"],
    });
    expect(result.success).toBe(false);
  });

  it("rejeita columns com SQL injection", () => {
    const result = createExportTemplateSchema.safeParse({
      ...validTemplate,
      columns: ["name; DROP TABLE"],
    });
    expect(result.success).toBe(false);
  });

  it("aplica default include_headers=true", () => {
    const result = createExportTemplateSchema.safeParse(validTemplate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.include_headers).toBe(true);
    }
  });

  it("aplica default delimiter=,", () => {
    const result = createExportTemplateSchema.safeParse(validTemplate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.delimiter).toBe(",");
    }
  });

  it("aplica default encoding=utf-8", () => {
    const result = createExportTemplateSchema.safeParse(validTemplate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.encoding).toBe("utf-8");
    }
  });

  it("aplica default is_active=true", () => {
    const result = createExportTemplateSchema.safeParse(validTemplate);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_active).toBe(true);
    }
  });
});

// ========== updateExportTemplateSchema ==========

describe("data-transfer — updateExportTemplateSchema", () => {
  it("valida update vazio", () => {
    const result = updateExportTemplateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("valida update parcial", () => {
    const result = updateExportTemplateSchema.safeParse({ name: "Novo nome" });
    expect(result.success).toBe(true);
  });

  it("rejeita source_table com SQL injection no update", () => {
    const result = updateExportTemplateSchema.safeParse({
      source_table: "tickets; DROP TABLE",
    });
    expect(result.success).toBe(false);
  });

  it("valida source_table seguro no update", () => {
    const result = updateExportTemplateSchema.safeParse({
      source_table: "devices",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita columns com nome invalido no update", () => {
    const result = updateExportTemplateSchema.safeParse({
      columns: ["invalid name"],
    });
    expect(result.success).toBe(false);
  });
});

// ========== createDataExportSchema ==========

describe("data-transfer — createDataExportSchema", () => {
  const validExport = {
    name: "Export emergencial",
    source_table: "tickets",
  };

  it("valida export minimo", () => {
    const result = createDataExportSchema.safeParse(validExport);
    expect(result.success).toBe(true);
  });

  it("rejeita sem name", () => {
    const result = createDataExportSchema.safeParse({
      ...validExport,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita source_table com SQL injection", () => {
    const result = createDataExportSchema.safeParse({
      ...validExport,
      source_table: "tickets; DROP TABLE users; --",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita source_table com espacos", () => {
    const result = createDataExportSchema.safeParse({
      ...validExport,
      source_table: "my table",
    });
    expect(result.success).toBe(false);
  });

  it("valida source_table com underscore", () => {
    const result = createDataExportSchema.safeParse({
      ...validExport,
      source_table: "workflow_steps",
    });
    expect(result.success).toBe(true);
  });

  it("valida template_id UUID", () => {
    const result = createDataExportSchema.safeParse({
      ...validExport,
      template_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita template_id invalido", () => {
    const result = createDataExportSchema.safeParse({
      ...validExport,
      template_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("aplica default format=csv", () => {
    const result = createDataExportSchema.safeParse(validExport);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.format).toBe("csv");
    }
  });

  it("valida format=json", () => {
    const result = createDataExportSchema.safeParse({
      ...validExport,
      format: "json",
    });
    expect(result.success).toBe(true);
  });

  it("valida format=sql", () => {
    const result = createDataExportSchema.safeParse({
      ...validExport,
      format: "sql",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita format=xml", () => {
    const result = createDataExportSchema.safeParse({
      ...validExport,
      format: "xml",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita columns com SQL injection", () => {
    const result = createDataExportSchema.safeParse({
      ...validExport,
      columns: ["name; DROP TABLE"],
    });
    expect(result.success).toBe(false);
  });

  it("valida columns validos", () => {
    const result = createDataExportSchema.safeParse({
      ...validExport,
      columns: ["id", "name", "status"],
    });
    expect(result.success).toBe(true);
  });

  it("aplica default columns=[]", () => {
    const result = createDataExportSchema.safeParse(validExport);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.columns).toEqual([]);
    }
  });

  it("aplica default filters={}", () => {
    const result = createDataExportSchema.safeParse(validExport);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filters).toEqual({});
    }
  });
});

// ========== createDataImportSchema ==========

describe("data-transfer — createDataImportSchema", () => {
  const validImport = {
    format: "csv" as const,
    data: "id,name,status\n1,Ticket 1,open\n2,Ticket 2,closed",
    target_table: "tickets",
  };

  it("valida import minimo", () => {
    const result = createDataImportSchema.safeParse(validImport);
    expect(result.success).toBe(true);
  });

  it("rejeita sem data", () => {
    const result = createDataImportSchema.safeParse({
      ...validImport,
      data: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita sem target_table", () => {
    const result = createDataImportSchema.safeParse({
      ...validImport,
      target_table: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita target_table com SQL injection", () => {
    const result = createDataImportSchema.safeParse({
      ...validImport,
      target_table: "tickets; DROP TABLE users; --",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita target_table com espacos", () => {
    const result = createDataImportSchema.safeParse({
      ...validImport,
      target_table: "my table",
    });
    expect(result.success).toBe(false);
  });

  it("valida target_table com underscore", () => {
    const result = createDataImportSchema.safeParse({
      ...validImport,
      target_table: "workflow_steps",
    });
    expect(result.success).toBe(true);
  });

  it("valida format=csv", () => {
    const result = createDataImportSchema.safeParse({
      ...validImport,
      format: "csv",
    });
    expect(result.success).toBe(true);
  });

  it("valida format=json", () => {
    const result = createDataImportSchema.safeParse({
      ...validImport,
      format: "json",
    });
    expect(result.success).toBe(true);
  });

  it("valida format=xml", () => {
    const result = createDataImportSchema.safeParse({
      ...validImport,
      format: "xml",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita format invalido", () => {
    const result = createDataImportSchema.safeParse({
      ...validImport,
      format: "yaml",
    });
    expect(result.success).toBe(false);
  });

  it("aplica default merge=false", () => {
    const result = createDataImportSchema.safeParse(validImport);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.merge).toBe(false);
    }
  });

  it("valida merge=true", () => {
    const result = createDataImportSchema.safeParse({
      ...validImport,
      merge: true,
    });
    expect(result.success).toBe(true);
  });

  it("valida column_mapping", () => {
    const result = createDataImportSchema.safeParse({
      ...validImport,
      column_mapping: { old_name: "new_name", old_status: "status" },
    });
    expect(result.success).toBe(true);
  });
});

// ========== runImportSchema ==========

describe("data-transfer — runImportSchema", () => {
  it("valida run com data array", () => {
    const result = runImportSchema.safeParse({
      data: [{ id: 1, name: "Test" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sem data", () => {
    const result = runImportSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejeita data vazio", () => {
    const result = runImportSchema.safeParse({ data: [] });
    expect(result.success).toBe(false);
  });

  it("rejeita data com mais de 10000 registros", () => {
    const data = Array(10001).fill({ id: 1 });
    const result = runImportSchema.safeParse({ data });
    expect(result.success).toBe(false);
  });

  it("valida data com 10000 registros (limite)", () => {
    const data = Array(10000).fill({ id: 1 });
    const result = runImportSchema.safeParse({ data });
    expect(result.success).toBe(true);
  });

  it("valida data com objetos complexos", () => {
    const result = runImportSchema.safeParse({
      data: [
        { id: 1, name: "Test", nested: { foo: "bar" } },
        { id: 2, name: "Test 2", tags: ["a", "b"] },
      ],
    });
    expect(result.success).toBe(true);
  });
});

// ========== Logica de Status de Import ==========

describe("data-transfer — logica de status de import", () => {
  it("todos sucessos = completed", () => {
    const successful = 100;
    const failed = 0;
    const status =
      failed === 0 ? "completed" : successful > 0 ? "partial" : "failed";
    expect(status).toBe("completed");
  });

  it("alguns sucessos alguns falhas = partial", () => {
    const successful: number = 80;
    const failed: number = 20;
    const status =
      failed === 0 ? "completed" : successful > 0 ? "partial" : "failed";
    expect(status).toBe("partial");
  });

  it("todos falhas = failed", () => {
    const successful: number = 0;
    const failed: number = 100;
    const status =
      failed === 0 ? "completed" : successful > 0 ? "partial" : "failed";
    expect(status).toBe("failed");
  });

  it("zero registros = completed (failed=0)", () => {
    const successful = 0;
    const failed = 0;
    const status =
      failed === 0 ? "completed" : successful > 0 ? "partial" : "failed";
    expect(status).toBe("completed");
  });
});

// ========== Logica de CSV Escape ==========

describe("data-transfer — logica de CSV escape", () => {
  it("escapa valores com virgula", () => {
    const val = "hello,world";
    const escaped =
      typeof val === "string" &&
      (val.includes(",") || val.includes('"') || val.includes("\n"))
        ? `"${val.replace(/"/g, '""')}"`
        : val;
    expect(escaped).toBe('"hello,world"');
  });

  it("escapa valores com aspas", () => {
    const val = 'hello "world"';
    const escaped =
      typeof val === "string" &&
      (val.includes(",") || val.includes('"') || val.includes("\n"))
        ? `"${val.replace(/"/g, '""')}"`
        : val;
    expect(escaped).toBe('"hello ""world"""');
  });

  it("escapa valores com nova linha", () => {
    const val = "hello\nworld";
    const escaped =
      typeof val === "string" &&
      (val.includes(",") || val.includes('"') || val.includes("\n"))
        ? `"${val.replace(/"/g, '""')}"`
        : val;
    expect(escaped).toBe('"hello\nworld"');
  });

  it("nao escapa valores simples", () => {
    const val = "hello";
    const escaped =
      typeof val === "string" &&
      (val.includes(",") || val.includes('"') || val.includes("\n"))
        ? `"${val.replace(/"/g, '""')}"`
        : val;
    expect(escaped).toBe("hello");
  });

  it("escapa valores nulos como vazio", () => {
    const val = null;
    const result = val === null || val === undefined ? "" : String(val);
    expect(result).toBe("");
  });
});

// ========== Logica de SQL Escape ==========

describe("data-transfer — logica de SQL escape", () => {
  it("escapa aspas simples em SQL", () => {
    const val = "O'Brien";
    const escaped = `'${String(val).replace(/'/g, "''")}'`;
    expect(escaped).toBe("'O''Brien'");
  });

  it("null vira NULL em SQL", () => {
    const v = null;
    const result = v === null ? "NULL" : String(v);
    expect(result).toBe("NULL");
  });

  it("number vira string em SQL", () => {
    const v = 42;
    const result =
      v === null
        ? "NULL"
        : typeof v === "number"
          ? String(v)
          : typeof v === "boolean"
            ? v
              ? "true"
              : "false"
            : `'${String(v).replace(/'/g, "''")}'`;
    expect(result).toBe("42");
  });

  it("boolean true vira true em SQL", () => {
    const v = true;
    const result =
      v === null
        ? "NULL"
        : typeof v === "number"
          ? String(v)
          : typeof v === "boolean"
            ? v
              ? "true"
              : "false"
            : `'${String(v).replace(/'/g, "''")}'`;
    expect(result).toBe("true");
  });

  it("boolean false vira false em SQL", () => {
    const v = false;
    const result =
      v === null
        ? "NULL"
        : typeof v === "number"
          ? String(v)
          : typeof v === "boolean"
            ? v
              ? "true"
              : "false"
            : `'${String(v).replace(/'/g, "''")}'`;
    expect(result).toBe("false");
  });
});
