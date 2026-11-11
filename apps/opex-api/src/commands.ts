import type { Deps } from "./app.ts";

/** CLI commands contributed by later phases (create-operator, seed, …). */
export const COMMANDS: Record<string, (deps: Deps, args: string[]) => Promise<void>> = {};
