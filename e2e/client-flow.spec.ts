import { test, expect } from "@playwright/test";

// Testes E2E do fluxo de cliente (tenant user — scope: tenant)
// Requer: API em localhost:3001, Web em localhost:3000, banco com seed de cliente

// Credenciais de cliente — ajustar conforme seed do banco
const CLIENT_EMAIL = process.env.E2E_CLIENT_EMAIL ?? "client@jlmirror.com";
const CLIENT_PASSWORD = process.env.E2E_CLIENT_PASSWORD ?? "client123";

test.describe("Fluxo Cliente (Tenant User)", () => {
  test("cliente é redirecionado para /dashboard após login", async ({
    page,
  }) => {
    await page.goto("/auth/login");
    await page
      .locator('input[type="email"], input[name="email"]')
      .fill(CLIENT_EMAIL);
    await page
      .locator('input[type="password"], input[name="password"]')
      .fill(CLIENT_PASSWORD);
    await page.locator('button[type="submit"]').click();

    // Cliente deve ir para /dashboard, não /admin
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
  });

  test("cliente não acessa rotas admin (middleware bloqueia)", async ({
    page,
  }) => {
    // Login como cliente
    await page.goto("/auth/login");
    await page
      .locator('input[type="email"], input[name="email"]')
      .fill(CLIENT_EMAIL);
    await page
      .locator('input[type="password"], input[name="password"]')
      .fill(CLIENT_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    // Tenta acessar /admin — middleware redireciona para /dashboard
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 });

    // Tenta acessar /settings/modules — middleware redireciona
    await page.goto("/settings/modules");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 });

    // Tenta acessar /white-label — middleware redireciona
    await page.goto("/white-label");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 });
  });

  test("cliente vê ClientSidebar (Portal do Cliente)", async ({ page }) => {
    await page.goto("/auth/login");
    await page
      .locator('input[type="email"], input[name="email"]')
      .fill(CLIENT_EMAIL);
    await page
      .locator('input[type="password"], input[name="password"]')
      .fill(CLIENT_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    // ClientSidebar mostra "Portal do Cliente" no header
    await expect(page.locator("text=/Portal do Cliente/i")).toBeVisible({
      timeout: 5000,
    });
  });

  test("cliente não vê itens admin na sidebar", async ({ page }) => {
    await page.goto("/auth/login");
    await page
      .locator('input[type="email"], input[name="email"]')
      .fill(CLIENT_EMAIL);
    await page
      .locator('input[type="password"], input[name="password"]')
      .fill(CLIENT_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    // Itens admin não devem aparecer na sidebar do cliente
    await expect(page.locator("aside >> text=/Admin Global/i")).not.toBeVisible(
      { timeout: 3000 },
    );
    await expect(
      page.locator("aside >> text=/Gestão de Usuários/i"),
    ).not.toBeVisible({ timeout: 3000 });
    await expect(page.locator("aside >> text=/Onboarding/i")).not.toBeVisible({
      timeout: 3000,
    });
    await expect(page.locator("aside >> text=/White-label/i")).not.toBeVisible({
      timeout: 3000,
    });
  });

  test("cliente pode acessar dashboard e páginas compartilhadas", async ({
    page,
  }) => {
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

    // Página de profile (compartilhada)
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/profile/, { timeout: 5000 });

    // Página de sessions (compartilhada)
    await page.goto("/sessions");
    await expect(page).toHaveURL(/\/sessions/, { timeout: 5000 });
  });

  test("logout funciona para cliente", async ({ page }) => {
    await page.goto("/auth/login");
    await page
      .locator('input[type="email"], input[name="email"]')
      .fill(CLIENT_EMAIL);
    await page
      .locator('input[type="password"], input[name="password"]')
      .fill(CLIENT_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

    const logoutBtn = page.locator('[data-testid="logout"]');
    await expect(logoutBtn).toBeVisible({ timeout: 5000 });
    await logoutBtn.click();
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 5000 });
  });
});
