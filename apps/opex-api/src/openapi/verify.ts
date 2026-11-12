import type { FastifyRequest } from "fastify";
import type { RouteContract } from "./contract.ts";
import { genericErrors } from "./generate.ts";
import { CONTRACTS } from "./registry.ts";

/**
 * Contract tests (D2): every response the API tests receive is checked against the route's contract.
 * - A status the contract does not document is a violation.
 * - A JSON body must match the documented schema for that status.
 * - A problem+json error must carry a code the contract documents (route errors + generic ones).
 * Violations are collected and fail the test when the test app closes.
 */
export type Violation = { route: string; status: number; problem: string };
const byRoute = new Map(CONTRACTS.map((c) => [`${c.method} ${c.path}`, c]));
const codesOf = (c: RouteContract) => new Set([...genericErrors(c), ...(c.errors ?? [])].map((e) => `${e.status} ${e.code}`));

export function contractChecker() {
  const violations: Violation[] = [];
  const seen = new Set<string>();
  const onPayload = (req: FastifyRequest, status: number, contentType: string, payload: unknown) => {
    const url = req.routeOptions?.url;
    if (!url) return; // no route matched (404 handler)
    const c = byRoute.get(`${req.method} ${url}`);
    const route = `${req.method} ${url}`;
    if (!c) return void violations.push({ route, status, problem: "route has no contract" });
    seen.add(`${c.id} ${status}`);
    const text = typeof payload === "string" ? payload : Buffer.isBuffer(payload) ? null : null;
    if (contentType.startsWith("application/problem+json")) {
      let code = "";
      try {
        code = String((JSON.parse(text ?? "{}") as { code?: string }).code ?? "");
      } catch {}
      // Body parse errors from Fastify itself are generic (BAD_REQUEST); everything else must be documented.
      if (code === "BAD_REQUEST" && c.body) return;
      if (!codesOf(c).has(`${status} ${code}`) && !c.responses[status]) violations.push({ route, status, problem: `undocumented error code ${code}` });
      return;
    }
    const spec = c.responses[status];
    if (!spec) return void violations.push({ route, status, problem: "undocumented status" });
    if (!spec.schema || !contentType.startsWith("application/json") || text === null) return;
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return void violations.push({ route, status, problem: "body is not JSON" });
    }
    const r = spec.schema.safeParse(body);
    if (!r.success) violations.push({ route, status, problem: r.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ") });
  };
  return { onPayload, violations, seen };
}
