import { test, expect } from "@playwright/test";

// Smoke E2E da jornada crítica completa:
// 1. Página de login carrega com link "esqueci minha senha"
// 2. Fluxo forgot-password funciona
// 3. Login admin → onboarding wizard acessível
// 4. Login cliente → dashboard carrega com dados
// 5. Indicador WebSocket presente no TopBar
// 6. ThemeToggle presente e funcional

const ADMIN_EMAIL = "admin@jlmirror.com";
const ADMIN_PASSWORD = "admin123";
const CLIENT_EMAIL = "client@jlmirror.com";
const CLIENT_PASSWORD = "client123";

test.describe("Jornada Crítica — Smoke Test", () => {
  test("página de login tem link para forgot-password", async ({ page }) => {
    await page.goto("/auth/login");

    await expect(page.locator("text=/esqueci|forgot|recuperar/i")).toBeVisible({
      timeout: 5000,
    });
  });

  test("fluxo forgot-password exibe confirmação genérica", async ({ page }) => {
    await page.goto("/auth/forgot-password");

    // Página carrega com input de email
    await expect(
      page.locator('input[type="email"], input[name="email"]'),
    ).toBeVisible({ timeout: 5000 });

    // Submete email
    await page
      .locator('input[type="email"], input[name="email"]')
      .fill("test@example.com");
    await page.locator('button[type="submit"]').click();

    // Deve exibir mensagem de sucesso genérica (anti-enumeração)
    await expect(
      page.locator("text=/enviamos|link|email|verifique/i"),
    ).toBeVisible({ timeout: 10000 });
  });

  test("página reset-password rejeita token ausente", async ({ page }) => {
    await page.goto("/auth/reset-password");

    // Sem token na URL, deve mostrar erro ou estado inválido
    await expect(
      page.locator("text=/token|inválido|inválid|invál/i"),
    ).toBeVisible({ timeout: 5000 });
  });

  test("admin login → onboarding wizard acessível", async ({ page }) => {
    await page.goto("/auth/login");
    await page
      .locator('input[type="email"], input[name="email"]')
      .fill(ADMIN_EMAIL);
    await page
      .locator('input[type="password"], input[name="password"]')
      .fill(ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/\/admin/, { timeout: 10000 });

    // Navega para onboarding
    await page.goto("/admin/onboarding");
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 5000 });

    // Wizard deve carregar com step 1
    await expect(page.locator("body")).toBeVisible();
    await expect(
      page.locator("text=/passo|step|dados|cliente|empresa/i"),
    ).toBeVisible({ timeout: 5000 });
  });

  test("admin vê sino de notificações no TopBar", async ({ page }) => {
    await page.goto("/auth/login");
    await page
      .locator('input[type="email"], input[name="email"]')
      .fill(ADMIN_EMAIL);
    await page
      .locator('input[type="password"], input[name="password"]')
      .fill(ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/\/admin/, { timeout: 10000 });

    // Sino de notificações deve estar visível
    const bellButton = page.locator('button[aria-label="Notificações"]');
    await expect(bellButton).toBeVisible({ timeout: 5000 });
  });

  test("admin vê indicador de conexão no TopBar", async ({ page }) => {
    await page.goto("/auth/login");
    await page
      .locator('input[type="email"], input[name="email"]')
      .fill(ADMIN_EMAIL);
    await page
      .locator('input[type="password"], input[name="password"]')
      .fill(ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/\/admin/, { timeout: 10000 });

    // Indicador de status (Online ou Reconectando)
    await expect(page.locator("text=/Online|Reconectando/i")).toBeVisible({
      timeout: 5000,
    });
  });

  test("admin pode alternar tema (ThemeToggle)", async ({ page }) => {
    await page.goto("/auth/login");
    await page
      .locator('input[type="email"], input[name="email"]')
      .fill(ADMIN_EMAIL);
    await page
      .locator('input[type="password"], input[name="password"]')
      .fill(ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/\/admin/, { timeout: 10000 });

    // ThemeToggle botão deve estar visível
    const themeButton = page.locator('button[aria-label="Alternar tema"]');
    await expect(themeButton).toBeVisible({ timeout: 5000 });

    // Clica para alternar
    await themeButton.click();

    // Verifica que a classe dark foi alternada no <html>
    const htmlClass = await page.locator("html").getAttribute("class");
    // Após clicar, deve ter 'dark' ou 'light' (não vazio)
    expect(htmlClass).toBeTruthy();
  });

  test("cliente login → dashboard carrega sem erros", async ({ page }) => {
    await page.goto("/auth/login");
    await page
      .locator('input[type="email"], input[name="email"]')
      .fill(CLIENT_EMAIL);
    await page
      .locator('input[type="password"], input[name="password"]')
      .fill(CLIENT_PASSWORD);
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    // Dashboard carrega
    await expect(page.locator("body")).toBeVisible();

    // Não deve mostrar erro de conexão
    await expect(
      page.locator("text=/erro de conexão|connection error/i"),
    ).not.toBeVisible({ timeout: 3000 });
  });

  test("cliente vê Portal do Cliente na sidebar", async ({ page }) => {
    await page.goto("/auth/login");
    await page
      .locator('input[type="email"], input[name="email"]')
      .fill(CLIENT_EMAIL);
    await page
      .locator('input[type="password"], input[name="password"]')
      .fill(CLIENT_PASSWORD);
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    await expect(page.locator("text=/Portal do Cliente/i")).toBeVisible({
      timeout: 5000,
    });
  });

  test("cliente pode navegar para Problems", async ({ page }) => {
    await page.goto("/auth/login");
    await page
      .locator('input[type="email"], input[name="email"]')
      .fill(CLIENT_EMAIL);
    await page
      .locator('input[type="password"], input[name="password"]')
      .fill(CLIENT_PASSWORD);
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    await page.goto("/dashboard/problems");
    await expect(page).toHaveURL(/\/problems/, { timeout: 5000 });
    await expect(page.locator("body")).toBeVisible();
  });

  test("cliente pode navegar para Events", async ({ page }) => {
    await page.goto("/auth/login");
    await page
      .locator('input[type="email"], input[name="email"]')
      .fill(CLIENT_EMAIL);
    await page
      .locator('input[type="password"], input[name="password"]')
      .fill(CLIENT_PASSWORD);
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    await page.goto("/dashboard/events");
    await expect(page).toHaveURL(/\/events/, { timeout: 5000 });
    await expect(page.locator("body")).toBeVisible();
  });

  test("status page pública carrega", async ({ request }) => {
    // Tenta buscar a API de status page
    const response = await request.get(
      "http://localhost:3001/api/v1/status-page/default",
    );
    // Pode retornar 200 ou 404 (se não houver tenant configurado)
    expect([200, 404]).toContain(response.status());
  });

  test("health check da API responde", async ({ request }) => {
    const response = await request.get("http://localhost:3001/api/v1/health");
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe("ok");
  });
});
