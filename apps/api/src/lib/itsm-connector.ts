// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// ITSM Connector Framework — framework agnostico para integracao com ITSM externo
// Suporta Jira, FreshService, ServiceNow, Zendesk e custom via mapeamento de campos

export interface ITSMConnectorConfig {
  id: string;
  tenant_id: string;
  name: string;
  connector_type: string;
  base_url: string;
  auth_type: string;
  api_key_encrypted: string | null;
  username: string | null;
  password_encrypted: string | null;
  bearer_token_encrypted: string | null;
  oauth_client_id: string | null;
  oauth_client_secret_encrypted: string | null;
  oauth_token_url: string | null;
  field_mapping: Record<string, string>;
  is_active: boolean;
}

export interface ITSMCreateTicketPayload {
  title: string;
  description: string;
  severity: string;
  source_id: string;
  source_type: string;
  [key: string]: unknown;
}

export interface ITSMResult {
  success: boolean;
  external_ticket_id?: string;
  external_ticket_url?: string;
  error?: string;
  response?: Record<string, unknown>;
}

// Aplica mapeamento de campos: transforma campos do JLMIRROR para campos do ITSM
export function mapFields(
  payload: ITSMCreateTicketPayload,
  fieldMapping: Record<string, string>,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};

  for (const [jlmirrorField, itsmField] of Object.entries(fieldMapping)) {
    if (jlmirrorField in payload) {
      mapped[itsmField] = payload[jlmirrorField];
    }
  }

  // Campos padrao que sempre sao enviados mesmo sem mapeamento explicito
  if (!mapped["summary"] && payload.title) mapped["summary"] = payload.title;
  if (!mapped["description"] && payload.description) mapped["description"] = payload.description;
  if (!mapped["subject"] && payload.title) mapped["subject"] = payload.title;

  return mapped;
}

// Obtem headers de autenticacao baseado no tipo
function getAuthHeaders(config: ITSMConnectorConfig): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  switch (config.auth_type) {
    case "api_key":
      if (config.api_key_encrypted) {
        headers["Authorization"] = `Bearer ${config.api_key_encrypted}`;
      }
      break;
    case "basic":
      if (config.username && config.password_encrypted) {
        const credentials = Buffer.from(`${config.username}:${config.password_encrypted}`).toString("base64");
        headers["Authorization"] = `Basic ${credentials}`;
      }
      break;
    case "bearer":
      if (config.bearer_token_encrypted) {
        headers["Authorization"] = `Bearer ${config.bearer_token_encrypted}`;
      }
      break;
    case "oauth2":
      // OAuth2 requer fluxo adicional — placeholder para implementacao futura
      break;
  }

  return headers;
}

// Obtem o endpoint de criacao de ticket baseado no tipo de connector
function getCreateEndpoint(config: ITSMConnectorConfig): string {
  const baseUrl = config.base_url.replace(/\/$/, "");

  switch (config.connector_type) {
    case "jira":
      return `${baseUrl}/rest/api/2/issue`;
    case "freshservice":
      return `${baseUrl}/api/v2/tickets`;
    case "servicenow":
      return `${baseUrl}/api/now/table/incident`;
    case "zendesk":
      return `${baseUrl}/api/v2/tickets`;
    case "custom":
      return `${baseUrl}/tickets`;
    default:
      return `${baseUrl}/tickets`;
  }
}

// Obtem o endpoint de atualizacao de ticket
function getUpdateEndpoint(config: ITSMConnectorConfig, externalId: string): string {
  const baseUrl = config.base_url.replace(/\/$/, "");

  switch (config.connector_type) {
    case "jira":
      return `${baseUrl}/rest/api/2/issue/${externalId}`;
    case "freshservice":
      return `${baseUrl}/api/v2/tickets/${externalId}`;
    case "servicenow":
      return `${baseUrl}/api/now/table/incident/${externalId}`;
    case "zendesk":
      return `${baseUrl}/api/v2/tickets/${externalId}`;
    case "custom":
      return `${baseUrl}/tickets/${externalId}`;
    default:
      return `${baseUrl}/tickets/${externalId}`;
  }
}

// Cria um ticket no ITSM externo
export async function createTicket(
  config: ITSMConnectorConfig,
  payload: ITSMCreateTicketPayload,
): Promise<ITSMResult> {
  try {
    const mappedFields = mapFields(payload, config.field_mapping);
    const endpoint = getCreateEndpoint(config);
    const headers = getAuthHeaders(config);

    // Adapta o body baseado no tipo de connector
    let body: Record<string, unknown>;

    switch (config.connector_type) {
      case "jira":
        body = {
          fields: {
            project: { key: config.field_mapping["project"] ?? "JLM" },
            ...mappedFields,
          },
        };
        break;
      case "freshservice":
        body = mappedFields;
        break;
      case "servicenow":
        body = mappedFields;
        break;
      case "zendesk":
        body = { ticket: mappedFields };
        break;
      default:
        body = mappedFields;
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    const responseText = await res.text();
    let responseJson: Record<string, unknown> = {};
    try {
      responseJson = JSON.parse(responseText);
    } catch {
      // Resposta nao-JSON
    }

    if (!res.ok) {
      return {
        success: false,
        error: `HTTP ${res.status}: ${responseText.substring(0, 200)}`,
        response: responseJson,
      };
    }

    // Extrai ID e URL do ticket externo
    let externalId: string | undefined;
    let externalUrl: string | undefined;

    switch (config.connector_type) {
      case "jira":
        externalId = responseJson.id as string;
        externalUrl = responseJson.self as string;
        break;
      case "freshservice":
        externalId = (responseJson.ticket as Record<string, unknown>)?.id as string;
        externalUrl = (responseJson.ticket as Record<string, unknown>)?.url as string;
        break;
      case "servicenow":
        externalId = (responseJson.result as Record<string, unknown>)?.sys_id as string;
        externalUrl = `${config.base_url}/incident.do?sys_id=${externalId}`;
        break;
      case "zendesk":
        externalId = (responseJson.ticket as Record<string, unknown>)?.id as string;
        externalUrl = `${config.base_url}/agent/tickets/${externalId}`;
        break;
      default:
        externalId = (responseJson.id as string) ?? (responseJson.ticket_id as string);
        externalUrl = responseJson.url as string;
    }

    return {
      success: true,
      external_ticket_id: externalId,
      external_ticket_url: externalUrl,
      response: responseJson,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro desconhecido na criacao do ticket",
    };
  }
}

// Atualiza um ticket no ITSM externo
export async function updateTicket(
  config: ITSMConnectorConfig,
  externalId: string,
  updatePayload: Record<string, unknown>,
): Promise<ITSMResult> {
  try {
    const endpoint = getUpdateEndpoint(config, externalId);
    const headers = getAuthHeaders(config);

    let body: Record<string, unknown>;
    if (config.connector_type === "jira") {
      body = { fields: updatePayload };
    } else if (config.connector_type === "zendesk") {
      body = { ticket: updatePayload };
    } else {
      body = updatePayload;
    }

    const res = await fetch(endpoint, {
      method: config.connector_type === "servicenow" ? "PATCH" : "PUT",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${errorText.substring(0, 200)}` };
    }

    return { success: true, external_ticket_id: externalId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro desconhecido na atualizacao do ticket",
    };
  }
}

// Fecha um ticket no ITSM externo
export async function closeTicket(
  config: ITSMConnectorConfig,
  externalId: string,
  resolution: string,
): Promise<ITSMResult> {
  const closePayload: Record<string, unknown> = {
    status: "closed",
    resolution,
  };

  // Adapta para o campo de resolucao especifico de cada ITSM
  switch (config.connector_type) {
    case "jira":
      closePayload["resolution"] = { content: resolution, type: "doc" };
      break;
    case "freshservice":
      closePayload["resolution"] = { body: resolution };
      break;
    case "servicenow":
      closePayload["close_notes"] = resolution;
      closePayload["state"] = "7";
      break;
    case "zendesk":
      closePayload["comment"] = { body: resolution, public: true };
      closePayload["status"] = "solved";
      break;
  }

  return updateTicket(config, externalId, closePayload);
}
