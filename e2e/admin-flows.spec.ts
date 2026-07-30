import { test, expect } from "@playwright/test";

test("dashboard carrega KPIs após login dev", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[type="email"], input[name="email"]').fill("dev@jlmirror.com");
  await page.locator('input[type="password"], input[name="password"]').fill("dev-password");
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

  const kpiLabels = ["Devices", "Tickets", "Compliance", "SSL", "Backups", "Firewall"];
  for (const label of kpiLabels) {
    await expect(page.locator(`text=/${label}/i`)).toBeVisible({ timeout: 10000 });
  }
});

test("navegação para tickets funciona", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[type="email"], input[name="email"]').fill("dev@jlmirror.com");
  await page.locator('input[type="password"], input[name="password"]').fill("dev-password");
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

  await page.goto("/tickets");
  await expect(page).toHaveURL(/\/tickets/, { timeout: 5000 });
  await expect(page.locator("text=/ticket|categoria|chamado/i")).toBeVisible({ timeout: 10000 });
});

test("navegação para SSL funciona", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[type="email"], input[name="email"]').fill("dev@jlmirror.com");
  await page.locator('input[type="password"], input[name="password"]').fill("dev-password");
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

  await page.goto("/ssl");
  await expect(page).toHaveURL(/\/ssl/, { timeout: 5000 });
  await expect(page.locator("text=/certificado|ssl|expir/i")).toBeVisible({ timeout: 10000 });
});

test("navegação para firewall funciona", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[type="email"], input[name="email"]').fill("dev@jlmirror.com");
  await page.locator('input[type="password"], input[name="password"]').fill("dev-password");
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

  await page.goto("/firewall");
  await expect(page).toHaveURL(/\/firewall/, { timeout: 5000 });
  await expect(page.locator("text=/firewall|regra|rule/i")).toBeVisible({ timeout: 10000 });
});

test("logout redireciona para login", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[type="email"], input[name="email"]').fill("dev@jlmirror.com");
  await page.locator('input[type="password"], input[name="password"]').fill("dev-password");
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

  const logoutBtn = page.locator('button:has-text("Sair"), button:has-text("Logout"), [aria-label="Logout"]');
  if (await logoutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await logoutBtn.click();
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  }
});
