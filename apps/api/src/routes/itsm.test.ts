// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
import { describe, it, expect } from "vitest";
import {
  itsmConnectorSchema,
  itsmCreateTicketSchema,
} from "@repo/shared-validation";

// ========== itsmConnectorSchema ==========

describe("itsm — itsmConnectorSchema", () => {
  const validConnector = {
    name: "Jira Production",
    connector_type: "jira" as const,
    base_url: "https://company.atlassian.net",
    auth_type: "api_key" as const,
  };

  it("valida connector minimo", () => {
    const result = itsmConnectorSchema.safeParse(validConnector);
    expect(result.success).toBe(true);
  });

  it("rejeita sem name", () => {
    const result = itsmConnectorSchema.safeParse({
      ...validConnector,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita name muito longo (>200)", () => {
    const result = itsmConnectorSchema.safeParse({
      ...validConnector,
      name: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("valida connector_type freshservice", () => {
    const result = itsmConnectorSchema.safeParse({
      ...validConnector,
      connector_type: "freshservice",
    });
    expect(result.success).toBe(true);
  });

  it("valida connector_type servicenow", () => {
    const result = itsmConnectorSchema.safeParse({
      ...validConnector,
      connector_type: "servicenow",
    });
    expect(result.success).toBe(true);
  });

  it("valida connector_type zendesk", () => {
    const result = itsmConnectorSchema.safeParse({
      ...validConnector,
      connector_type: "zendesk",
    });
    expect(result.success).toBe(true);
  });

  it("valida connector_type custom", () => {
    const result = itsmConnectorSchema.safeParse({
      ...validConnector,
      connector_type: "custom",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita connector_type invalido", () => {
    const result = itsmConnectorSchema.safeParse({
      ...validConnector,
      connector_type: "trello",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita base_url invalida", () => {
    const result = itsmConnectorSchema.safeParse({
      ...validConnector,
      base_url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita base_url ftp", () => {
    const result = itsmConnectorSchema.safeParse({
      ...validConnector,
      base_url: "ftp://example.com",
    });
    expect(result.success).toBe(false);
  });

  it("valida base_url http", () => {
    const result = itsmConnectorSchema.safeParse({
      ...validConnector,
      base_url: "http://internal-service:8080",
    });
    expect(result.success).toBe(true);
  });

  it("valida auth_type basic", () => {
    const result = itsmConnectorSchema.safeParse({
      ...validConnector,
      auth_type: "basic",
    });
    expect(result.success).toBe(true);
  });

  it("valida auth_type bearer", () => {
    const result = itsmConnectorSchema.safeParse({
      ...validConnector,
      auth_type: "bearer",
    });
    expect(result.success).toBe(true);
  });

  it("valida auth_type oauth2", () => {
    const result = itsmConnectorSchema.safeParse({
      ...validConnector,
      auth_type: "oauth2",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita auth_type invalido", () => {
    const result = itsmConnectorSchema.safeParse({
      ...validConnector,
      auth_type: "custom",
    });
    expect(result.success).toBe(false);
  });

  it("valida sync_direction inbound", () => {
    const result = itsmConnectorSchema.safeParse({
      ...validConnector,
      sync_direction: "inbound",
    });
    expect(result.success).toBe(true);
  });

  it("valida sync_direction bidirectional", () => {
    const result = itsmConnectorSchema.safeParse({
      ...validConnector,
      sync_direction: "bidirectional",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sync_direction invalido", () => {
    const result = itsmConnectorSchema.safeParse({
      ...validConnector,
      sync_direction: "one-way",
    });
    expect(result.success).toBe(false);
  });

  it("valida oauth_token_url", () => {
    const result = itsmConnectorSchema.safeParse({
      ...validConnector,
      auth_type: "oauth2",
      oauth_token_url: "https://auth.example.com/token",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita oauth_token_url invalida", () => {
    const result = itsmConnectorSchema.safeParse({
      ...validConnector,
      auth_type: "oauth2",
      oauth_token_url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("valida connector completo", () => {
    const result = itsmConnectorSchema.safeParse({
      name: "Jira Production",
      connector_type: "jira",
      base_url: "https://company.atlassian.net",
      auth_type: "api_key",
      api_key: "key-123",
      username: "bot@company.com",
      field_mapping: { summary: "title", description: "description" },
      sync_direction: "bidirectional",
      auto_create_on_incident: true,
      auto_update_on_resolve: true,
      is_active: true,
    });
    expect(result.success).toBe(true);
  });
});

// ========== itsmCreateTicketSchema ==========

describe("itsm — itsmCreateTicketSchema", () => {
  const validTicket = {
    title: "Server down — PROD-01",
  };

  it("valida ticket minimo", () => {
    const result = itsmCreateTicketSchema.safeParse(validTicket);
    expect(result.success).toBe(true);
  });

  it("rejeita sem title", () => {
    const result = itsmCreateTicketSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejeita title vazio", () => {
    const result = itsmCreateTicketSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });

  it("rejeita title muito longo (>500)", () => {
    const result = itsmCreateTicketSchema.safeParse({
      title: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("valida com description", () => {
    const result = itsmCreateTicketSchema.safeParse({
      ...validTicket,
      description: "Production server is not responding",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita description muito longa (>10000)", () => {
    const result = itsmCreateTicketSchema.safeParse({
      ...validTicket,
      description: "a".repeat(10001),
    });
    expect(result.success).toBe(false);
  });

  it("valida severity info", () => {
    const result = itsmCreateTicketSchema.safeParse({
      ...validTicket,
      severity: "info",
    });
    expect(result.success).toBe(true);
  });

  it("valida severity warning", () => {
    const result = itsmCreateTicketSchema.safeParse({
      ...validTicket,
      severity: "warning",
    });
    expect(result.success).toBe(true);
  });

  it("valida severity critical", () => {
    const result = itsmCreateTicketSchema.safeParse({
      ...validTicket,
      severity: "critical",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita severity invalido", () => {
    const result = itsmCreateTicketSchema.safeParse({
      ...validTicket,
      severity: "blocker",
    });
    expect(result.success).toBe(false);
  });

  it("valida com extra_fields", () => {
    const result = itsmCreateTicketSchema.safeParse({
      ...validTicket,
      extra_fields: { priority: "P1", assignee: "team-ops" },
    });
    expect(result.success).toBe(true);
  });
});
