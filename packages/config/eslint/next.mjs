// Shared ESLint flat config for Next.js apps: Next's core-web-vitals + TypeScript rules.
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "**/*.cjs", "storybook-static/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];
