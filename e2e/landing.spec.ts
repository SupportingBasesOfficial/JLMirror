import { expect, test } from "@playwright/test";

/**
 * E2E test — Landing page.
 *
 * Verifica que a página carrega, mostra o título,
 * e o botão de toggle de tema está presente.
 */
test("landing page carrega com título e theme toggle", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "JLMIRROR" }),
  ).toBeVisible();

  await expect(
    page.getByText("Portal de Monitoramento Multi-tenant"),
  ).toBeVisible();

  await expect(page.getByLabel("Alternar tema")).toBeVisible();
});

test("landing page navega para 404 em rota inexistente", async ({ page }) => {
  await page.goto("/rota-que-nao-existe");

  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
});
