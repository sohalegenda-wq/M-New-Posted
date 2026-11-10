import js from "@eslint/js";
import ts from "typescript-eslint";
export default ts.config(
  {
    ignores: [
      "dist/**",
      ".wrangler/**",
      "work/**",
      "node_modules/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        URL: "readonly",
        self: "readonly",
        caches: "readonly",
        fetch: "readonly",
        Response: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
);
