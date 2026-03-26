import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "docs-site/**",
      "apps/**",
      "scripts/**",
      "**/*.js",
      "**/*.mjs",
      "**/*.cjs",
    ],
  },
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "@typescript-eslint/consistent-type-imports": ["warn", { "prefer": "type-imports", "disallowTypeAnnotations": false }],
    },
  },
);
