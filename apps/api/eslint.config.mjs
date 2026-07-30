import baseConfig from "@repo/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: ["**/node_modules/**", "**/dist/**"],
  },
  ...baseConfig,
  {
    rules: {
      "security/detect-object-injection": "off",
    },
  },
];
