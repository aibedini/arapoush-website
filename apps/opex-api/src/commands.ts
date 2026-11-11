import type { Deps } from "./app.ts";
import { createOperator } from "./auth/routes.ts";

/** CLI commands (see cli.ts). */
export const COMMANDS: Record<string, (deps: Deps, args: string[]) => Promise<void>> = {
  /** create-operator <email> <display name> <role> — the password is read from OPEX_NEW_PASSWORD. */
  "create-operator": async (deps, [email, name, role = "super_admin"]) => {
    const pw = process.env.OPEX_NEW_PASSWORD;
    if (!email || !name || !pw) throw new Error("Usage: OPEX_NEW_PASSWORD=… cli create-operator <email> <display name> [role]");
    const id = await createOperator(deps, email, name, role, pw);
    console.log(`operator ${id} created; sign in to the console to set up the authenticator`);
  },
};
