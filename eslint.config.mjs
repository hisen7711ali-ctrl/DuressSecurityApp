import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Flat ESLint config for the TanStack Start app-builder template. */
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      ".output/**",
      ".vercel/**",
      ".nitro/**",
      "node_modules/**",
      "src/routeTree.gen.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // These modules intentionally expose small non-component helpers alongside
    // React components. Keep Fast Refresh strict everywhere else.
    files: [
      "src/components/pins-panel.tsx",
      "src/components/permissions-onboarding-screen.tsx",
    ],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    // The effects below deliberately rebind to current UI state while using
    // local functions/refs; exhaustive-deps would flag the intentional pattern.
    files: [
      "src/components/lock-gate.tsx",
      "src/components/permissions-onboarding-screen.tsx",
    ],
    rules: {
      "react-hooks/exhaustive-deps": "off",
    },
  },
  {
    // wipeAppData is retained as the browser/local emergency-reset primitive;
    // native Android reset is deliberately routed through DevicePolicyManager.
    files: ["src/lib/store.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^(wipeAppData|_)" },
      ],
    },
  },
  // Disable rules that conflict with Prettier formatting.
  prettier,
);
