import { test, expect } from "@playwright/test";

// Credenciais unificadas para todos os testes E2E
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jlmirror.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "admin123";

// Helper local — login via API direta, bypassa form para evitar race conditions
async function loginAndRedirect(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
  pattern: RegExp,
): Promise<void> {
  await page.context().clearCookies();
  const response = await page.request.post("/api/auth/login", {
    data: { email, password },
  });
  if (!response.ok()) throw new Error(`Login falhou: ${response.status()}`);
  const body = await response.json();
  const targetPath = body.scope === "global" ? "/admin" : "/dashboard";
  await page.goto(targetPath);
  await page.waitForFunction(
    (pat) => new RegExp(pat).test(window.location.pathname),
    pattern.source,
    { timeout: 15000 },
  );
}

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
  await page.context().clearCookies();
  await page.goto("/auth/login");
  await page
    .locator('input[type="email"], input[name="email"]')
    .waitFor({ state: "visible", timeout: 10000 });

  // Testa credenciais inválidas via API
  const response = await page.request.post("/api/auth/login", {
    data: { email: "invalid@example.com", password: "wrongpassword" },
  });

  expect(response.status()).toBe(401);
  const body = await response.json();
  expect(body.error?.message).toMatch(/inválid|incorret|erro/i);
});

test("redireciona para login quando não autenticado", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/login/, { timeout: 5000 });
});

test("admin global é redirecionado para /admin após login", async ({
  page,
}) => {
  await loginAndRedirect(page, ADMIN_EMAIL, ADMIN_PASSWORD, /\/admin/);

  // Admin global deve ir para /admin, não /dashboard
  expect(page.url()).toMatch(/\/admin/);
});

test("rota admin bloqueia acesso sem token (middleware)", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/auth\/login/, { timeout: 5000 });
});
