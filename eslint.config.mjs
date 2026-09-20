import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: [
      "src/features/**/*.{ts,tsx}",
      "src/components/**/*.{ts,tsx}",
      "src/client/**/*.{ts,tsx}",
      "src/fixtures/**/*.{ts,tsx}",
      "src/app/**/*.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/server", "@/server/*"],
              message: "UI must not import server modules",
            },
            {
              group: ["@/worker", "@/worker/*"],
              message: "UI must not import the worker",
            },
            {
              group: ["@/domain", "@/domain/*"],
              message: "UI must use @/contracts, not domain/store types",
            },
            {
              group: ["@/config/env", "@/config/settings"],
              message: "UI may import @/config/public only",
            },
            {
              group: ["firebase-admin"],
              message: "Admin SDK is server-only",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
