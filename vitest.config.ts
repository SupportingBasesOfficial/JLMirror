import { defineConfig } from "vitest/config";

/**
 * Configuração global do Vitest para o monorepo.
 *
 * Suporta dois ambientes:
 * - node (default): para testes de API, utils, lógica pura
 * - jsdom: para testes de componentes React (use // @vitest-environment jsdom)
 *
 * Cada package pode ter seu próprio vitest.config.ts que herda este,
 * ou rodar testes diretamente com `pnpm test` na raiz.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/playwright/**",
      "**/*.e2e.ts",
      "**/e2e/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      exclude: ["node_modules/", "**/*.config.*", "**/.next/", "**/dist/"],
    },
  },
});
