import { test, expect } from "@playwright/test";

// Testes E2E do fluxo de cliente (tenant user — scope: tenant)
// Requer: API em localhost:3001, Web em localhost:3000, banco com seed de cliente

// Credenciais de cliente — ajustar conforme seed do banco
const CLIENT_EMAIL = process.env.E2E_CLIENT_EMAIL ?? "client@jlmirror.com";
const CLIENT_PASSWORD = process.env.E2E_CLIENT_PASSWORD ?? "admin123";

// Helper local — login via API direta, bypassa form para evitar race conditions
async function clientLogin(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.context().clearCookies();
  const response = await page.request.post("/api/auth/login", {
    data: { email: CLIENT_EMAIL, password: CLIENT_PASSWORD },
  });
  if (!response.ok()) throw new Error(`Login falhou: ${response.status()}`);
  await page.goto("/dashboard");
  await page.waitForFunction(
    (pat) => new RegExp(pat).test(window.location.pathname),
    "\/dashboard",
    { timeout: 15000 },
  );
}

test.describe("Fluxo Cliente (Tenant User)", () => {
  test("cliente é redirecionado para /dashboard após login", async ({
    page,
  }) => {
    await clientLogin(page);
    expect(page.url()).toMatch(/\/dashboard/);
  });

  test("cliente não acessa rotas admin (middleware bloqueia)", async ({
    page,
  }) => {
    await clientLogin(page);

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
    await clientLogin(page);

    // ClientSidebar mostra "Portal do Cliente" no header
    await expect(page.locator("text=/Portal do Cliente/i")).toBeVisible({
      timeout: 5000,
    });
  });

  test("cliente não vê itens admin na sidebar", async ({ page }) => {
    await clientLogin(page);

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
    await clientLogin(page);

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
    await clientLogin(page);

    const logoutBtn = page.locator('[data-testid="logout"]');
    await expect(logoutBtn).toBeVisible({ timeout: 5000 });
    await logoutBtn.click();
    await page.waitForFunction(
      (pat) => new RegExp(pat).test(window.location.pathname),
      "\\/auth\\/login",
      { timeout: 5000 },
    );
  });
});
