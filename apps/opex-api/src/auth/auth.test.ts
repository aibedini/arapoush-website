import { test } from "node:test";
import assert from "node:assert/strict";
import { testApp, signIn, stepUp, as, totpAt, partnerKeys, clientAssertion, dpopProof, pkce } from "../testing.ts";
import { createOperator } from "./routes.ts";

const actions = async (db: { q: (s: string) => Promise<{ action: string }[]> }) => (await db.q(`SELECT action FROM audit_events ORDER BY seq`)).map((r) => r.action);

test("operator sign-in: password, TOTP enrolment, session, CSRF, logout — all audited", async () => {
  const t = await testApp();
  try {
    const op = await signIn(t.app, t);
    const me = await t.app.inject({ method: "GET", url: "/v1/manage/auth/me", headers: { cookie: op.cookie } });
    assert.equal(me.statusCode, 200);
    assert.equal(me.json().role, "super_admin");
    // Writes without the CSRF header are refused.
    const noCsrf = await t.app.inject({ method: "POST", url: "/v1/manage/auth/logout", headers: { cookie: op.cookie } });
    assert.equal(noCsrf.statusCode, 403);
    const out = await t.app.inject({ method: "POST", url: "/v1/manage/auth/logout", headers: as(op) });
    assert.equal(out.statusCode, 200);
    assert.equal((await t.app.inject({ method: "GET", url: "/v1/manage/auth/me", headers: { cookie: op.cookie } })).statusCode, 401);
    const a = await actions(t.db);
    for (const x of ["operator.create", "auth.password.ok", "auth.mfa.enroll_started", "auth.mfa.enrolled", "auth.logout"]) assert.ok(a.includes(x), x);
  } finally {
    await t.close();
  }
});

test("a TOTP code works once; wrong passwords lock the account", async () => {
  const t = await testApp();
  try {
    const op = await signIn(t.app, t);
    const reuse = await t.app.inject({ method: "POST", url: "/v1/manage/auth/step-up", headers: as(op), payload: { code: totpAt(op.secret, 0) } });
    assert.equal(reuse.statusCode, 401, "same step replayed");

    await createOperator(t, "victim@opex.test", "Victim", "operator", "another long password 77");
    for (let i = 0; i < 5; i++) await t.app.inject({ method: "POST", url: "/v1/manage/auth/login", payload: { email: "victim@opex.test", password: "wrong password!!" } });
    const locked = await t.app.inject({ method: "POST", url: "/v1/manage/auth/login", payload: { email: "victim@opex.test", password: "another long password 77" } });
    assert.equal(locked.statusCode, 401, "locked even with the right password");
    assert.ok((await actions(t.db)).includes("auth.lockout"));
    // Unknown email and wrong password look identical.
    const unknown = await t.app.inject({ method: "POST", url: "/v1/manage/auth/login", payload: { email: "nobody@opex.test", password: "x" } });
    assert.equal(unknown.json().detail, "Email or password is incorrect");
  } finally {
    await t.close();
  }
});

test("roles: auditors cannot write; admin actions need a fresh step-up", async () => {
  const t = await testApp();
  try {
    const admin = await signIn(t.app, t);
    const auditor = await signIn(t.app, t, "auditor");
    const body = { email: "new@opex.test", display_name: "New Operator", role: "operator", password: "a strong passphrase 2026" };
    const byAuditor = await t.app.inject({ method: "POST", url: "/v1/manage/operators", headers: as(auditor), payload: body });
    assert.equal(byAuditor.statusCode, 403);
    // The sign-in itself counts as a step-up for 5 minutes; simulate an old session.
    await t.db.q(`UPDATE sessions SET step_up_at = clock_timestamp() - interval '10 minutes'`);
    const stale = await t.app.inject({ method: "POST", url: "/v1/manage/operators", headers: as(admin), payload: body });
    assert.equal(stale.json().code, "STEP_UP_REQUIRED");
    await stepUp(t.app, admin);
    const ok = await t.app.inject({ method: "POST", url: "/v1/manage/operators", headers: as(admin), payload: body });
    assert.equal(ok.statusCode, 200, ok.body);
    const weak = await t.app.inject({ method: "POST", url: "/v1/manage/operators", headers: as(admin), payload: { ...body, email: "w@opex.test", password: "short" } });
    assert.equal(weak.json().code, "WEAK_PASSWORD");
    assert.ok((await actions(t.db)).filter((a) => a === "authz.denied").length >= 2);
  } finally {
    await t.close();
  }
});

test("AraCMS: authorization code + PKCE + TOTP, DPoP-bound token, refresh rotation and reuse detection", async () => {
  const t = await testApp();
  try {
    const admin = await signIn(t.app, t);
    const k = await partnerKeys();
    const created = await t.app.inject({
      method: "POST",
      url: "/v1/manage/partners",
      headers: as(admin),
      payload: { name: "AraCMS", allowed_cidrs: ["127.0.0.1/32"], jwks: { keys: [k.clientJwk] }, redirect_uris: ["https://aracms.test/callback"], scopes: ["content:read", "content:propose", "media:upload", "cr:read"] },
    });
    assert.equal(created.statusCode, 200, created.body);
    const { id: partnerId, client_id } = created.json();
    const user = await t.app.inject({ method: "POST", url: `/v1/manage/partners/${partnerId}/users`, headers: as(admin), payload: { email: "editor@arapoush.test", display_name: "Sara (Arapoush)", role: "aracms_editor", password: "blue tubes print daily 2026" } });
    assert.equal(user.statusCode, 200, user.body);

    const { verifier, challenge } = pkce();
    const params = { response_type: "code", client_id, redirect_uri: "https://aracms.test/callback", code_challenge: challenge, code_challenge_method: "S256", state: "s1", scope: "content:read content:propose" };
    const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
    const page = await t.app.inject({ method: "GET", url: `/oauth/authorize?${form(params)}` });
    assert.equal(page.statusCode, 200);
    // A redirect URI that is not registered exactly is refused.
    assert.equal((await t.app.inject({ method: "GET", url: `/oauth/authorize?${form({ ...params, redirect_uri: "https://aracms.test/callback/evil" })}` })).statusCode, 400);

    const pw = await t.app.inject({ method: "POST", url: "/oauth/authorize", headers: { "content-type": "application/x-www-form-urlencoded" }, payload: form({ ...params, stage: "password", email: "editor@arapoush.test", password: "blue tubes print daily 2026" }) });
    assert.equal(pw.statusCode, 200);
    const ch = /name="challenge" value="([^"]+)"/.exec(pw.body)![1]!;
    const secret = /<code>([A-Z2-7]+)<\/code>/.exec(pw.body)![1]!;
    const done = await t.app.inject({ method: "POST", url: "/oauth/authorize", headers: { "content-type": "application/x-www-form-urlencoded" }, payload: form({ ...params, stage: "code", challenge: ch, code: totpAt(secret) }) });
    assert.equal(done.statusCode, 303);
    const code = new URL(String(done.headers.location)).searchParams.get("code")!;

    const tokenUrl = "http://opex.test/oauth/token";
    const tokenReq = async (body: Record<string, string>) =>
      t.app.inject({
        method: "POST",
        url: "/oauth/token",
        headers: { "content-type": "application/x-www-form-urlencoded", dpop: await dpopProof(k.dpop.privateKey, k.dpopJwk, "POST", tokenUrl) },
        payload: form({ client_id, client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer", client_assertion: await clientAssertion(client_id, k.client.privateKey, tokenUrl), ...body }),
      });
    const tok = await tokenReq({ grant_type: "authorization_code", code, redirect_uri: "https://aracms.test/callback", code_verifier: verifier });
    assert.equal(tok.statusCode, 200, tok.body);
    const { access_token, refresh_token, token_type } = tok.json();
    assert.equal(token_type, "DPoP");
    // The code is single-use.
    assert.equal((await tokenReq({ grant_type: "authorization_code", code, redirect_uri: "https://aracms.test/callback", code_verifier: verifier })).statusCode, 400);

    const call = async (at: string, dpopKey = k.dpop) => t.app.inject({ method: "GET", url: "/v1/partner/me", headers: { authorization: `DPoP ${at}`, dpop: await dpopProof(dpopKey.privateKey, dpopKey === k.dpop ? k.dpopJwk : (await partnerKeys()).dpopJwk, "GET", "http://opex.test/v1/partner/me", at) } });
    const me = await call(access_token);
    assert.equal(me.statusCode, 200, me.body);
    assert.equal(me.json().display, "Sara (Arapoush)");
    // A stolen token is useless without the DPoP private key.
    const thief = await partnerKeys();
    assert.equal((await call(access_token, thief.dpop)).statusCode, 401);

    const r1 = await tokenReq({ grant_type: "refresh_token", refresh_token });
    assert.equal(r1.statusCode, 200, r1.body);
    // Presenting the rotated refresh token again revokes the whole session.
    const reuse = await tokenReq({ grant_type: "refresh_token", refresh_token });
    assert.equal(reuse.statusCode, 400);
    assert.equal((await call(r1.json().access_token)).statusCode, 401, "session revoked after reuse");
    assert.ok((await actions(t.db)).includes("oauth.refresh.reuse_detected"));

    const cc = await tokenReq({ grant_type: "client_credentials", scope: "content:read" });
    assert.equal(cc.statusCode, 200, cc.body);
    assert.equal(cc.json().refresh_token, undefined);
  } finally {
    await t.close();
  }
});

test("partner network allowlist is enforced at the token endpoint", async () => {
  const t = await testApp();
  try {
    const admin = await signIn(t.app, t);
    const k = await partnerKeys();
    const { client_id } = (await t.app.inject({ method: "POST", url: "/v1/manage/partners", headers: as(admin), payload: { name: "AraCMS", allowed_cidrs: ["203.0.113.0/24"], jwks: { keys: [k.clientJwk] }, redirect_uris: [], scopes: ["content:read"] } })).json();
    const tokenUrl = "http://opex.test/oauth/token";
    const r = await t.app.inject({
      method: "POST",
      url: "/oauth/token",
      headers: { "content-type": "application/x-www-form-urlencoded", dpop: await dpopProof(k.dpop.privateKey, k.dpopJwk, "POST", tokenUrl) },
      payload: new URLSearchParams({ client_id, grant_type: "client_credentials", client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer", client_assertion: await clientAssertion(client_id, k.client.privateKey, tokenUrl) }).toString(),
    });
    assert.equal(r.statusCode, 403);
  } finally {
    await t.close();
  }
});

test("a reloaded console fetches a fresh CSRF token; the old one stops working", async () => {
  const { testApp, signIn } = await import("../testing.ts");
  const t = await testApp();
  try {
    const op = await signIn(t.app, t, "super_admin");
    const r = await t.app.inject({ method: "GET", url: "/v1/manage/auth/csrf", headers: { cookie: op.cookie } });
    assert.equal(r.statusCode, 200);
    const fresh = r.json().csrf as string;
    assert.notEqual(fresh, op.csrf);
    const post = (csrf: string) => t.app.inject({ method: "POST", url: "/v1/manage/auth/logout", headers: { cookie: op.cookie, "x-csrf-token": csrf } });
    assert.equal((await post(op.csrf)).json().code, "CSRF");
    assert.equal((await post(fresh)).statusCode, 200);
    assert.equal((await t.app.inject({ method: "GET", url: "/v1/manage/auth/csrf" })).statusCode, 401);
  } finally {
    await t.close();
  }
});
