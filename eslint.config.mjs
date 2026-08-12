import nextJsConfig from "@repo/eslint-config/next";
import baseConfig from "@repo/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    // Ignores globais sempre no topo
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/out/**",
      "**/*.d.ts",
      // Blueprint de referencia — documento de design, nao codigo de producao
      "refactor-blueprint/**",
    ],
  },
  ...baseConfig,
  ...nextJsConfig,
];