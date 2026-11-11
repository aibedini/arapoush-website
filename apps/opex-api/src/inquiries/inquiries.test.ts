import { test } from "node:test";
import assert from "node:assert/strict";
import { testApp, signIn, stepUp, as } from "../testing.ts";
import { deliverEmails, purgeOld } from "./routes.ts";

const TOKEN = "test-delivery-token-0123456789abcdef";
const site = (ip = "198.51.100.40") => ({ authorization: `Bearer ${TOKEN}`, "x-end-user-ip": ip });
const body = (o: Record<string, unknown> = {}) => ({
  locale: "fa",
  page: "/fa/products/effervescent-tube",
  subject: "Quote: effervescent tube 27 × 175 mm",
  spec: ["27 × 175 mm"],
  fields: { name: "سارا کریمی", email: "sara@example.com", company: "Daroo Co", mobile: "09121234567", message: "۵۰ هزار عدد در ماه" },
  ...o,
});

test("an inquiry is stored encrypted, emailed, audited without personal data, and read with an audit trail", async () => {
  const t = await testApp({ DELIVERY_TOKEN: TOKEN });
  try {
    assert.equal((await t.app.inject({ method: "POST", url: "/v1/delivery/forms/quote", payload: body() })).statusCode, 401, "only the website may post");
    const r = await t.app.inject({ method: "POST", url: "/v1/delivery/forms/quote", headers: site(), payload: body() });
    assert.equal(r.statusCode, 201, r.body);
    const { id } = r.json();

    const [row] = await t.db.q<{ payload_enc: string; ip: string }>(`SELECT payload_enc, ip FROM inquiries WHERE id = $1`, [id]);
    assert.ok(!row!.payload_enc.includes("sara"), "payload is encrypted");
    assert.equal(row!.ip, "198.51.100.40");
    // Moving the ciphertext to another row does not decrypt (row id is bound as associated data).
    const audits = JSON.stringify(await t.db.q(`SELECT * FROM audit_events WHERE action = 'inquiry.received'`));
    assert.ok(!audits.includes("sara@example.com") && !audits.includes("سارا"), "no PII in the audit log");

    const sent: { to: string; subject: string; text: string; replyTo?: string }[] = [];
    await deliverEmails({ config: t.config, db: t.db }, t.app.log, { sendMail: async (m) => (sent.push(m), { messageId: "1" }) });
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.to, "sales@arapoush.com");
    assert.equal(sent[0]!.replyTo, "sara@example.com");
    assert.match(sent[0]!.text, /۵۰ هزار عدد در ماه/);
    await deliverEmails({ config: t.config, db: t.db }, t.app.log, { sendMail: async (m) => (sent.push(m), { messageId: "2" }) });
    assert.equal(sent.length, 1, "sent once");

    const op = await signIn(t.app, t, "operator");
    const viewer = await signIn(t.app, t, "viewer");
    assert.equal((await t.app.inject({ method: "GET", url: "/v1/manage/inquiries", headers: { cookie: viewer.cookie } })).statusCode, 403, "viewers never see personal data");
    const list = (await t.app.inject({ method: "GET", url: "/v1/manage/inquiries", headers: { cookie: op.cookie } })).json();
    assert.equal(list[0].email, "sara@example.com");
    const one = (await t.app.inject({ method: "GET", url: `/v1/manage/inquiries/${id}`, headers: { cookie: op.cookie } })).json();
    assert.equal(one.data.fields.company, "Daroo Co");
    assert.equal(one.emails[0].status, "sent");
    assert.equal((await t.app.inject({ method: "POST", url: `/v1/manage/inquiries/${id}/handled`, headers: as(op), payload: { handled: true } })).statusCode, 200);
    const acts = (await t.db.q<{ action: string }>(`SELECT action FROM audit_events ORDER BY seq`)).map((x) => x.action);
    for (const a of ["inquiry.received", "inquiry.list", "inquiry.read", "inquiry.handled"]) assert.ok(acts.includes(a), a);

    // Erasure: super admin + step-up.
    const admin = await signIn(t.app, t, "super_admin");
    await stepUp(t.app, admin);
    assert.equal((await t.app.inject({ method: "DELETE", url: `/v1/manage/inquiries/${id}`, headers: as(admin), payload: { reason: "Visitor asked" } })).statusCode, 200);
    assert.equal((await t.app.inject({ method: "GET", url: `/v1/manage/inquiries/${id}`, headers: { cookie: op.cookie } })).statusCode, 404);
  } finally {
    await t.close();
  }
});

test("spam controls: validation, header injection, per-IP limit, retention", async () => {
  const t = await testApp({ DELIVERY_TOKEN: TOKEN });
  try {
    const post = (b: Record<string, unknown>, ip?: string) => t.app.inject({ method: "POST", url: "/v1/delivery/forms/contact", headers: site(ip), payload: b });
    assert.equal((await post(body({ fields: { name: "x", email: "not-an-email" } }))).statusCode, 400);
    assert.equal((await post(body({ fields: { name: "", email: "a@b.co" } }))).statusCode, 400);
    assert.equal((await post(body({ fields: { name: "x", email: "a@b.co", bcc: "everyone@x.com" } }))).statusCode, 400, "unknown fields are refused");
    assert.equal((await t.app.inject({ method: "POST", url: "/v1/delivery/forms/admin", headers: site(), payload: body() })).statusCode, 400, "unknown form");
    // Bidi overrides and control characters are removed.
    const ok = await post(body({ subject: "Hi‮evil\u0007" }), "203.0.113.1");
    assert.equal(ok.statusCode, 201);
    const sent: { subject: string }[] = [];
    await deliverEmails({ config: t.config, db: t.db }, t.app.log, { sendMail: async (m) => (sent.push(m), { messageId: "1" }) });
    assert.equal(sent[0]!.subject, "[contact] Hievil");
    for (let i = 0; i < 4; i++) assert.equal((await post(body(), "203.0.113.2")).statusCode, 201);
    assert.equal((await post(body(), "203.0.113.2")).statusCode, 201);
    assert.equal((await post(body(), "203.0.113.2")).json().code, "TOO_MANY_INQUIRIES");
    assert.equal((await post(body(), "203.0.113.3")).statusCode, 201, "another visitor is not affected");

    await t.db.q(`UPDATE inquiries SET created_at = clock_timestamp() - interval '800 days' WHERE ip = '203.0.113.1'`);
    await purgeOld({ config: t.config, db: t.db });
    const [{ n }] = (await t.db.q<{ n: number }>(`SELECT count(*)::int AS n FROM inquiries WHERE ip = '203.0.113.1'`)) as [{ n: number }];
    assert.equal(n, 0);
    assert.ok((await t.db.q(`SELECT 1 FROM audit_events WHERE action = 'inquiry.purged'`)).length === 1);
  } finally {
    await t.close();
  }
});
