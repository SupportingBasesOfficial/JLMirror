import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jlmirror.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "admin123";

test("dashboard carrega KPIs após login admin", async ({ page }) => {
  await page.goto("/auth/login");
  await page
    .locator('input[type="email"], input[name="email"]')
    .fill(ADMIN_EMAIL);
  await page
    .locator('input[type="password"], input[name="password"]')
    .fill(ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/\/admin/, { timeout: 10000 });

  // Navega para dashboard e verifica KPIs
  await page.goto("/dashboard");
  const kpiLabels = [
    "Devices",
    "Tickets",
    "Compliance",
    "SSL",
    "Backups",
    "Firewall",
  ];
  for (const label of kpiLabels) {
    await expect(page.locator(`text=/${label}/i`)).toBeVisible({
      timeout: 10000,
    });
  }
});

test("navegação para tickets funciona", async ({ page }) => {
  await page.goto("/auth/login");
  await page
    .locator('input[type="email"], input[name="email"]')
    .fill(ADMIN_EMAIL);
  await page
    .locator('input[type="password"], input[name="password"]')
    .fill(ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/\/admin/, { timeout: 10000 });

  await page.goto("/tickets");
  await expect(page).toHaveURL(/\/tickets/, { timeout: 5000 });
  await expect(page.locator("text=/ticket|categoria|chamado/i")).toBeVisible({
    timeout: 10000,
  });
});

test("navegação para SSL funciona", async ({ page }) => {
  await page.goto("/auth/login");
  await page
    .locator('input[type="email"], input[name="email"]')
    .fill(ADMIN_EMAIL);
  await page
    .locator('input[type="password"], input[name="password"]')
    .fill(ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/\/admin/, { timeout: 10000 });

  await page.goto("/ssl");
  await expect(page).toHaveURL(/\/ssl/, { timeout: 5000 });
  await expect(page.locator("text=/certificado|ssl|expir/i")).toBeVisible({
    timeout: 10000,
  });
});

test("navegação para firewall funciona", async ({ page }) => {
  await page.goto("/auth/login");
  await page
    .locator('input[type="email"], input[name="email"]')
    .fill(ADMIN_EMAIL);
  await page
    .locator('input[type="password"], input[name="password"]')
    .fill(ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/\/admin/, { timeout: 10000 });

  await page.goto("/firewall");
  await expect(page).toHaveURL(/\/firewall/, { timeout: 5000 });
  await expect(page.locator("text=/firewall|regra|rule/i")).toBeVisible({
    timeout: 10000,
  });
});

test("logout redireciona para login", async ({ page }) => {
  await page.goto("/auth/login");
  await page
    .locator('input[type="email"], input[name="email"]')
    .fill(ADMIN_EMAIL);
  await page
    .locator('input[type="password"], input[name="password"]')
    .fill(ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/\/admin/, { timeout: 10000 });

  const logoutBtn = page.locator('[data-testid="logout"]');
  await expect(logoutBtn).toBeVisible({ timeout: 5000 });
  await logoutBtn.click();
  await expect(page).toHaveURL(/\/auth\/login/, { timeout: 5000 });
});
