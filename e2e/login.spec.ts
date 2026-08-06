import { test, expect } from "@playwright/test";

// Credenciais unificadas para todos os testes E2E
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jlmirror.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "admin123";

test("página de login carrega e exibe formulário", async ({ page }) => {
  await page.goto("/auth/login");

  await expect(
    page.locator('input[type="email"], input[name="email"]'),
  ).toBeVisible();
  await expect(
    page.locator('input[type="password"], input[name="password"]'),
  ).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toBeVisible();
});

test("página de login mostra erro com credenciais inválidas", async ({
  page,
}) => {
  await page.goto("/auth/login");

  await page
    .locator('input[type="email"], input[name="email"]')
    .fill("invalid@example.com");
  await page
    .locator('input[type="password"], input[name="password"]')
    .fill("wrongpassword");
  await page.locator('button[type="submit"]').click();

  await expect(page.locator("text=/inválid|incorret|erro/i")).toBeVisible({
    timeout: 5000,
  });
});

test("redireciona para login quando não autenticado", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/login/, { timeout: 5000 });
});

test("admin global é redirecionado para /admin após login", async ({
  page,
}) => {
  await page.goto("/auth/login");

  await page
    .locator('input[type="email"], input[name="email"]')
    .fill(ADMIN_EMAIL);
  await page
    .locator('input[type="password"], input[name="password"]')
    .fill(ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();

  // Admin global deve ir para /admin, não /dashboard
  await expect(page).toHaveURL(/\/admin/, { timeout: 10000 });
});

test("rota admin bloqueia acesso sem token (middleware)", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/auth\/login/, { timeout: 5000 });
});
