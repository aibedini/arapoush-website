import { test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { testApp, signIn, as, totpAt, type Operator } from "../testing.ts";
import { BUILTIN_ROLES } from "../authz/permissions.ts";

/** Password → enrol an authenticator → code, for an account made through the API. */
async function firstSignIn(app: FastifyInstance, email: string, password: string): Promise<Operator> {
  const login = await app.inject({ method: "POST", url: "/v1/manage/auth/login", payload: { email, password } });
  assert.equal(login.statusCode, 200, login.body);
  const { challenge } = login.json();
  const { secret } = (await app.inject({ method: "POST", url: "/v1/manage/auth/mfa/enroll", payload: { challenge } })).json();
  const mfa = await app.inject({ method: "POST", url: "/v1/manage/auth/mfa", payload: { challenge, code: totpAt(secret) } });
  assert.equal(mfa.statusCode, 200, mfa.body);
  return { cookie: String(mfa.headers["set-cookie"]).split(";")[0]!, csrf: mfa.json().csrf, secret, step: 0, id: "" };
}

test("users: generated temporary password, forced change, expiry, sign out everywhere, delete", async () => {
  const t = await testApp();
  try {
    const admin = await signIn(t.app, t);
    const req = (op: Operator, method: string, url: string, payload?: unknown) => t.app.inject({ method: method as "GET", url, headers: as(op), payload: payload as object });

    // Created without a password: OPEX generates one, returns it once and never caches the answer.
    const created = await req(admin, "POST", "/v1/manage/operators", { email: "Nima@Opex.test", display_name: "Nima", role: "operator", title: "Sales" });
    assert.equal(created.statusCode, 200, created.body);
    assert.equal(created.headers["cache-control"], "no-store");
    const { id, temporaryPassword } = created.json();
    assert.match(temporaryPassword, /^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/);
    const audit = await t.db.q<{ resource: unknown }>(`SELECT resource FROM audit_events WHERE action = 'operator.create' ORDER BY seq DESC LIMIT 1`);
    assert.ok(!JSON.stringify(audit).includes(temporaryPassword), "the temporary password is never audited");

    // A temporary password opens self-service only, until it is changed.
    const nima = await firstSignIn(t.app, "nima@opex.test", temporaryPassword);
    const me = (await req(nima, "GET", "/v1/manage/auth/me")).json();
    assert.equal(me.mustChangePassword, true);
    assert.equal((await req(nima, "GET", "/v1/manage/entries")).json().code, "PASSWORD_CHANGE_REQUIRED");
    assert.equal((await req(nima, "POST", "/v1/manage/auth/password", { current: temporaryPassword, next: temporaryPassword })).json().code, "SAME_PASSWORD");
    const changed = await req(nima, "POST", "/v1/manage/auth/password", { current: temporaryPassword, next: "my own long passphrase 77" });
    assert.equal(changed.statusCode, 200, changed.body);
    assert.equal((await req(nima, "GET", "/v1/manage/entries")).statusCode, 200);

    // The detail view: profile, security state, and that the admin may manage this account.
    const detail = (await req(admin, "GET", `/v1/manage/operators/${id}`)).json();
    assert.equal(detail.title, "Sales");
    assert.equal(detail.mfa, true);
    assert.equal(detail.manageable, true);
    assert.equal(detail.must_change_password, false);
    assert.equal(detail.sessions.length, 1);

    // Sign out everywhere ends the live session.
    const out = await req(admin, "POST", `/v1/manage/operators/${id}/sessions/revoke`);
    assert.equal(out.json().revoked, 1);
    assert.equal((await req(nima, "GET", "/v1/manage/auth/me")).statusCode, 401);

    // An admin reset gives a new temporary password and asks for a change again.
    const reset = await req(admin, "POST", `/v1/manage/operators/${id}/reset-password`, {});
    assert.equal(reset.statusCode, 200, reset.body);
    const nima2 = await (async () => {
      const login = await t.app.inject({ method: "POST", url: "/v1/manage/auth/login", payload: { email: "nima@opex.test", password: reset.json().temporaryPassword } });
      const mfa = await t.app.inject({ method: "POST", url: "/v1/manage/auth/mfa", payload: { challenge: login.json().challenge, code: totpAt(nima.secret, 1) } });
      return { ...nima, cookie: String(mfa.headers["set-cookie"]).split(";")[0]!, csrf: mfa.json().csrf };
    })();
    assert.equal((await req(nima2, "GET", "/v1/manage/entries")).json().code, "PASSWORD_CHANGE_REQUIRED");

    // Own account: name and title only.
    assert.equal((await req(admin, "PATCH", `/v1/manage/operators/${admin.id}`, { email: "x@opex.test" })).json().code, "SELF_CHANGE");
    assert.equal((await req(admin, "PATCH", `/v1/manage/operators/${admin.id}`, { title: "Owner" })).statusCode, 200);
    assert.equal((await req(admin, "DELETE", `/v1/manage/operators/${admin.id}`)).json().code, "SELF_CHANGE");

    // Time-limited access: the end must lie ahead, and once passed it ends sign-in and live sessions.
    assert.equal((await req(admin, "PATCH", `/v1/manage/operators/${id}`, { access_expires_at: "2020-01-01T00:00:00Z" })).json().code, "EXPIRY_PAST");
    assert.equal((await req(admin, "PATCH", `/v1/manage/operators/${id}`, { access_expires_at: new Date(Date.now() + 86_400_000).toISOString() })).statusCode, 200);
    await t.db.q(`UPDATE principals SET access_expires_at = clock_timestamp() - interval '1 minute' WHERE id = $1`, [id]);
    assert.equal((await req(nima2, "GET", "/v1/manage/auth/me")).statusCode, 401);
    const late = await t.app.inject({ method: "POST", url: "/v1/manage/auth/login", payload: { email: "nima@opex.test", password: reset.json().temporaryPassword } });
    assert.equal(late.statusCode, 401);

    // Activity shows what happened to the account.
    const activity = (await req(admin, "GET", `/v1/manage/operators/${id}/activity`)).json() as { action: string }[];
    for (const a of ["operator.create", "operator.sessions_revoked", "operator.password_reset", "auth.password.changed"]) assert.ok(activity.some((e) => e.action === a), a);

    // Delete: sign-in is gone, the email is free again, the row is hidden from the list.
    assert.equal((await req(admin, "DELETE", `/v1/manage/operators/${id}`)).statusCode, 200);
    assert.ok(!(await req(admin, "GET", "/v1/manage/operators")).json().some((o: { id: string }) => o.id === id));
    assert.equal((await req(admin, "GET", `/v1/manage/operators/${id}`)).statusCode, 404);
    const again = await req(admin, "POST", "/v1/manage/operators", { email: "nima@opex.test", display_name: "Nima again", role: "viewer" });
    assert.equal(again.statusCode, 200, again.body);
  } finally {
    await t.close();
  }
});

test("users: target protection stops a user admin taking over a stronger account", async () => {
  const t = await testApp();
  try {
    const admin = await signIn(t.app, t);
    const req = (op: Operator, method: string, url: string, payload?: unknown) => t.app.inject({ method: method as "GET", url, headers: as(op), payload: payload as object });
    await req(admin, "POST", "/v1/manage/roles", { key: "user_admin", name: "User admin", permissions: [...BUILTIN_ROLES.viewer!.permissions, "users.read", "users.update", "users.permissions", "users.delete"] });
    const ua = await signIn(t.app, t, "user_admin");
    const op = await signIn(t.app, t, "operator");
    const viewer = await signIn(t.app, t, "viewer");

    // Not a super admin, and not anyone holding permissions the user admin lacks.
    for (const target of [admin.id, op.id]) {
      assert.equal((await req(ua, "POST", `/v1/manage/operators/${target}/reset-password`, {})).json().code, "ESCALATION");
      assert.equal((await req(ua, "PATCH", `/v1/manage/operators/${target}`, { reset_mfa: true })).json().code, "ESCALATION");
      assert.equal((await req(ua, "POST", `/v1/manage/operators/${target}/sessions/revoke`)).json().code, "ESCALATION");
      assert.equal((await req(ua, "DELETE", `/v1/manage/operators/${target}`)).json().code, "ESCALATION");
      assert.equal((await req(ua, "PUT", `/v1/manage/operators/${target}/permissions`, { allow: [], deny: ["content.read"] })).json().code, "ESCALATION");
    }
    assert.equal((await req(ua, "GET", `/v1/manage/operators/${admin.id}`)).json().manageable, false);
    // A weaker account is fine.
    assert.equal((await req(ua, "GET", `/v1/manage/operators/${viewer.id}`)).json().manageable, true);
    assert.equal((await req(ua, "PATCH", `/v1/manage/operators/${viewer.id}`, { title: "Intern", must_change_password: true })).statusCode, 200);
    assert.equal((await req(viewer, "GET", "/v1/manage/entries")).json().code, "PASSWORD_CHANGE_REQUIRED");
    // A super admin manages another super admin; disabling ends their session at once.
    const admin2 = await signIn(t.app, t);
    await req(admin2, "PATCH", `/v1/manage/operators/${admin.id}`, { status: "disabled" });
    assert.equal((await req(admin, "GET", "/v1/manage/auth/me")).statusCode, 401);
  } finally {
    await t.close();
  }
});
