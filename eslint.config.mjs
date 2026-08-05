import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // CLAUDE.md §6 bans console.* in committed code in favour of a logger module.
  // Enforced rather than trusted: the rule is why src/lib/logger.ts exists.
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: ["src/lib/logger.ts", "src/**/*.test.ts", "src/**/*.test.tsx"],
    rules: { "no-console": "error" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
