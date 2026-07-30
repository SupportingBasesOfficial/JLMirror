import { test, expect } from "@playwright/test";

test("página de login carrega e exibe formulário", async ({ page }) => {
  await page.goto("/login");

  await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"], input[name="password"]')).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toBeVisible();
});

test("página de login mostra erro com credenciais inválidas", async ({ page }) => {
  await page.goto("/login");

  await page.locator('input[type="email"], input[name="email"]').fill("invalid@example.com");
  await page.locator('input[type="password"], input[name="password"]').fill("wrongpassword");
  await page.locator('button[type="submit"]').click();

  await expect(page.locator("text=/inválid|incorret|erro/i")).toBeVisible({ timeout: 5000 });
});

test("redireciona para login quando não autenticado", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
});

test("página de dashboard carrega após login dev", async ({ page }) => {
  await page.goto("/login");

  await page.locator('input[type="email"], input[name="email"]').fill("dev@jlmirror.com");
  await page.locator('input[type="password"], input[name="password"]').fill("dev-password");
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
  await expect(page.locator("text=/dashboard|resumo|visão/i")).toBeVisible({ timeout: 5000 });
});
