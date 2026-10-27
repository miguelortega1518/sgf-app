import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Los scripts son utilidades de una sola vez (aceptación, importación), no código de producto.
    files: ["scripts/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    // Pedir datos al montar un componente es el patrón actual de la app. La regla marca todos esos casos;
    // arreglarlos bien exige adoptar una librería de datos (SWR o React Query) y se hará como tarea propia.
    // Se deja como aviso visible para que no pase desapercibido.
    rules: { "react-hooks/set-state-in-effect": "warn" },
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
