import { z } from "zod";
import { route } from "../openapi/contract.ts";

export const PARTNER_SCOPES = ["content:read", "content:propose", "media:upload", "cr:read", "cr:withdraw"] as const;

/** OAuth 2.1 for AraCMS (authorization code + PKCE, refresh rotation, client credentials; private_key_jwt; DPoP). */
export const AuthorizeQuery = z.object({
  response_type: z.literal("code"),
  client_id: z.string().max(100),
  redirect_uri: z.string().url().max(500).describe("Must exactly match a registered redirect URI."),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/).describe("PKCE: BASE64URL(SHA256(code_verifier))."),
  code_challenge_method: z.literal("S256"),
  state: z.string().max(500).optional().describe("Returned unchanged on the redirect; use it against CSRF."),
  scope: z.string().max(300).default("content:read").describe("Space-separated: content:read content:propose media:upload cr:read cr:withdraw"),
});

const OAuthError = z.object({ error: z.string().describe("invalid_client | invalid_grant | invalid_dpop_proof | unauthorized_client | unsupported_grant_type | access_denied"), error_description: z.string() }).meta({ id: "OAuthError" });
const Token = z.object({
  access_token: z.string().describe("JWT (ES256), bound to the DPoP key (cnf.jkt)."),
  token_type: z.literal("DPoP"),
  expires_in: z.number().describe("Seconds (300)."),
  scope: z.string(),
  refresh_token: z.string().optional().describe("Single use; rotated on every refresh. Presenting a used one revokes the whole session."),
});

const S = "oauth/routes.ts";
const tags = ["OAuth"];
export const OAUTH = {
  jwks: route({
    id: "oauthJwks",
    method: "GET",
    path: "/.well-known/jwks.json",
    audience: "oauth",
    tags,
    summary: "Public keys that sign OPEX tokens and audit archives",
    auth: "none",
    source: S,
    responses: { 200: { description: "JWK Set (current and previous keys during a rotation). Cached 5 minutes.", schema: z.object({ keys: z.array(z.record(z.string(), z.unknown())) }) } },
  }),
  metadata: route({
    id: "oauthMetadata",
    method: "GET",
    path: "/.well-known/oauth-authorization-server",
    audience: "oauth",
    tags,
    summary: "Authorization server metadata (RFC 8414)",
    auth: "none",
    source: S,
    responses: {
      200: {
        description: "Endpoints and supported features.",
        schema: z.object({
          issuer: z.string(),
          authorization_endpoint: z.string(),
          token_endpoint: z.string(),
          revocation_endpoint: z.string(),
          jwks_uri: z.string(),
          grant_types_supported: z.array(z.string()),
          response_types_supported: z.array(z.string()),
          code_challenge_methods_supported: z.array(z.string()),
          token_endpoint_auth_methods_supported: z.array(z.string()),
          dpop_signing_alg_values_supported: z.array(z.string()),
          scopes_supported: z.array(z.string()),
        }),
      },
    },
  }),
  authorizePage: route({
    id: "oauthAuthorize",
    method: "GET",
    path: "/oauth/authorize",
    audience: "oauth",
    tags,
    summary: "Sign-in page for AraCMS staff (start of the authorization code flow)",
    description: "AraCMS redirects the user here; the user signs in with their OPEX partner account (password, then authenticator code) and is sent back to `redirect_uri` with `code` and `state`.",
    auth: "none",
    source: S,
    query: AuthorizeQuery,
    rateLimit: "30 per minute per IP",
    responses: { 200: { description: "HTML sign-in page (CSP-locked).", contentType: "text/html" } },
    errors: [
      { status: 400, code: "INVALID_REQUEST", when: "Missing or malformed parameters." },
      { status: 400, code: "INVALID_CLIENT", when: "Unknown client, or redirect_uri not registered." },
    ],
  }),
  authorizeSubmit: route({
    id: "oauthAuthorizeSubmit",
    method: "POST",
    path: "/oauth/authorize",
    audience: "oauth",
    tags,
    summary: "Sign-in form steps (password, then authenticator code)",
    description: "Posted by the sign-in page itself (`stage` = password | code). On success: 303 to `redirect_uri?code=…&state=…`.",
    auth: "none",
    source: S,
    body: AuthorizeQuery.extend({ stage: z.enum(["password", "code"]), email: z.string().optional(), password: z.string().optional(), challenge: z.string().optional(), code: z.string().optional() }),
    bodyType: "application/x-www-form-urlencoded",
    rateLimit: "10 per minute per IP",
    responses: {
      200: { description: "Next step of the form (HTML).", contentType: "text/html" },
      303: { description: "Signed in: redirect to the client with `code` (single use, 60 s) and `state`.", headers: { Location: "redirect_uri?code=…&state=…" } },
      401: { description: "Wrong password or code (the HTML form again, with an error); or the sign-in step expired.", contentType: "text/html" },
    },
    errors: [
      { status: 400, code: "INVALID_REQUEST", when: "Bad parameters or unknown stage." },
      { status: 400, code: "INVALID_CLIENT", when: "Unknown client, or redirect_uri not registered." },
    ],
    audit: ["oauth.login.success", "oauth.login.failure", "oauth.mfa.failure"],
  }),
  token: route({
    id: "oauthToken",
    method: "POST",
    path: "/oauth/token",
    audience: "oauth",
    tags,
    summary: "Get tokens (authorization_code, refresh_token, client_credentials)",
    description:
      "Client authentication is private_key_jwt only (`client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`, ES256, aud = this URL, single-use jti). Every request needs a `DPoP` proof header; tokens are bound to that key. Errors follow RFC 6749 (`error`, `error_description`), not problem+json.",
    auth: "client",
    source: S,
    body: z.object({
      grant_type: z.enum(["authorization_code", "refresh_token", "client_credentials"]),
      client_id: z.string(),
      client_assertion_type: z.literal("urn:ietf:params:oauth:client-assertion-type:jwt-bearer"),
      client_assertion: z.string(),
      code: z.string().optional().describe("authorization_code"),
      redirect_uri: z.string().optional().describe("authorization_code: the same URI as in /oauth/authorize"),
      code_verifier: z.string().optional().describe("authorization_code: the PKCE verifier"),
      refresh_token: z.string().optional().describe("refresh_token"),
      scope: z.string().optional().describe("client_credentials: space-separated; limited to the client's scopes"),
    }),
    bodyType: "application/x-www-form-urlencoded",
    headers: [{ name: "DPoP", required: true, description: "DPoP proof for POST to this URL." }],
    rateLimit: "60 per minute per IP",
    responses: {
      200: { description: "Tokens.", schema: Token, example: { access_token: "eyJhbGciOiJFUzI1NiIs…", token_type: "DPoP", expires_in: 300, scope: "content:read content:propose", refresh_token: "rt_…" } },
      400: { description: "invalid_client, invalid_grant (bad/expired/reused code, PKCE mismatch, refresh reuse — which revokes the session), invalid_dpop_proof, unauthorized_client, unsupported_grant_type.", schema: OAuthError },
      403: { description: "access_denied: the call is not from the client's allowed network.", schema: OAuthError },
    },
    audit: ["oauth.token.issued", "oauth.token.refreshed", "oauth.token.failure", "oauth.refresh.reuse_detected"],
  }),
  revoke: route({
    id: "oauthRevoke",
    method: "POST",
    path: "/oauth/revoke",
    audience: "oauth",
    tags,
    summary: "Revoke a refresh token (RFC 7009)",
    description: "Answers 200 with `{}` for unknown clients and unknown tokens (no token probing). A known client must authenticate (private_key_jwt).",
    auth: "client",
    source: S,
    body: z.object({ token: z.string(), client_id: z.string(), client_assertion_type: z.string(), client_assertion: z.string() }),
    bodyType: "application/x-www-form-urlencoded",
    responses: { 200: { description: "Done (or nothing to do).", schema: z.object({}) } },
    errors: [{ status: 401, code: "UNAUTHENTICATED", when: "The client assertion is missing, expired, replayed or does not verify." }],
    audit: ["oauth.token.revoked"],
  }),
};
