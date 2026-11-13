import { test } from "node:test";
import assert from "node:assert/strict";
import { testApp, signIn, as } from "../testing.ts";
import { BUILTIN_ROLES, PERMISSION_KEYS, ROUTE_PERMISSIONS, SELF } from "./permissions.ts";

test("every console route has exactly one known permission (S1, deny by default)", async () => {
  const t = await testApp();
  try {
    const manage = t.app.routeList.filter((r) => r.url.startsWith("/v1/manage/") && !/^\/v1\/manage\/auth\/(login|mfa)/.test(r.url));
    const missing = manage.filter((r) => !ROUTE_PERMISSIONS[`${r.method} ${r.url}`]).map((r) => `${r.method} ${r.url}`);
    assert.deepEqual(missing, [], "add these to ROUTE_PERMISSIONS");
    const stale = Object.keys(ROUTE_PERMISSIONS).filter((k) => !manage.some((r) => `${r.method} ${r.url}` === k));
    assert.deepEqual(stale, [], "these mapped routes no longer exist");
    for (const [k, p] of Object.entries(ROUTE_PERMISSIONS)) assert.ok(p === SELF || PERMISSION_KEYS.has(p), `${k} → ${p}`);
    for (const r of Object.values(BUILTIN_ROLES)) for (const p of r.permissions) assert.ok(PERMISSION_KEYS.has(p), p);
  } finally {
    await t.close();
  }
});

test("custom roles and per-user allow/deny decide each function; no escalation (S1)", async () => {
  const t = await testApp();
  try {
    const admin = await signIn(t.app, t);
    const viewer = await signIn(t.app, t, "viewer");
    const req = (op: typeof admin, method: string, url: string, payload?: unknown) => t.app.inject({ method: method as "GET", url, headers: as(op), payload: payload as object });

    // A viewer cannot read tickets, but can once it is given tickets.read on its own.
    assert.equal((await req(viewer, "GET", "/v1/manage/tickets")).statusCode, 403);
    const set = await req(admin, "PUT", `/v1/manage/operators/${viewer.id}/permissions`, { allow: ["tickets.read"], deny: ["content.read"] });
    assert.equal(set.statusCode, 200, set.body);
    assert.equal((await req(viewer, "GET", "/v1/manage/tickets")).statusCode, 200);
    // …and a role permission taken away really is gone.
    assert.equal((await req(viewer, "GET", "/v1/manage/entries")).statusCode, 403);
    const me = (await req(viewer, "GET", "/v1/manage/auth/me")).json();
    assert.ok(me.permissions.includes("tickets.read") && !me.permissions.includes("content.read"));

    // Self-service works for everyone (an auditor could not even log out before).
    const auditor = await signIn(t.app, t, "auditor");
    assert.equal((await req(auditor, "PUT", "/v1/manage/me/prefs", { prefs: {} })).statusCode < 500, true);

    // Custom role.
    const role = await req(admin, "POST", "/v1/manage/roles", { key: "seo_editor", name: "SEO editor", permissions: ["seo.read", "seo.run", "content.read"] });
    assert.equal(role.statusCode, 200, role.body);
    const editor = await signIn(t.app, t, "seo_editor");
    assert.equal((await req(editor, "GET", "/v1/manage/seo/reports")).statusCode, 200);
    assert.equal((await req(editor, "GET", "/v1/manage/forms")).statusCode, 403);
    assert.equal((await req(admin, "DELETE", "/v1/manage/roles/seo_editor")).json().code, "ROLE_IN_USE");

    // Unknown permission keys and self-changes are refused.
    assert.equal((await req(admin, "PUT", `/v1/manage/operators/${viewer.id}/permissions`, { allow: ["root.everything"], deny: [] })).json().code, "UNKNOWN_PERMISSION");
    assert.equal((await req(admin, "PUT", `/v1/manage/operators/${admin.id}/permissions`, { allow: [], deny: ["users.read"] })).json().code, "SELF_CHANGE");

    // A user admin (custom role) cannot give out super admin, nor demote the last super admin.
    await req(admin, "POST", "/v1/manage/roles", { key: "user_admin", name: "User admin", permissions: [...BUILTIN_ROLES.viewer!.permissions, "users.read", "users.update", "users.permissions"] });
    const ua = await signIn(t.app, t, "user_admin");
    assert.equal((await req(ua, "PATCH", `/v1/manage/operators/${viewer.id}`, { role: "super_admin" })).json().code, "ESCALATION");
    assert.equal((await req(ua, "PATCH", `/v1/manage/operators/${viewer.id}`, { role: "operator" })).json().code, "ESCALATION");
    assert.equal((await req(ua, "PATCH", `/v1/manage/operators/${admin.id}`, { role: "viewer" })).json().code, "LAST_ADMIN");
  } finally {
    await t.close();
  }
});

test("settings are validated, audited and travel with the content bundle (S3)", async () => {
  const t = await testApp();
  try {
    const admin = await signIn(t.app, t);
    const bad = await t.app.inject({ method: "PUT", url: "/v1/manage/settings/analytics", headers: as(admin), payload: { ga4: "<script>alert(1)</script>" } });
    assert.equal(bad.statusCode, 400);
    const ok = await t.app.inject({ method: "PUT", url: "/v1/manage/settings/analytics", headers: as(admin), payload: { ga4: "G-ABC1234", verification: { google: "abcdefghijklmnop" } } });
    assert.equal(ok.statusCode, 200, ok.body);
    const s = (await t.app.inject({ method: "GET", url: "/v1/manage/settings", headers: as(admin) })).json();
    assert.equal(s.analytics.ga4, "G-ABC1234");
    assert.equal(s.seo.indexing, true);
    const bundle = await t.app.inject({ method: "GET", url: "/v1/delivery/bundle", headers: { authorization: `Bearer ${t.config.DELIVERY_TOKEN}` } });
    assert.equal(bundle.json().entries["settings.site"].data.analytics.ga4, "G-ABC1234");
  } finally {
    await t.close();
  }
});

test("backups: encrypted archive, restore with a safety copy, secrets masked (S4)", async () => {
  const t = await testApp();
  try {
    const admin = await signIn(t.app, t);
    await t.app.inject({ method: "PUT", url: "/v1/manage/settings/security", headers: as(admin), payload: { contactEmail: "security@arapoush.com" } });
    const made = await t.app.inject({ method: "POST", url: "/v1/manage/backups", headers: as(admin), payload: { kind: "content", remote: false } });
    assert.equal(made.statusCode, 200, made.body);
    const id = made.json().id;
    const file = await t.app.inject({ method: "GET", url: `/v1/manage/backups/${id}/download`, headers: as(admin) });
    assert.equal(file.statusCode, 200);
    assert.equal(file.rawPayload.subarray(0, 8).toString(), "OPEXBAK1");
    assert.ok(!file.rawPayload.includes(Buffer.from("security@arapoush.com")), "archive is encrypted");

    await t.app.inject({ method: "PUT", url: "/v1/manage/settings/security", headers: as(admin), payload: { contactEmail: "changed@arapoush.com" } });
    const r = await t.app.inject({ method: "POST", url: "/v1/manage/backups/restore", headers: as(admin), payload: { id, scope: "content", media: false, confirm: "RESTORE" } });
    assert.equal(r.statusCode, 200, r.body);
    assert.ok(r.json().safety.startsWith("bak_"));
    assert.equal((await t.app.inject({ method: "GET", url: "/v1/manage/settings", headers: as(admin) })).json().security.contactEmail, "security@arapoush.com");
    assert.equal((await t.app.inject({ method: "POST", url: "/v1/manage/backups/restore", headers: as(admin), payload: { id, confirm: "yes" } })).statusCode, 400);

    const cfg = await t.app.inject({ method: "PUT", url: "/v1/manage/backups/config", headers: as(admin), payload: { schedule: "daily", remote: { type: "sftp", host: "backup.example.com", user: "opex", password: "s3cret-pass" } } });
    assert.equal(cfg.statusCode, 200, cfg.body);
    const read = (await t.app.inject({ method: "GET", url: "/v1/manage/backups/config", headers: as(admin) })).json();
    assert.equal(read.remote.password, "••••••");
    const [row] = await t.db.q<{ data: { remote: { password: string } } }>(`SELECT data FROM site_settings WHERE section = 'backup'`);
    assert.ok(row!.data.remote.password.startsWith("enc:") && !row!.data.remote.password.includes("s3cret"));
  } finally {
    await t.close();
  }
});
