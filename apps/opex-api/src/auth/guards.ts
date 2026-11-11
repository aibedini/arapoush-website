import type { FastifyReply, FastifyRequest } from "fastify";
import type { Deps } from "../app.ts";
import { auditNow } from "../audit/audit.ts";
import { forbidden, unauthorized } from "../http/problem.ts";
import { ipAllowed } from "./cidr.ts";
import { actorOf, type OperatorRole } from "./principal.ts";
import { csrfMatches, loadConsoleSession } from "./sessions.ts";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const RANK: Record<OperatorRole, number> = { viewer: 1, auditor: 2, operator: 3, super_admin: 4 };

/**
 * Operator guard for the console API: network allowlist → session → CSRF on writes → role.
 * `min` is the lowest role allowed; auditors are read-only (they never pass a write guard).
 */
export function requireOperator(deps: Deps, min: OperatorRole = "viewer", opts: { roles?: OperatorRole[] } = {}) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    if (!ipAllowed(req.info.ip, deps.config.consoleCidrs)) {
      await deny(deps, req, "console.network", "IP not in the console allowlist");
      throw forbidden("NETWORK_DENIED", "Console access is not allowed from this network");
    }
    const s = await loadConsoleSession(deps.db, deps.config.TENANT, req);
    if (!s) throw unauthorized();
    if (MUTATING.has(req.method) && !csrfMatches(s.csrfHash, req.headers["x-csrf-token"] as string | undefined)) throw forbidden("CSRF", "Missing or invalid CSRF token");
    req.principal = s;
    const role = (s.role ?? "viewer") as OperatorRole;
    const ok = opts.roles ? opts.roles.includes(role) : RANK[role] >= RANK[min] && !(MUTATING.has(req.method) && role === "auditor");
    if (!ok) {
      await deny(deps, req, "console.role", `Role ${role} below ${opts.roles?.join("/") ?? min}`);
      throw forbidden("ROLE_DENIED", "Your role does not allow this");
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
