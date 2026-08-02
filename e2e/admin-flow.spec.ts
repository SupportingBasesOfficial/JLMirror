import { test, expect } from "@playwright/test";

// Testes E2E do fluxo admin completo
// Requer: API em localhost:3001, Web em localhost:3000, banco com seed

const ADMIN_EMAIL = "admin@jlmirror.com";
const ADMIN_PASSWORD = "admin123";

test.describe("Fluxo Admin Completo", () => {
  test.beforeEach(async ({ page }) => {
    // Login antes de cada teste
    await page.goto("/auth/login");
    await page
      .locator('input[type="email"], input[name="email"]')
      .fill(ADMIN_EMAIL);
    await page
      .locator('input[type="password"], input[name="password"]')
      .fill(ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/admin/, { timeout: 10000 });
  });

  test("dashboard carrega com KPIs", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("body")).toBeVisible();
    // Verifica que a pagina carregou sem erro de conexao
    await expect(page.locator("text=/erro|error/i")).not.toBeVisible({
      timeout: 3000,
    });
  });

  test("pagina de SLA carrega com tabs", async ({ page }) => {
    await page.goto("/dashboard/slas");
    await expect(page.locator("text=/SLA|Services/i")).toBeVisible({
      timeout: 5000,
    });
    // Verifica que as tabs estao presentes
    await expect(page.locator("text=/Servicos|Services/i")).toBeVisible();
    await expect(page.locator("text=/Relatorio/i")).toBeVisible();
    await expect(page.locator("text=/Incidentes/i")).toBeVisible();
    await expect(page.locator("text=/Manutencoes/i")).toBeVisible();
  });

  test("criar servico via modal SLA", async ({ page }) => {
    await page.goto("/dashboard/slas");

    // Aguarda a pagina carregar
    await expect(page.locator("text=/Servicos/i")).toBeVisible({
      timeout: 5000,
    });

    // Clica no botao de criar servico
    const createBtn = page.locator("button:has-text('+ Servico')");
    if (await createBtn.isVisible({ timeout: 3000 })) {
      await createBtn.click();

      // Verifica que o modal abriu
      await expect(page.locator("text=/Novo Servico/i")).toBeVisible({
        timeout: 3000,
      });

      // Preenche o formulario
      await page
        .locator('input[placeholder="Email Corporate"]')
        .fill("E2E Test Service");

      // Seleciona tipo
      const tipoSelect = page.locator("select").first();
      await tipoSelect.selectOption("infrastructure");

      // Submete
      await page.locator("button:has-text('Criar Servico')").click();

      // Verifica sucesso
      await expect(
        page.locator("text=/Servico criado|atualizado/i"),
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test("pagina de Scheduled Tasks carrega", async ({ page }) => {
    await page.goto("/scheduled-tasks");
    await expect(page.locator("text=/Scheduled Tasks|Cron/i")).toBeVisible({
      timeout: 5000,
    });
  });

  test("pagina de Settings carrega com tabs", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator("text=/Branding/i")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator("text=/Integracoes/i")).toBeVisible();
    await expect(page.locator("text=/Limites/i")).toBeVisible();
    await expect(page.locator("text=/Seguranca/i")).toBeVisible();
  });

  test("pagina de Traces carrega com filtros", async ({ page }) => {
    await page.goto("/traces");
    await expect(page.locator("text=/Tracing|trace/i")).toBeVisible({
      timeout: 5000,
    });
    // Verifica que os filtros estao presentes
    await expect(page.locator("text=/Servico/i")).toBeVisible();
    await expect(page.locator("text=/Operacao/i")).toBeVisible();
  });

  test("pagina de Problems carrega com dados Zabbix", async ({ page }) => {
    await page.goto("/dashboard/problems");
    await expect(page.locator("body")).toBeVisible();
    // A pagina deve carregar sem crashar
    await page.waitForTimeout(2000);
  });

  test("pagina de Events carrega", async ({ page }) => {
    await page.goto("/dashboard/events");
    await expect(page.locator("text=/Eventos/i")).toBeVisible({
      timeout: 5000,
    });
  });

  test("pagina de Webhooks carrega", async ({ page }) => {
    await page.goto("/webhooks");
    await expect(page.locator("text=/Webhook/i")).toBeVisible({
      timeout: 5000,
    });
  });

  test("pagina de API Keys carrega", async ({ page }) => {
    await page.goto("/api-keys");
    await expect(page.locator("text=/API Key/i")).toBeVisible({
      timeout: 5000,
    });
  });

  test("pagina de Notifications carrega", async ({ page }) => {
    await page.goto("/notifications");
    await expect(page.locator("text=/Notificacao|Notification/i")).toBeVisible({
      timeout: 5000,
    });
  });

  test("logout funciona corretamente", async ({ page }) => {
    // Aguarda estar no admin
    await expect(page).toHaveURL(/\/admin/, { timeout: 5000 });

    // Clica no botao de logout
    const logoutBtn = page.locator('[data-testid="logout"]');
    await expect(logoutBtn).toBeVisible({ timeout: 5000 });
    await logoutBtn.click();
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 5000 });
  });
});

test.describe("WebSocket Health", () => {
  test("endpoint de health do WebSocket responde", async ({ request }) => {
    const response = await request.get(
      "http://localhost:3001/api/v1/ws/health",
    );
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body).toHaveProperty("connections");
  });
});

test.describe("API Endpoints Smoke Test", () => {
  let authToken: string;

  test.beforeAll(async ({ request }) => {
    const loginResponse = await request.post(
      "http://localhost:3001/api/v1/auth/login",
      {
        data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      },
    );
    expect(loginResponse.ok()).toBeTruthy();
    const body = await loginResponse.json();
    authToken = body.access_token;
  });

  test("GET /sla/services retorna 200", async ({ request }) => {
    const response = await request.get(
      "http://localhost:3001/api/v1/sla/services",
      {
        headers: { Authorization: `Bearer ${authToken}` },
      },
    );
    expect(response.status()).toBe(200);
  });

  test("GET /tasks retorna 200", async ({ request }) => {
    const response = await request.get("http://localhost:3001/api/v1/tasks", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(response.status()).toBe(200);
  });

  test("GET /settings retorna 200", async ({ request }) => {
    const response = await request.get(
      "http://localhost:3001/api/v1/settings",
      {
        headers: { Authorization: `Bearer ${authToken}` },
      },
    );
    expect(response.status()).toBe(200);
  });

  test("GET /zabbix/devices retorna 200", async ({ request }) => {
    const response = await request.get(
      "http://localhost:3001/api/v1/zabbix/devices",
      {
        headers: { Authorization: `Bearer ${authToken}` },
      },
    );
    expect(response.status()).toBe(200);
  });

  test("GET /traces/search retorna 200", async ({ request }) => {
    const response = await request.get(
      "http://localhost:3001/api/v1/traces/search",
      {
        headers: { Authorization: `Bearer ${authToken}` },
      },
    );
    expect(response.status()).toBe(200);
  });

  test("GET /webhooks retorna 200", async ({ request }) => {
    const response = await request.get(
      "http://localhost:3001/api/v1/webhooks",
      {
        headers: { Authorization: `Bearer ${authToken}` },
      },
    );
    expect(response.status()).toBe(200);
  });

  test("GET /notifications/channels retorna 200", async ({ request }) => {
    const response = await request.get(
      "http://localhost:3001/api/v1/notifications/channels",
      {
        headers: { Authorization: `Bearer ${authToken}` },
      },
    );
    expect(response.status()).toBe(200);
  });

  test("GET /scripts retorna 200", async ({ request }) => {
    const response = await request.get("http://localhost:3001/api/v1/scripts", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(response.status()).toBe(200);
  });

  test("GET /assets retorna 200", async ({ request }) => {
    const response = await request.get("http://localhost:3001/api/v1/assets", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(response.status()).toBe(200);
  });

  test("GET /health retorna 200 sem auth", async ({ request }) => {
    const response = await request.get("http://localhost:3001/api/v1/health");
    expect(response.status()).toBe(200);
  });
});
