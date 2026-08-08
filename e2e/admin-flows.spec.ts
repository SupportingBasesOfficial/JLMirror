import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jlmirror.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "admin123";

// Helper local — login via API direta, bypassa form para evitar race conditions
async function adminLogin(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.context().clearCookies();
  const response = await page.request.post("/api/auth/login", {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (!response.ok()) throw new Error(`Login falhou: ${response.status()}`);
  await page.goto("/admin");
  await page.waitForFunction(
    (pat) => new RegExp(pat).test(window.location.pathname),
    "\/admin",
    { timeout: 15000 },
  );
}

test("dashboard carrega KPIs após login admin", async ({ page }) => {
  await adminLogin(page);

  // Navega para dashboard e verifica que carregou sem erros
  await page.goto("/dashboard");
  await expect(page.locator("body")).toBeVisible();
  await expect(
    page.locator("text=/Erro de conexao|connection error/i"),
  ).not.toBeVisible({
    timeout: 3000,
  });
});

test("navegação para tickets funciona", async ({ page }) => {
  await adminLogin(page);

  await page.goto("/tickets");
  await expect(
    page.locator("h1").filter({ hasText: /ticket|chamado/i }),
  ).toBeVisible({
    timeout: 10000,
  });
});

test("navegação para SSL funciona", async ({ page }) => {
  await adminLogin(page);

  await page.goto("/ssl");
  await expect(
    page.locator("h1").filter({ hasText: /certificado|ssl/i }),
  ).toBeVisible({
    timeout: 10000,
  });
});

test("navegação para firewall funciona", async ({ page }) => {
  await adminLogin(page);

  await page.goto("/firewall");
  await expect(
    page.locator("h1").filter({ hasText: /firewall|regra/i }),
  ).toBeVisible({
    timeout: 10000,
  });
});

test("logout redireciona para login", async ({ page }) => {
  await adminLogin(page);

  const logoutBtn = page.locator('[data-testid="logout"]');
  await expect(logoutBtn).toBeVisible({ timeout: 5000 });
  await logoutBtn.click();
  await page.waitForFunction(
    (pat) => new RegExp(pat).test(window.location.pathname),
    "\\/auth\\/login",
    { timeout: 5000 },
  );
});
