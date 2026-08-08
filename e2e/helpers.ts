import { Page, expect } from "@playwright/test";

// Helper de login para testes E2E — usa waitForURL em vez de toHaveURL
// pois toHaveURL faz polling que pode bloquear a navegação client-side do Next.js

export async function loginAsAdmin(
  page: Page,
  email = "admin@jlmirror.com",
  password = "admin123",
): Promise<void> {
  await page.goto("/auth/login");
  await page.locator('input[type="email"], input[name="email"]').fill(email);
  await page
    .locator('input[type="password"], input[name="password"]')
    .fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin/, { timeout: 10000 });
}

export async function loginAsClient(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/auth/login");
  await page.locator('input[type="email"], input[name="email"]').fill(email);
  await page
    .locator('input[type="password"], input[name="password"]')
    .fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 10000 });
}

export async function logout(page: Page): Promise<void> {
  const logoutBtn = page.locator('[data-testid="logout"]');
  await expect(logoutBtn).toBeVisible({ timeout: 5000 });
  await logoutBtn.click();
  await page.waitForURL(/\/auth\/login/, { timeout: 5000 });
}
