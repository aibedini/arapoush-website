import type { FastifyReply, FastifyRequest } from "fastify";
import type { Deps } from "../app.ts";
import { auditNow } from "../audit/audit.ts";
import { forbidden, unauthorized } from "../http/problem.ts";
import { ipAllowed } from "./cidr.ts";
import { actorOf, type OperatorRole } from "./principal.ts";
import { csrfMatches, loadConsoleSession } from "./sessions.ts";
import { SELF, permissionFor } from "../authz/permissions.ts";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Operator guard for the console API: network allowlist → session → CSRF on writes → permission.
 * The permission comes from the route (`ROUTE_PERMISSIONS`, authz/permissions.ts), not from the
 * caller: a route missing from that map is denied to everybody. `_min` documents the built-in role
 * that had access before permissions existed; it is not used for the decision.
 */
export function requireOperator(deps: Deps, _min: OperatorRole = "viewer") {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    if (!ipAllowed(req.info.ip, deps.config.consoleCidrs)) {
      await deny(deps, req, "console.network", "IP not in the console allowlist");
      throw forbidden("NETWORK_DENIED", "Console access is not allowed from this network");
    }
    const s = await loadConsoleSession(deps.db, deps.config.TENANT, req);
    if (!s) throw unauthorized();
    if (MUTATING.has(req.method) && !csrfMatches(s.csrfHash, req.headers["x-csrf-token"] as string | undefined)) throw forbidden("CSRF", "Missing or invalid CSRF token");
    req.principal = s;
    const need = permissionFor(req.method, req.routeOptions.url ?? "");
    if (need === SELF) return;
    // A temporary password (new account or admin reset) only opens self-service until it is changed.
    if (s.mustChangePassword) throw forbidden("PASSWORD_CHANGE_REQUIRED", "Change your temporary password first");
    if (!need || !s.permissions.has(need)) {
      await deny(deps, req, "console.permission", `Missing permission ${need ?? "(route not mapped)"}`);
      throw forbidden("ROLE_DENIED", "Your role does not allow this", { permission: need ?? null });
    }
  };
}

/** Sensitive actions need a fresh second factor (within 5 minutes). */
export function requireStepUp(deps: Deps) {
  return async (req: FastifyRequest) => {
    const at = req.principal?.stepUpAt;
    if (!at || Date.now() - at.getTime() > 5 * 60_000) {
      await deny(deps, req, "console.step_up", "Step-up required");
      throw forbidden("STEP_UP_REQUIRED", "Confirm with your authenticator code first");
    }
  };
}

export async function deny(deps: Deps, req: FastifyRequest, rule: string, reason: string) {
  await auditNow(deps.db, deps.config.TENANT, { action: "authz.denied", result: "denied", actor: actorOf(req), request: req.info, resource: { rule }, reason });
}
