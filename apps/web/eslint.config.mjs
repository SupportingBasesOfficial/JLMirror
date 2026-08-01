import nextConfig from "@repo/eslint-config/next";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";

/**
 * ESLint config para apps/web.
 * 
 * Herda configuração do @repo/eslint-config/next.
 * 
 * DELETÁVEL: Se você não usar ESLint, pode deletar este arquivo.
 */
export default [
  ...nextConfig,
  {
    ignores: ["next-env.d.ts", ".next/**"],
  },
  {
    plugins: {
      "react-hooks": reactHooks,
      "@next/next": nextPlugin,
    },
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "security/detect-object-injection": "off",
      "security/detect-non-literal-regexp": "off",
      "jsx-a11y/label-has-associated-control": "off",
      "jsx-a11y/click-events-have-key-events": "off",
      "jsx-a11y/no-static-element-interactions": "off",
      "react/no-unescaped-entities": "off",
      "@next/next/no-html-link-for-pages": "off",
      "@next/next/no-img-element": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
