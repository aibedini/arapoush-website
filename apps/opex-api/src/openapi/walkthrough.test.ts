import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { as, partnerSession, signIn, stepUp, testApp } from "../testing.ts";

/**
 * Contract walkthrough (D2): calls every management, delivery, OAuth and partner read route that the
 * feature tests do not, with realistic inputs. The test app checks each answer against the route's
 * contract (src/openapi/verify.ts), so this test fails when a response drifts from its docs.
 */
const TOKEN = "test-delivery-token-0123456789abcdef";

test("every documented route answers as its contract says", async () => {
  const t = await testApp({ DELIVERY_TOKEN: TOKEN, MEDIA_DIR: mkdtempSync(path.join(tmpdir(), "opex-media-")) }, { seed: true });
  const ok = async (method: string, url: string, headers: Record<string, string>, payload?: unknown, status = 200) => {
    const r = await t.app.inject({ method: method as "GET", url, headers, ...(payload !== undefined ? { payload: payload as object } : {}) });
    assert.equal(r.statusCode, status, `${method} ${url}: ${r.body.slice(0, 300)}`);
    return r;
  };
  try {
    const admin = await signIn(t.app, t, "super_admin");
    await stepUp(t.app, admin);
    const op = await signIn(t.app, t, "operator");
    const A = as(admin);
    const R = { cookie: admin.cookie };

    // ── Sign-in and operators ──
    await ok("GET", "/healthz", {});
    await ok("GET", "/v1/manage/sessions", R);
    await ok("GET", "/v1/manage/sessions?all=1", R);
    // The second operator's own session, from their own list.
    const opSession = (await ok("GET", "/v1/manage/sessions", { cookie: op.cookie })).json()[0];
    const operators = (await ok("GET", "/v1/manage/operators", R)).json();
    const other = operators.find((o: { id: string }) => o.id === op.id);
    await ok("PATCH", `/v1/manage/operators/${other.id}`, A, { display_name: "Operator Two", unlock: true });
    await ok("POST", `/v1/manage/sessions/${opSession.id}/revoke`, A);
    await ok("POST", "/v1/manage/auth/password", A, { current: "correct horse battery staple 42", next: "a much longer passphrase for opex 2026" });

    // ── Content ──
    const types = (await ok("GET", "/v1/manage/types", R)).json();
    assert.ok(types.length > 5);
    await ok("GET", "/v1/manage/types/page.printing", R);
    await ok("GET", "/v1/manage/entries", R);
    const entry = (await ok("GET", "/v1/manage/entries/page.printing", R)).json();
    const saved = (await ok("PUT", "/v1/manage/entries/page.printing", A, { data: entry.draft.data, base_revision_id: entry.draft.id, note: "no-op save" })).json();
    await ok("POST", "/v1/manage/entries/page.printing/schedule", A, { at: new Date(Date.now() + 3_600_000).toISOString() });
    await ok("POST", "/v1/manage/entries/page.printing/schedule", A, { at: null });
    await ok("GET", `/v1/manage/revisions/${saved.revision.id}`, R);
    await ok("GET", `/v1/manage/diff?from=${entry.draft.id}&to=${saved.revision.id}`, R);

    // ── Media ──
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#09263c" } }).png().toBuffer();
    const boundary = "----opex";
    const multipart = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="dot.png"\r\nContent-Type: image/png\r\n\r\n`), png, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const asset = (await t.app.inject({ method: "POST", url: "/v1/manage/media", headers: { ...A, "content-type": `multipart/form-data; boundary=${boundary}` }, payload: multipart })).json();
    assert.ok(asset.id, JSON.stringify(asset));
    await ok("GET", "/v1/manage/media?q=dot", R);
    await ok("GET", `/v1/manage/media/${asset.url.split("/").pop()}/raw`, R);

    // ── OAuth metadata ──
    await ok("GET", "/.well-known/jwks.json", {});
    await ok("GET", "/.well-known/oauth-authorization-server", {});
    await ok("POST", "/oauth/revoke", { "content-type": "application/x-www-form-urlencoded" }, "token=x&client_id=unknown&client_assertion_type=x&client_assertion=x");

    // ── Partners, grants, policies, webhooks ──
    const p = await partnerSession(t.app, admin);
    const partners = (await ok("GET", "/v1/manage/partners", R)).json();
    const partner = partners[0];
    await ok("PATCH", `/v1/manage/partners/${partner.id}`, A, { contact: "it@aracms.test" });
    const users = (await ok("GET", `/v1/manage/partners/${partner.id}/users`, R)).json();
    await ok("PATCH", `/v1/manage/partner-users/${users[0].id}`, A, { role: "aracms_editor", unlock: true });
    const grant = (await ok("POST", "/v1/manage/grants", A, { subject_kind: "partner_role", subject_id: "aracms_editor", scope: { types: ["page.printing"] }, actions: ["read", "propose", "cr.read_all"] })).json();
    await ok("GET", "/v1/manage/grants", R);
    const policy = (await ok("POST", "/v1/manage/policies", A, { name: "Small fa edits", scope: { types: ["page.printing"] }, conditions: { maxItems: 3 }, effect: "require_review" })).json();
    await ok("GET", "/v1/manage/policies", R);
    await ok("PUT", `/v1/manage/policies/${policy.id}`, A, { name: "Small edits", scope: { types: ["page.printing"] }, effect: "require_review" });
    await ok("PUT", `/v1/manage/partners/${partner.id}/webhook`, A, { url: "https://aracms.test/hooks" });

    // Partner reads and a change request the operators publish.
    const content = (await p.call("GET", "/v1/partner/content/page.printing")).json();
    assert.equal((await p.call("GET", "/v1/partner/content/page.printing/history")).statusCode, 200);
    assert.equal((await p.call("GET", `/v1/partner/content/page.printing/history?revision=${content.base_revision_id}`)).statusCode, 200);
    const cr = (await p.call("POST", "/v1/partner/change-requests", { body: { title: "Lead tweak", items: [{ entry: "page.printing", base_revision_id: content.base_revision_id, path: "/hero/lead", locale: "en", value: "Printing technologies, explained." }] } })).json();
    assert.equal((await p.call("GET", "/v1/partner/change-requests")).statusCode, 200);
    await ok("GET", "/v1/manage/change-requests?state=pending_review", R);
    await ok("POST", `/v1/manage/change-requests/${cr.id}/approve`, A, { publish: false });
    await ok("POST", `/v1/manage/change-requests/${cr.id}/publish`, A);
    const deliveries = (await ok("GET", "/v1/manage/webhooks", A)).json();
    await ok("POST", `/v1/manage/webhooks/${deliveries[0].id}/retry`, A);
    await ok("DELETE", `/v1/manage/policies/${policy.id}`, A);
    await ok("DELETE", `/v1/manage/grants/${grant.id}`, A);

    // ── Forms ──
    await ok("GET", "/v1/manage/forms", R);
    const form = (await ok("POST", "/v1/manage/forms", A, { slug: "walkthrough", title: "Walkthrough" })).json();
    const copy = (await ok("POST", `/v1/manage/forms/${form.id}/duplicate`, A, { slug: "walkthrough-copy" })).json();
    await ok("POST", `/v1/manage/forms/${copy.id}/status`, A, { archived: true });
    await ok("POST", `/v1/manage/forms/${form.id}/publish`, A);
    await ok("GET", `/v1/manage/forms/${form.id}/versions/1`, R);
    await ok("GET", "/v1/delivery/forms/walkthrough", { authorization: `Bearer ${TOKEN}` });

    // ── Helpdesk ──
    const sub = (await ok("POST", "/v1/delivery/forms/contact", { authorization: `Bearer ${TOKEN}`, "x-end-user-ip": "198.51.100.9" }, { locale: "en", page: "/en", values: { name: "Jo", email: "jo@example.com", message: "Hello" } }, 201)).json();
    const people = (await ok("GET", "/v1/manage/helpdesk/people", A)).json();
    const teams = (await ok("GET", "/v1/manage/teams", R)).json();
    await ok("PATCH", `/v1/manage/tickets/${sub.number}`, A, { priority: "high", tags: ["walkthrough"], team: teams[0].id });
    await ok("POST", `/v1/manage/tickets/${sub.number}/assign`, A, { assignee: people[0].id });
    await ok("POST", "/v1/manage/tickets/bulk", A, { ids: [sub.id], status: "on_hold" });
    await ok("PATCH", `/v1/manage/teams/${teams[0].id}`, A, { auto_assign: false, sla: { urgent: { first: 30, resolve: 240 } } });
    const team = (await ok("POST", "/v1/manage/teams", A, { key: "temp", name: "Temp" })).json();
    await ok("DELETE", `/v1/manage/teams/${team.id}`, A);
    await ok("GET", "/v1/manage/me/prefs", R);
    await ok("PUT", "/v1/manage/me/prefs", A, { emailNotifications: false });
    await ok("POST", "/v1/manage/notifications/read", A, {});
    const reply = (await ok("POST", "/v1/manage/saved-replies", A, { title: "Thanks", team: null, body: { fa: "سپاس {name}", en: "Thanks {name}" } })).json();
    await ok("GET", "/v1/manage/saved-replies", A);
    await ok("PUT", `/v1/manage/saved-replies/${reply.id}`, A, { title: "Thank you", team: null, body: { en: "Thank you {name}" } });
    await ok("DELETE", `/v1/manage/saved-replies/${reply.id}`, A);
    await ok("GET", "/v1/manage/helpdesk/mailbox", A);
  } finally {
    await t.close();
  }
});
