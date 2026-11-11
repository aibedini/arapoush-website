import type { FastifyRequest } from "fastify";
import { createLocalJWKSet, jwtVerify } from "jose";
import type { Deps } from "../app.ts";
import { auditNow } from "../audit/audit.ts";
import { ipAllowed } from "../auth/cidr.ts";
import { forbidden, unauthorized } from "../http/problem.ts";
import { signingKeys } from "./keys.ts";
import { verifyDpop } from "./proofs.ts";
import { clientCertFingerprint } from "./routes.ts";

/**
 * Partner API guard (plan §3.3 steps 1–3): DPoP-bound access token, revocation, client network
 * (CIDR + mTLS fingerprint) and scope. Grants and locks are checked per resource afterwards.
 */
export function requirePartner(deps: Deps, scope: string) {
  const { db, config } = deps;
  return async (req: FastifyRequest) => {
    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("DPoP ")) throw unauthorized("DPoP-bound access token required");
    const at = auth.slice(5).trim();
    const keys = await signingKeys(config, { memory: config.NODE_ENV === "test" });
    let claims: Record<string, unknown>;
    try {
      ({ payload: claims } = await jwtVerify(at, createLocalJWKSet(keys.publicJwks as never), { issuer: config.PUBLIC_URL, audience: "opex-partner", algorithms: ["ES256"], typ: "at+jwt" }));
    } catch {
      throw unauthorized("Access token invalid or expired");
    }
    const url = `${config.PUBLIC_URL}${req.url.split("?")[0]}`;
    const jkt = await db.tx((q) => verifyDpop(q, req.headers.dpop as string | undefined, { method: req.method, url, accessToken: at }));
    if ((claims.cnf as { jkt?: string } | undefined)?.jkt !== jkt) throw unauthorized("Token is bound to another key");

    const [row] = await db.q<{ revoked_at: Date | null; status: string; kind: string; display_name: string; role: string | null; partner_client_id: string | null; cstatus: string; allowed_cidrs: string[]; mtls_fingerprint: string | null; pcid: string }>(
      `SELECT s.revoked_at, p.status, p.kind, p.display_name, p.role, p.partner_client_id, c.status AS cstatus, c.allowed_cidrs, c.mtls_fingerprint, c.id AS pcid
         FROM sessions s JOIN principals p ON p.id = s.principal_id JOIN partner_clients c ON c.client_id = s.client_id
        WHERE s.id = $1 AND s.principal_id = $2`,
      [claims.sid, claims.sub],
    );
    if (!row || row.revoked_at || row.status !== "active" || row.cstatus !== "active") throw unauthorized("Session revoked");
    const scopes = String(claims.scope ?? "").split(" ");
    req.principal = {
      id: String(claims.sub),
      kind: row.kind as "partner_user" | "service",
      display: row.display_name,
      role: row.role,
      sessionId: String(claims.sid),
      mfa: row.kind === "partner_user",
      stepUpAt: null,
      clientId: String(claims.azp),
      partnerClientId: row.pcid,
      scopes,
      authMethod: row.kind === "partner_user" ? "oauth:authorization_code+totp" : "oauth:client_credentials",
    };
    const networkOk = ipAllowed(req.info.ip, row.allowed_cidrs) && (!row.mtls_fingerprint || clientCertFingerprint(req, config.trustedProxies) === row.mtls_fingerprint.toLowerCase());
    const actor = { kind: req.principal.kind, id: req.principal.id, via_client: req.principal.clientId, session_id: req.principal.sessionId };
    if (!networkOk) {
      await auditNow(db, config.TENANT, { action: "authz.denied", result: "denied", actor, request: req.info, resource: { rule: "partner.network" } });
      throw forbidden("NETWORK_DENIED", "Request not allowed from this network or certificate");
    }
    if (!scopes.includes(scope)) {
      await auditNow(db, config.TENANT, { action: "authz.denied", result: "denied", actor, request: req.info, resource: { rule: "scope", needed: scope } });
      throw forbidden("SCOPE_DENIED", `Token lacks scope ${scope}`);
    }
  };
}
