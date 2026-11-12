import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import helmet from "@fastify/helmet";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import formbody from "@fastify/formbody";
import multipart from "@fastify/multipart";
import { ZodError } from "zod";
import type { Config } from "./config.ts";
import type { Db } from "./db/index.ts";
import { ulid } from "./ids.ts";
import { Problem } from "./http/problem.ts";
import type { RequestInfo } from "./audit/audit.ts";

export type Deps = { config: Config; db: Db };
export type Module = (app: FastifyInstance, deps: Deps) => Promise<void> | void;

declare module "fastify" {
  interface FastifyRequest {
    info: RequestInfo;
  }
  interface FastifyInstance {
    routeList: { method: string; url: string }[];
  }
}

/** What OPEX records about where a request came from (after trusted-proxy parsing). */
function requestInfo(req: FastifyRequest): RequestInfo {
  const asserted = req.headers["x-end-user-ip"];
  return {
    id: String(req.id),
    ip: req.ip ?? null,
    ip_chain: req.ips && req.ips.length > 1 ? req.ips : undefined,
    asserted_end_user_ip: typeof asserted === "string" ? asserted.slice(0, 64) : null,
    user_agent: (req.headers["user-agent"] ?? "").slice(0, 400) || null,
    method: req.method,
    path: req.url.split("?")[0],
  };
}

/** `onPayload` (tests): sees every response body before it is sent (contract checks). */
export type BuildOptions = { onPayload?: (req: FastifyRequest, status: number, contentType: string, payload: unknown) => void };

export async function buildApp(deps: Deps, modules: Module[] = [], opts: BuildOptions = {}): Promise<FastifyInstance> {
  const { config } = deps;
  const app = Fastify({
    trustProxy: config.trustedProxies,
    bodyLimit: 1024 * 1024,
    genReqId: () => ulid("req_"),
    requestIdHeader: false,
    logger: {
      level: config.NODE_ENV === "test" ? "warn" : config.LOG_LEVEL,
      // Never log credentials, tokens, cookies or bodies.
      redact: ["req.headers.authorization", "req.headers.cookie", "req.headers.dpop", "req.headers.signature", "res.headers['set-cookie']"],
    },
  });
  // Every registered route, so the API contracts can be checked against reality (openapi.test.ts).
  const routes: { method: string; url: string }[] = [];
  app.addHook("onRoute", (r) => {
    for (const m of [r.method].flat()) if (m !== "HEAD" && m !== "OPTIONS") routes.push({ method: m, url: r.url });
  });
  app.decorate("routeList", routes);
  if (opts.onPayload) {
    const check = opts.onPayload;
    app.addHook("onSend", async (req, reply, payload) => {
      check(req, reply.statusCode, String(reply.getHeader("content-type") ?? ""), payload);
      return payload;
    });
  }

  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], formAction: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"] } },
    crossOriginResourcePolicy: { policy: "same-site" },
    hsts: config.isProd ? { maxAge: 63072000, includeSubDomains: true, preload: true } : false,
  });
  await app.register(cookie, { secret: config.SESSION_SECRET });
  // JSON and binary bodies keep their exact bytes (request signatures cover a digest of them).
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
    const buf = body as Buffer;
    req.rawBody = buf;
    if (!buf.length) return done(null, undefined);
    try {
      done(null, JSON.parse(buf.toString("utf8")));
    } catch {
      done(Object.assign(new Error("Body is not valid JSON"), { statusCode: 400 }), undefined);
    }
  });
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: 25 * 1024 * 1024 }, (req, body, done) => {
    req.rawBody = body as Buffer;
    done(null, body);
  });
  await app.register(formbody);
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 10 } });
  await app.register(rateLimit, { global: true, max: 600, timeWindow: "1 minute", keyGenerator: (r) => r.ip });

  app.decorateRequest("info", null as unknown as RequestInfo);
  app.addHook("onRequest", async (req, reply) => {
    req.info = requestInfo(req);
    reply.header("X-Request-Id", req.id);
    reply.header("Cache-Control", "no-store");
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof Problem) {
      return reply
        .status(err.status)
        .type("application/problem+json")
        .send({ type: `https://opex.arapoush/problems/${err.code.toLowerCase()}`, title: err.code, status: err.status, detail: err.detail, instance: req.id, code: err.code, ...err.extra });
    }
    if (err instanceof ZodError) {
      return reply
        .status(400)
        .type("application/problem+json")
        .send({ title: "VALIDATION_FAILED", status: 400, code: "VALIDATION_FAILED", instance: req.id, issues: err.issues.map((i) => ({ path: "/" + i.path.join("/"), message: i.message })) });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) req.log.error({ err }, "unhandled");
    return reply
      .status(status)
      .type("application/problem+json")
      .send({ title: status === 429 ? "RATE_LIMITED" : status >= 500 ? "INTERNAL" : "BAD_REQUEST", status, code: status === 429 ? "RATE_LIMITED" : status >= 500 ? "INTERNAL" : "BAD_REQUEST", instance: req.id, detail: status >= 500 ? "Internal error" : (err as Error).message });
  });
  app.setNotFoundHandler((req, reply) => reply.status(404).type("application/problem+json").send({ title: "NOT_FOUND", status: 404, code: "NOT_FOUND", instance: req.id }));

  app.get("/healthz", { config: { rateLimit: false } }, async () => ({ ok: true }));
  app.get("/readyz", { config: { rateLimit: false } }, async (_req, reply) => {
    try {
      await deps.db.q("SELECT 1");
      return { ok: true, db: deps.db.kind };
    } catch {
      return reply.status(503).send({ ok: false });
    }
  });

  for (const m of modules) await m(app, deps);
  return app;
}
