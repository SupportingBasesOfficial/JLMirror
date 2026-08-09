// @ai-context: .zero-error/architecture-map.md#ingress
// @ai-restriction: .zero-error/code-standards.md#error-handling
// Endpoint de documentação OpenAPI 3.0 + Swagger UI
// Serve spec JSON em /api/v1/docs e UI interativa em /api/v1/docs/ui
// Protegido por DOCS_PASSWORD env var (Basic Auth)

import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { timingSafeEqual } from "node:crypto";
import { logger } from "@repo/logger";
import { rateLimit } from "../middleware/rate-limit.js";

// Rate limit para tentativas de acesso aos docs (protege contra brute force de DOCS_PASSWORD)
const docsRateLimit = rateLimit({
  windowMs: 60_000,
  maxRequests: 30,
  keyPrefix: "docs-auth",
});

function checkDocsAuth(c: {
  req: { header: (name: string) => string | undefined };
}): boolean {
  const expectedPassword = process.env.DOCS_PASSWORD;
  if (!expectedPassword) return false;
  const authHeader = c.req.header("authorization") ?? "";
  if (!authHeader.startsWith("Basic ")) return false;
  const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
  const [, password] = decoded.split(":");
  if (!password) return false;
  const expectedBuf = Buffer.from(expectedPassword, "utf8");
  const providedBuf = Buffer.from(password, "utf8");
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

const docsAuthMiddleware = createMiddleware(async (c, next) => {
  if (checkDocsAuth(c)) {
    await next();
    return;
  }
  // Loga tentativas falhadas para auditoria de seguranca
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  logger.warn("Tentativa de acesso negada aos docs", {
    ip,
    path: c.req.path,
  });
  c.header("WWW-Authenticate", 'Basic realm="JLMIRROR API Docs"');
  return c.json(
    { error: { code: "UNAUTHORIZED", message: "Acesso negado" } },
    401,
  );
});

export const docsRoute = new Hono();

const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "JLMIRROR API",
    description:
      "API multi-tenant para gestão de infraestrutura IT — monitoramento Zabbix, scripts, tickets, firewall, K8s, SSL, backups, compliance e mais.",
    version: "1.0.0",
    contact: {
      name: "JL Informática",
      url: "https://jlinformatica.com.br",
    },
  },
  servers: [
    { url: "http://localhost:3001", description: "Desenvolvimento" },
    { url: "https://api.jlinformatica.com.br", description: "Produção" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
            },
            required: ["code", "message"],
          },
        },
        required: ["error"],
      },
      PaginatedResponse: {
        type: "object",
        properties: {
          data: { type: "array", items: {} },
          pagination: {
            type: "object",
            properties: {
              page: { type: "integer" },
              limit: { type: "integer" },
              total: { type: "integer" },
              totalPages: { type: "integer" },
              hasNext: { type: "boolean" },
              hasPrev: { type: "boolean" },
            },
            required: [
              "page",
              "limit",
              "total",
              "totalPages",
              "hasNext",
              "hasPrev",
            ],
          },
        },
        required: ["data", "pagination"],
      },
      HealthStatus: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["healthy", "degraded", "unhealthy"],
          },
          checks: {
            type: "object",
            properties: {
              db: { type: "object" },
              redis: { type: "object" },
              zabbix: { type: "object" },
            },
          },
          timestamp: { type: "string", format: "date-time" },
          uptime: { type: "number" },
        },
        required: ["status", "checks", "timestamp", "uptime"],
      },
    },
    parameters: {
      PageParam: {
        name: "page",
        in: "query",
        description: "Número da página (começa em 1)",
        schema: { type: "integer", minimum: 1, default: 1 },
      },
      LimitParam: {
        name: "limit",
        in: "query",
        description: "Itens por página (máx 100)",
        schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
      SortParam: {
        name: "sort",
        in: "query",
        description: "Campo para ordenação",
        schema: { type: "string", default: "created_at" },
      },
      OrderParam: {
        name: "order",
        in: "query",
        description: "Direção da ordenação",
        schema: { type: "string", enum: ["asc", "desc"], default: "desc" },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  tags: [
    { name: "Auth", description: "Autenticação e autorização" },
    { name: "Health", description: "Health checks e métricas" },
    { name: "Devices", description: "Dispositivos de rede" },
    { name: "Monitoring", description: "Monitoramento Zabbix" },
    { name: "Scripts", description: "Scripts e execuções" },
    { name: "Tickets", description: "Tickets e categorias" },
    { name: "Tasks", description: "Tarefas agendadas" },
    { name: "Webhooks", description: "Webhooks e entregas" },
    { name: "Firewall", description: "Regras de firewall" },
    { name: "K8s", description: "Kubernetes" },
    { name: "SSL", description: "Certificados SSL" },
    { name: "Backup", description: "Backups" },
    { name: "Assets", description: "Ativos" },
    { name: "Capacity", description: "Capacidade" },
    { name: "Compliance", description: "Compliance" },
    { name: "Reports", description: "Relatórios" },
    { name: "Changes", description: "Gestão de mudanças" },
    { name: "Admin", description: "Administração global" },
    { name: "Dashboard", description: "Dashboards executivos" },
    { name: "Notifications", description: "Notificações" },
    { name: "RBAC", description: "Roles e permissões" },
    { name: "Audit", description: "Logs de auditoria" },
    { name: "API Keys", description: "Chaves de API" },
    { name: "Feature Flags", description: "Feature flags" },
    { name: "Settings", description: "Configurações" },
    { name: "Profile", description: "Perfil do usuário" },
    { name: "Data Transfer", description: "Transferência de dados" },
    { name: "KB", description: "Base de conhecimento" },
    { name: "System Health", description: "Saúde do sistema" },
  ],
  paths: {
    "/api/v1/health": {
      get: {
        tags: ["Health"],
        summary: "Health check completo",
        description: "Verifica status do banco, Redis e Zabbix",
        security: [],
        responses: {
          "200": {
            description: "Sistema saudável ou degradado",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthStatus" },
              },
            },
          },
          "503": {
            description: "Sistema indisponível",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthStatus" },
              },
            },
          },
        },
      },
    },
    "/api/v1/health/live": {
      get: {
        tags: ["Health"],
        summary: "Liveness probe",
        security: [],
        responses: { "200": { description: "Aplicação ativa" } },
      },
    },
    "/api/v1/health/ready": {
      get: {
        tags: ["Health"],
        summary: "Readiness probe",
        security: [],
        responses: {
          "200": { description: "Pronto para receber tráfego" },
          "503": { description: "Não pronto" },
        },
      },
    },
    "/api/v1/metrics": {
      get: {
        tags: ["Health"],
        summary: "Métricas Prometheus",
        security: [],
        responses: {
          "200": {
            description: "Métricas no formato Prometheus text",
            content: { "text/plain": {} },
          },
        },
      },
    },
    "/api/v1/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login com email e senha",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 8 },
                },
                required: ["email", "password"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Tokens de acesso e refresh",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    access_token: { type: "string" },
                    refresh_token: { type: "string" },
                    expires_in: { type: "integer" },
                  },
                },
              },
            },
          },
          "401": {
            description: "Credenciais inválidas",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/api/v1/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Renovar access token",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { refresh_token: { type: "string" } },
                required: ["refresh_token"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Novo access token" },
          "401": { description: "Refresh token inválido" },
        },
      },
    },
    "/api/v1/scripts": {
      get: {
        tags: ["Scripts"],
        summary: "Listar scripts com paginação",
        parameters: [
          { $ref: "#/components/parameters/PageParam" },
          { $ref: "#/components/parameters/LimitParam" },
          { $ref: "#/components/parameters/SortParam" },
          { $ref: "#/components/parameters/OrderParam" },
          { name: "active", in: "query", schema: { type: "boolean" } },
        ],
        responses: {
          "200": {
            description: "Lista paginada de scripts",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PaginatedResponse" },
              },
            },
          },
          "401": { description: "Não autorizado" },
        },
      },
    },
    "/api/v1/executions": {
      get: {
        tags: ["Scripts"],
        summary: "Listar execuções com paginação",
        parameters: [
          { $ref: "#/components/parameters/PageParam" },
          { $ref: "#/components/parameters/LimitParam" },
          { $ref: "#/components/parameters/SortParam" },
          { $ref: "#/components/parameters/OrderParam" },
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "script_id", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Lista paginada de execuções",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PaginatedResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/tickets": {
      get: {
        tags: ["Tickets"],
        summary: "Listar tickets com filtros e paginação",
        parameters: [
          { $ref: "#/components/parameters/PageParam" },
          { $ref: "#/components/parameters/LimitParam" },
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "priority", in: "query", schema: { type: "string" } },
          { name: "category_id", in: "query", schema: { type: "string" } },
          { name: "assigned_to", in: "query", schema: { type: "string" } },
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "overdue", in: "query", schema: { type: "boolean" } },
        ],
        responses: {
          "200": {
            description: "Lista paginada de tickets",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PaginatedResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/tasks": {
      get: {
        tags: ["Tasks"],
        summary: "Listar tarefas agendadas com paginação",
        parameters: [
          { $ref: "#/components/parameters/PageParam" },
          { $ref: "#/components/parameters/LimitParam" },
          { name: "active", in: "query", schema: { type: "boolean" } },
          { name: "type", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Lista paginada de tarefas",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PaginatedResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/webhooks": {
      get: {
        tags: ["Webhooks"],
        summary: "Listar webhooks com paginação",
        parameters: [
          { $ref: "#/components/parameters/PageParam" },
          { $ref: "#/components/parameters/LimitParam" },
          { name: "active", in: "query", schema: { type: "boolean" } },
        ],
        responses: {
          "200": {
            description: "Lista paginada de webhooks",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PaginatedResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/zabbix/devices": {
      get: {
        tags: ["Monitoring"],
        summary: "Listar dispositivos Zabbix",
        responses: {
          "200": { description: "Lista de dispositivos" },
          "404": { description: "Configuração Zabbix não encontrada" },
        },
      },
    },
    "/api/v1/zabbix/triggers": {
      get: {
        tags: ["Monitoring"],
        summary: "Listar triggers Zabbix",
        parameters: [
          { name: "host_id", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": { description: "Lista de triggers" } },
      },
    },
    "/api/v1/devices": {
      get: {
        tags: ["Devices"],
        summary: "Listar dispositivos de rede",
        parameters: [
          { $ref: "#/components/parameters/PageParam" },
          { $ref: "#/components/parameters/LimitParam" },
        ],
        responses: { "200": { description: "Lista paginada de dispositivos" } },
      },
    },
    "/api/v1/firewall/rules": {
      get: {
        tags: ["Firewall"],
        summary: "Listar regras de firewall",
        parameters: [
          { $ref: "#/components/parameters/PageParam" },
          { $ref: "#/components/parameters/LimitParam" },
        ],
        responses: { "200": { description: "Lista paginada de regras" } },
      },
    },
    "/api/v1/k8s/clusters": {
      get: {
        tags: ["K8s"],
        summary: "Listar clusters Kubernetes",
        responses: { "200": { description: "Lista de clusters" } },
      },
    },
    "/api/v1/ssl/certificates": {
      get: {
        tags: ["SSL"],
        summary: "Listar certificados SSL",
        parameters: [
          { $ref: "#/components/parameters/PageParam" },
          { $ref: "#/components/parameters/LimitParam" },
        ],
        responses: { "200": { description: "Lista paginada de certificados" } },
      },
    },
    "/api/v1/backup": {
      get: {
        tags: ["Backup"],
        summary: "Listar backups",
        parameters: [
          { $ref: "#/components/parameters/PageParam" },
          { $ref: "#/components/parameters/LimitParam" },
        ],
        responses: { "200": { description: "Lista paginada de backups" } },
      },
    },
    "/api/v1/assets": {
      get: {
        tags: ["Assets"],
        summary: "Listar ativos",
        parameters: [
          { $ref: "#/components/parameters/PageParam" },
          { $ref: "#/components/parameters/LimitParam" },
        ],
        responses: { "200": { description: "Lista paginada de ativos" } },
      },
    },
    "/api/v1/capacity": {
      get: {
        tags: ["Capacity"],
        summary: "Listar dados de capacidade",
        responses: { "200": { description: "Dados de capacidade" } },
      },
    },
    "/api/v1/compliance": {
      get: {
        tags: ["Compliance"],
        summary: "Listar compliance",
        responses: { "200": { description: "Dados de compliance" } },
      },
    },
    "/api/v1/reports": {
      get: {
        tags: ["Reports"],
        summary: "Listar relatórios",
        responses: { "200": { description: "Lista de relatórios" } },
      },
    },
    "/api/v1/changes": {
      get: {
        tags: ["Changes"],
        summary: "Listar mudanças",
        parameters: [
          { $ref: "#/components/parameters/PageParam" },
          { $ref: "#/components/parameters/LimitParam" },
        ],
        responses: { "200": { description: "Lista paginada de mudanças" } },
      },
    },
    "/api/v1/admin/tenants": {
      get: {
        tags: ["Admin"],
        summary: "Listar tenants (global admin)",
        responses: { "200": { description: "Lista de tenants" } },
      },
    },
    "/api/v1/dashboard/overview": {
      get: {
        tags: ["Dashboard"],
        summary: "Dashboard consolidado",
        responses: { "200": { description: "KPIs e alertas consolidados" } },
      },
    },
    "/api/v1/dashboard/executive": {
      get: {
        tags: ["Dashboard"],
        summary: "Dashboard executivo",
        responses: { "200": { description: "Métricas executivas" } },
      },
    },
    "/api/v1/notifications": {
      get: {
        tags: ["Notifications"],
        summary: "Listar notificações",
        responses: { "200": { description: "Lista de notificações" } },
      },
    },
    "/api/v1/rbac/roles": {
      get: {
        tags: ["RBAC"],
        summary: "Listar roles",
        responses: { "200": { description: "Lista de roles" } },
      },
    },
    "/api/v1/rbac/permissions": {
      get: {
        tags: ["RBAC"],
        summary: "Listar permissões",
        responses: { "200": { description: "Lista de permissões" } },
      },
    },
    "/api/v1/audit": {
      get: {
        tags: ["Audit"],
        summary: "Listar logs de auditoria",
        parameters: [
          { $ref: "#/components/parameters/PageParam" },
          { $ref: "#/components/parameters/LimitParam" },
        ],
        responses: { "200": { description: "Lista paginada de logs" } },
      },
    },
    "/api/v1/api-keys": {
      get: {
        tags: ["API Keys"],
        summary: "Listar chaves de API",
        responses: { "200": { description: "Lista de chaves" } },
      },
    },
    "/api/v1/feature-flags": {
      get: {
        tags: ["Feature Flags"],
        summary: "Listar feature flags",
        responses: { "200": { description: "Lista de flags" } },
      },
    },
    "/api/v1/settings": {
      get: {
        tags: ["Settings"],
        summary: "Listar configurações",
        responses: { "200": { description: "Configurações do tenant" } },
      },
    },
    "/api/v1/profile": {
      get: {
        tags: ["Profile"],
        summary: "Perfil do usuário",
        responses: { "200": { description: "Dados do perfil" } },
      },
    },
    "/api/v1/sla/services": {
      get: {
        tags: ["SLA"],
        summary: "Lista serviços de negócio",
        responses: { "200": { description: "Lista de serviços" } },
      },
      post: {
        tags: ["SLA"],
        summary: "Cria serviço",
        responses: { "201": { description: "Serviço criado" } },
      },
    },
    "/api/v1/sla/services/{id}": {
      get: {
        tags: ["SLA"],
        summary: "Detalhe de serviço",
        responses: { "200": { description: "Serviço" } },
      },
      put: {
        tags: ["SLA"],
        summary: "Atualiza serviço",
        responses: { "200": { description: "Serviço atualizado" } },
      },
      delete: {
        tags: ["SLA"],
        summary: "Remove serviço",
        responses: { "200": { description: "Serviço removido" } },
      },
    },
    "/api/v1/sla/incidents": {
      get: {
        tags: ["SLA"],
        summary: "Lista incidentes",
        responses: { "200": { description: "Lista de incidentes" } },
      },
      post: {
        tags: ["SLA"],
        summary: "Cria incidente",
        responses: { "201": { description: "Incidente criado" } },
      },
    },
    "/api/v1/sla/incidents/{id}": {
      put: {
        tags: ["SLA"],
        summary: "Atualiza incidente",
        responses: { "200": { description: "Incidente atualizado" } },
      },
    },
    "/api/v1/sla/maintenance": {
      get: {
        tags: ["SLA"],
        summary: "Lista janelas de manutenção",
        responses: { "200": { description: "Lista de manutenções" } },
      },
      post: {
        tags: ["SLA"],
        summary: "Cria janela de manutenção",
        responses: { "201": { description: "Manutenção criada" } },
      },
    },
    "/api/v1/sla/maintenance/{id}": {
      delete: {
        tags: ["SLA"],
        summary: "Remove manutenção",
        responses: { "200": { description: "Manutenção removida" } },
      },
    },
    "/api/v1/sla/report": {
      get: {
        tags: ["SLA"],
        summary: "Relatório de SLA por serviço",
        responses: { "200": { description: "Relatório SLA" } },
      },
    },
    "/api/v1/apm/overview": {
      get: {
        tags: ["APM"],
        summary:
          "Dashboard de observabilidade runtime (traces, throughput, erros, tasks)",
        responses: { "200": { description: "Overview APM" } },
      },
    },
    "/api/v1/apm/throughput": {
      get: {
        tags: ["APM"],
        summary: "Throughput por minuto em tempo real",
        responses: { "200": { description: "Throughput data" } },
      },
    },
  },
};

docsRoute.get("/", docsRateLimit, docsAuthMiddleware, (c) => {
  // Cache de 5 min para spec JSON (imutavel entre deploys)
  c.header("Cache-Control", "private, max-age=300");
  return c.json(openApiSpec);
});

docsRoute.get("/logout", (c) => {
  c.header("Content-Type", "text/html");
  return c.body(
    `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Logout</title>
  <style>
    body { font-family: sans-serif; background: #1a1a2e; color: #e0e0e0; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .box { text-align: center; }
    p { margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="box">
    <p>Encerrando sessao...</p>
  </div>
  <script>
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/v1/docs/logout-clear', false, 'logout', 'logout');
    try { xhr.send(); } catch(e) {}
    window.location.href = '/api/v1/docs/ui';
  </script>
</body>
</html>`,
    200,
  );
});

docsRoute.get("/logout-clear", (c) => {
  return c.json({ status: "cleared" }, 401);
});

docsRoute.get("/ui", docsRateLimit, docsAuthMiddleware, (c) => {
  c.header("Content-Type", "text/html; charset=utf-8");
  // CSP: permite inline scripts/styles e fetch para mesma origem (necessario para a UI interativa)
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self' data:",
  );
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  return c.body(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JLMIRROR API — Documentação</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #e0e0e0; }
    .header { background: #16213e; padding: 20px 30px; border-bottom: 2px solid #0f3460; }
    .header h1 { color: #e94560; font-size: 1.5rem; display: inline-block; }
    .header a.logout-link { float: right; color: #8892b0; text-decoration: none; font-size: 0.85rem; padding: 6px 14px; border: 1px solid #0f3460; border-radius: 4px; margin-top: 4px; }
    .header a.logout-link:hover { background: #e74c3c; color: #fff; border-color: #e74c3c; }
    .header p { color: #8892b0; font-size: 0.9rem; margin-top: 4px; }
    .container { display: flex; max-width: 1400px; margin: 0 auto; }
    .sidebar { width: 280px; background: #16213e; min-height: calc(100vh - 80px); padding: 20px; overflow-y: auto; position: sticky; top: 0; }
    .sidebar h2 { font-size: 0.8rem; text-transform: uppercase; color: #8892b0; margin-bottom: 10px; letter-spacing: 1px; }
    .tag-group { margin-bottom: 15px; }
    .tag-btn { display: block; width: 100%; text-align: left; background: none; border: none; color: #a8d0e6; padding: 6px 10px; cursor: pointer; border-radius: 4px; font-size: 0.85rem; }
    .tag-btn:hover { background: #0f3460; }
    .tag-btn.active { background: #e94560; color: #fff; }
    .main { flex: 1; padding: 30px; min-width: 0; overflow: hidden; }
    .token-bar { background: #16213e; border-radius: 8px; padding: 16px; margin-bottom: 20px; border: 1px solid #0f3460; }
    .token-bar label { display: block; font-size: 0.8rem; color: #8892b0; margin-bottom: 6px; }
    .token-bar input { width: 100%; background: #0d1117; border: 1px solid #0f3460; border-radius: 4px; padding: 8px 12px; color: #e0e0e0; font-family: monospace; font-size: 0.85rem; }
    .token-bar input:focus { outline: none; border-color: #e94560; }
    .token-bar .hint { font-size: 0.75rem; color: #8892b0; margin-top: 6px; }
    .token-bar .token-row { display: flex; gap: 8px; }
    .token-bar .token-row input { flex: 1; }
    .logout-btn { background: #0f3460; color: #a8d0e6; border: 1px solid #0f3460; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 0.8rem; white-space: nowrap; display: none; }
    .logout-btn:hover { background: #e74c3c; color: #fff; border-color: #e74c3c; }
    .endpoint { background: #16213e; border-radius: 8px; margin-bottom: 12px; overflow: hidden; }
    .endpoint-header { display: flex; align-items: center; padding: 12px 20px; cursor: pointer; }
    .method { font-weight: 700; font-size: 0.75rem; padding: 4px 10px; border-radius: 4px; margin-right: 12px; min-width: 60px; text-align: center; }
    .method-get { background: #2ecc71; color: #fff; }
    .method-post { background: #3498db; color: #fff; }
    .method-put { background: #f39c12; color: #fff; }
    .method-delete { background: #e74c3c; color: #fff; }
    .method-patch { background: #9b59b6; color: #fff; }
    .path { color: #e0e0e0; font-family: 'Fira Code', monospace; font-size: 0.9rem; }
    .summary { color: #8892b0; font-size: 0.85rem; margin-left: auto; }
    .endpoint-body { padding: 0 20px 16px; display: none; border-top: 1px solid #0f3460; padding-top: 16px; overflow: hidden; word-break: break-word; }
    .endpoint-body.open { display: block; }
    .params-table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    .params-table th { text-align: left; color: #8892b0; font-size: 0.75rem; padding: 6px 10px; border-bottom: 1px solid #0f3460; }
    .params-table td { padding: 6px 10px; font-size: 0.85rem; border-bottom: 1px solid #0f3460; }
    .param-name { color: #a8d0e6; font-family: monospace; }
    .param-type { color: #e94560; font-size: 0.75rem; }
    .param-input { background: #0d1117; border: 1px solid #0f3460; border-radius: 3px; padding: 4px 8px; color: #e0e0e0; font-size: 0.8rem; width: 100%; }
    .param-input:focus { outline: none; border-color: #e94560; }
    .body-editor { width: 100%; min-height: 120px; background: #0d1117; border: 1px solid #0f3460; border-radius: 4px; padding: 10px; color: #e0e0e0; font-family: monospace; font-size: 0.85rem; resize: vertical; margin-top: 8px; }
    .body-editor:focus { outline: none; border-color: #e94560; }
    .try-it { margin-top: 12px; }
    .try-it-btn { background: #e94560; color: #fff; border: none; padding: 8px 20px; border-radius: 4px; cursor: pointer; font-size: 0.85rem; }
    .try-it-btn:hover { background: #c81e45; }
    .response-box { margin-top: 10px; background: #0d1117; border-radius: 4px; padding: 12px; font-family: monospace; font-size: 0.8rem; overflow-x: auto; overflow-y: auto; white-space: pre-wrap; word-break: break-all; max-width: 100%; max-height: 400px; border: 1px solid #0f3460; box-sizing: border-box; }
    .loading { text-align: center; padding: 40px; color: #8892b0; }
    .section-label { font-size: 0.8rem; color: #8892b0; margin: 12px 0 6px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="header">
    <h1>JLMIRROR API — Documentação Interativa</h1>
    <a class="logout-link" href="/api/v1/docs/logout">Logout</a>
    <p>OpenAPI 3.0.3 · Multi-tenant IT Infrastructure Management</p>
  </div>
  <div class="container">
    <div class="sidebar" id="sidebar">
      <h2>Tags</h2>
      <div id="tag-list"><div class="loading">Carregando...</div></div>
    </div>
    <div class="main" id="main">
      <div class="token-bar">
        <label for="jwt-token">� JWT Token (Bearer)</label>
        <div class="token-row">
          <input type="password" id="jwt-token" placeholder="Cole seu access_token aqui..." />
          <button class="logout-btn" id="logout-btn" onclick="document.getElementById('jwt-token').value=''; document.getElementById('logout-btn').style.display='none'; if(spec) renderEndpoints();">Logout</button>
        </div>
        <div class="hint">Faça login via <code>POST /api/v1/auth/login</code> abaixo, copie o <code>access_token</code> da resposta e cole aqui.</div>
      </div>
      <div id="endpoints"><div class="loading">Carregando endpoints...</div></div>
    </div>
  </div>
  <script>
    let spec = null;
    let currentTag = 'all';

    function getToken() {
      return document.getElementById('jwt-token').value.trim();
    }

    document.addEventListener('DOMContentLoaded', () => {
      const tokenInput = document.getElementById('jwt-token');
      const logoutBtn = document.getElementById('logout-btn');
      tokenInput.addEventListener('input', () => {
        logoutBtn.style.display = tokenInput.value.trim() ? 'block' : 'none';
        if (spec) renderEndpoints();
      });
    });

    async function loadSpec() {
      const res = await fetch('/api/v1/docs');
      spec = await res.json();
      renderTags();
      renderEndpoints();
    }

    function renderTags() {
      const tags = spec.tags || [];
      const tagList = document.getElementById('tag-list');
      let html = '<div class="tag-group"><button class="tag-btn active" data-tag="all">Todos</button></div>';
      tags.forEach(t => {
        html += '<div class="tag-group"><button class="tag-btn" data-tag="' + t.name + '">' + t.name + '</button></div>';
      });
      tagList.innerHTML = html;
      tagList.querySelectorAll('.tag-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          tagList.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          currentTag = btn.dataset.tag;
          renderEndpoints();
        });
      });
    }

    function getMethodClass(method) {
      const classes = { get: 'method-get', post: 'method-post', put: 'method-put', delete: 'method-delete', patch: 'method-patch' };
      return classes[method.toLowerCase()] || 'method-get';
    }

    function escapeHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    function renderEndpoints() {
      const paths = spec.paths || {};
      const container = document.getElementById('endpoints');
      let html = '';
      let count = 0;

      Object.entries(paths).forEach(([path, methods]) => {
        Object.entries(methods).forEach(([method, info]) => {
          const tags = info.tags || [];
          if (currentTag !== 'all' && !tags.includes(currentTag)) return;
          const params = info.parameters || [];
          const endpointId = 'ep-' + method + '-' + path.replace(/[^a-zA-Z0-9]/g, '_');

          html += '<div class="endpoint">';
          html += '<div class="endpoint-header" onclick="document.getElementById(\\'' + endpointId + '\\').classList.toggle(\\'open\\')">';
          html += '<span class="method ' + getMethodClass(method) + '">' + method.toUpperCase() + '</span>';
          html += '<span class="path">' + escapeHtml(path) + '</span>';
          html += '<span class="summary">' + escapeHtml(info.summary || '') + '</span>';
          html += '</div>';
          html += '<div class="endpoint-body" id="' + endpointId + '">';

          if (info.description) html += '<p style="color:#8892b0;font-size:0.85rem;margin-bottom:10px">' + escapeHtml(info.description) + '</p>';
          const endpointSecurity = info.security !== undefined ? info.security : (spec.security || []);
          const requiresAuth = endpointSecurity.length > 0;
          if (requiresAuth) html += '<p style="color:#e94560;font-size:0.75rem;margin-bottom:8px">Requer autenticacao JWT</p>';

          if (params.length > 0) {
            html += '<div class="section-label">Parâmetros (query)</div>';
            html += '<table class="params-table"><thead><tr><th>Nome</th><th>Tipo</th><th>Descrição</th><th>Valor</th></tr></thead><tbody>';
            params.forEach((p, i) => {
              const ref = p['$ref'] ? p['$ref'].split('/').pop() : null;
              const name = ref ? (spec.components.parameters[ref] || {}).name : p.name;
              const type = ref ? ((spec.components.parameters[ref] || {}).schema || {}).type : (p.schema || {}).type;
              const desc = ref ? (spec.components.parameters[ref] || {}).description : p.description;
              const inputId = endpointId + '-param-' + i;
              html += '<tr><td class="param-name">' + escapeHtml(name || '') + '</td><td class="param-type">' + escapeHtml(type || '') + '</td><td>' + escapeHtml(desc || '') + '</td>';
              html += '<td><input class="param-input" id="' + inputId + '" data-param-name="' + escapeHtml(name || '') + '" placeholder="' + escapeHtml(type || '') + '" /></td></tr>';
            });
            html += '</tbody></table>';
          }

          if (info.requestBody) {
            const rb = info.requestBody;
            const jsonContent = rb.content && rb.content['application/json'];
            const schema = jsonContent && jsonContent.schema;
            const properties = schema && schema.properties;
            let exampleBody = '{}';
            if (properties) {
              const example = {};
              Object.entries(properties).forEach(([k, v]) => {
                if (v.type === 'string') example[k] = '';
                else if (v.type === 'integer') example[k] = 0;
                else if (v.type === 'boolean') example[k] = false;
                else example[k] = null;
              });
              exampleBody = JSON.stringify(example, null, 2);
            }
            html += '<div class="section-label">Request Body (JSON)</div>';
            html += '<textarea class="body-editor" id="' + endpointId + '-body">' + escapeHtml(exampleBody) + '</textarea>';
          }

          const responses = info.responses || {};
          html += '<div style="margin-top:10px"><strong style="color:#8892b0;font-size:0.8rem">Respostas:</strong>';
          Object.entries(responses).forEach(([code, r]) => {
            html += '<span style="display:inline-block;margin:4px 8px 0 0;padding:2px 8px;border-radius:4px;font-size:0.75rem;background:#0f3460;color:#a8d0e6">' + escapeHtml(code) + ' — ' + escapeHtml(r.description || '') + '</span>';
          });
          html += '</div>';

          if (requiresAuth && !getToken()) {
            html += '<div class="try-it"><button class="try-it-btn" disabled style="opacity:0.4;cursor:not-allowed">Token necessario</button></div>';
          } else {
            html += '<div class="try-it"><button class="try-it-btn" onclick="tryRequest(\\'' + escapeHtml(method) + '\\', \\'' + escapeHtml(path) + '\\', \\'' + endpointId + '\\', this)">Try it out</button></div>';
          }
          html += '<div class="response-box" id="resp-' + endpointId + '" style="display:none"></div>';

          html += '</div></div>';
          count++;
        });
      });

      if (count === 0) html = '<div class="loading">Nenhum endpoint encontrado para esta tag.</div>';
      container.innerHTML = html;
    }

    async function tryRequest(method, path, endpointId, btn) {
      const respBox = document.getElementById('resp-' + endpointId);
      respBox.style.display = 'block';
      respBox.textContent = 'Carregando...';

      const headers = { 'Content-Type': 'application/json' };
      const token = getToken();
      if (token) headers['Authorization'] = 'Bearer ' + token;

      const paramInputs = document.querySelectorAll('[id^="' + endpointId + '-param-"]');
      const queryParams = [];
      paramInputs.forEach(input => {
        const val = input.value.trim();
        if (val) queryParams.push(encodeURIComponent(input.dataset.paramName) + '=' + encodeURIComponent(val));
      });

      let url = path;
      if (queryParams.length > 0) url += '?' + queryParams.join('&');

      const bodyEditor = document.getElementById(endpointId + '-body');
      const options = { method: method.toUpperCase(), headers };
      if (bodyEditor && (method === 'post' || method === 'put' || method === 'patch')) {
        options.body = bodyEditor.value;
      }

      try {
        const res = await fetch(url, options);
        const text = await res.text();
        let formatted = text;
        try { formatted = JSON.stringify(JSON.parse(text), null, 2); } catch {}
        const statusColor = res.ok ? '#2ecc71' : (res.status === 401 ? '#f39c12' : '#e74c3c');
        respBox.innerHTML = '<span style="color:' + statusColor + ';font-weight:bold">Status: ' + res.status + ' ' + escapeHtml(res.statusText) + '</span>\\n\\n' + escapeHtml(formatted);

        if (res.status === 401 && !getToken()) {
          respBox.innerHTML += '\\n\\n<span style="color:#f39c12">💡 Dica: Faça login em POST /api/v1/auth/login e cole o access_token na barra de token acima.</span>';
        }

        if (path.includes('/auth/login') && res.ok) {
          try {
            const json = JSON.parse(text);
            if (json.access_token) {
              document.getElementById('jwt-token').value = json.access_token;
              document.getElementById('logout-btn').style.display = 'block';
              if (spec) renderEndpoints();
              respBox.innerHTML += '\\n\\n<span style="color:#2ecc71">Token preenchido automaticamente na barra acima!</span>';
            }
          } catch {}
        }
      } catch (err) {
        respBox.textContent = 'Erro: ' + err.message;
      }
    }

    loadSpec();
  </script>
</body>
</html>`);
});
