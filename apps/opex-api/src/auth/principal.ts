import type { FastifyRequest } from "fastify";
import type { Actor } from "../audit/audit.ts";

export type OperatorRole = "super_admin" | "operator" | "auditor" | "viewer";

/** The authenticated caller of a request. */
export type Principal = {
  id: string;
  kind: "operator" | "partner_user" | "service";
  display: string;
  role: string | null;
  sessionId: string;
  mfa: boolean;
  stepUpAt: Date | null;
  /** Partner calls: the OAuth client (AraCMS) the token was issued to. */
  clientId: string | null;
  partnerClientId: string | null;
  scopes: string[];
  authMethod: string;
  /** Console operators: effective permissions (authz/permissions.ts). */
  permissions?: Set<string>;
  /** Signed in with a temporary password: only self-service routes until it is changed. */
  mustChangePassword?: boolean;
};

declare module "fastify" {
  interface FastifyRequest {
    principal: Principal | null;
  }
}

export function actorOf(req: FastifyRequest): Actor {
  const p = req.principal;
  if (!p) return { kind: "anonymous", id: null };
  return {
    kind: p.kind,
    id: p.id,
    display: p.display,
    roles: p.role ? [p.role] : [],
    via_client: p.clientId,
    session_id: p.sessionId,
    auth: { method: p.authMethod, mfa: p.mfa, step_up: !!p.stepUpAt && Date.now() - p.stepUpAt.getTime() < 5 * 60_000 },
  };
}
