import { test } from "node:test";
import assert from "node:assert/strict";
import { testApp, signIn, stepUp, as } from "../testing.ts";
import { checkSla, deliverOutbox, handleInbound, stripQuoted } from "./mail.ts";
import { starterDefinition } from "../forms/system.ts";

const TOKEN = "test-delivery-token-0123456789abcdef";
const site = (ip = "198.51.100.40") => ({ authorization: `Bearer ${TOKEN}`, "x-end-user-ip": ip });
type Sent = { to: string; subject: string; text: string; replyTo?: string; messageId?: string; inReplyTo?: string; references?: string[]; from: string };
const outbox = async (t: Awaited<ReturnType<typeof testApp>>) => {
  const sent: Sent[] = [];
  await deliverOutbox({ config: t.config, db: t.db }, t.app.log, { sendMail: async (m) => (sent.push(m as Sent), { messageId: "x" }) });
  return sent;
};
const mail = (o: { from: string; subject: string; body: string; inReplyTo?: string; id?: string; headers?: string }) =>
  Buffer.from(
    [`From: Sara <${o.from}>`, "To: support@arapoush.com", `Subject: ${o.subject}`, `Message-ID: <${o.id ?? Math.random().toString(36).slice(2)}@mail.example>`, ...(o.inReplyTo ? [`In-Reply-To: ${o.inReplyTo}`, `References: ${o.inReplyTo}`] : []), ...(o.headers ? [o.headers] : []), "Content-Type: text/plain; charset=utf-8", "", o.body].join("\r\n"),
  );

test("a quote request becomes a routed ticket; the timeline records who opened it; replies thread both ways", async () => {
  const t = await testApp({ DELIVERY_TOKEN: TOKEN });
  try {
    const admin = await signIn(t.app, t, "super_admin");
    const ali = await signIn(t.app, t, "operator");
    const reza = await signIn(t.app, t, "operator");
    const outsider = await signIn(t.app, t, "operator");
    const teams = (await t.app.inject({ method: "GET", url: "/v1/manage/teams", headers: { cookie: admin.cookie } })).json();
    const sales = teams.find((x: { key: string }) => x.key === "sales");
    assert.ok(sales, "the sales team is seeded");
    // Outsider sees unrouted tickets only; Ali and Reza are in sales. Reza is away.
    await t.app.inject({ method: "PUT", url: `/v1/manage/teams/${sales.id}/members`, headers: as(admin), payload: [{ id: ali.id, role: "agent" }, { id: reza.id, role: "lead" }] });
    await t.app.inject({ method: "POST", url: "/v1/manage/me/availability", headers: as(reza), payload: { team: sales.id, available: false } });

    // The P8 payload from the configurator's quote sheet is still accepted.
    const r = await t.app.inject({
      method: "POST",
      url: "/v1/delivery/forms/quote",
      headers: site(),
      payload: { locale: "fa", page: "/fa/products/multi-layer-tube", subject: "Quote: tube 35 × 150", spec: ["35 × 150 mm", "Flip-top"], fields: { name: "سارا کریمی", email: "Sara@Example.com", company: "Daroo Co", mobile: "09121234567", message: "۵۰ هزار عدد" } },
    });
    assert.equal(r.statusCode, 201, r.body);
    const { number } = r.json();

    const [row] = await t.db.q<{ data_enc: string; team_id: string; assignee_id: string; status: string }>(`SELECT data_enc, team_id, assignee_id, status FROM tickets WHERE number = $1`, [number]);
    assert.ok(!row!.data_enc.includes("Sara") && !row!.data_enc.includes("سارا"), "encrypted at rest");
    assert.equal(row!.team_id, sales.id, "routed to sales");
    assert.equal(row!.assignee_id, ali.id, "auto-assigned to the available agent");
    const audits = JSON.stringify(await t.db.q(`SELECT * FROM audit_events WHERE action = 'ticket.created'`));
    assert.ok(!audits.toLowerCase().includes("sara"), "no PII in the audit log");
    let sent = await outbox(t);
    const notice = sent.find((m) => m.to === "sales@arapoush.com");
    assert.ok(notice && notice.replyTo === "sara@example.com" && /۵۰ هزار عدد/.test(notice.text), "sales still gets the request by email");
    assert.ok(sent.some((m) => m.subject.includes(`#${number}`) && m.text.includes("/tickets/")), "Ali is notified with a console link");

    // Scope: the outsider cannot open a sales ticket.
    assert.equal((await t.app.inject({ method: "GET", url: `/v1/manage/tickets/${number}`, headers: { cookie: outsider.cookie } })).statusCode, 404);
    const viewer = await signIn(t.app, t, "viewer");
    assert.equal((await t.app.inject({ method: "GET", url: "/v1/manage/tickets", headers: { cookie: viewer.cookie } })).statusCode, 403, "viewers never see tickets");

    // Ali opens it: new → open, a viewed event, a read marker, an audit row.
    const view = (await t.app.inject({ method: "GET", url: `/v1/manage/tickets/${number}`, headers: { cookie: ali.cookie } })).json();
    assert.equal(view.ticket.status, "open");
    assert.equal(view.data.requester.email, "sara@example.com");
    assert.equal(view.data.values.phone, "09121234567", "mobile maps to phone");
    assert.deepEqual(view.data.context.spec, ["35 × 150 mm", "Flip-top"]);
    assert.ok(view.events.some((e: { kind: string; actor: { id: string } }) => e.kind === "viewed" && e.actor.id === ali.id));
    assert.equal(view.reads[0].principal_id, ali.id);
    await t.app.inject({ method: "GET", url: `/v1/manage/tickets/${number}`, headers: { cookie: ali.cookie } });
    const views = await t.db.q(`SELECT 1 FROM ticket_events e JOIN tickets t ON t.id = e.ticket_id WHERE t.number = $1 AND e.kind = 'viewed'`, [number]);
    assert.equal(views.length, 1, "repeat openings within 10 minutes are one event");

    // Internal note with a mention; referral to the team lead; Reza is notified.
    assert.equal((await t.app.inject({ method: "POST", url: `/v1/manage/tickets/${number}/notes`, headers: as(ali), payload: { body: "قیمت ویژه؟", mentions: [reza.id] } })).statusCode, 200);
    assert.equal((await t.app.inject({ method: "POST", url: `/v1/manage/tickets/${number}/refer`, headers: as(ali), payload: { to: reza.id, message: "لطفاً تأیید قیمت", transfer: false } })).statusCode, 200);
    const notes = (await t.app.inject({ method: "GET", url: "/v1/manage/notifications", headers: { cookie: reza.cookie } })).json();
    assert.equal(notes.unread, 2);
    assert.ok(notes.items.every((n: { text: string }) => !n.text.includes("سارا")), "notifications carry no PII");
    const counts = (await t.app.inject({ method: "GET", url: "/v1/manage/tickets/counts", headers: { cookie: ali.cookie } })).json();
    assert.equal(counts.mine, 1);

    // Reply to the customer: threaded email, first response time, status pending.
    assert.equal((await t.app.inject({ method: "POST", url: `/v1/manage/tickets/${number}/replies`, headers: as(ali), payload: { body: "سلام، پیش‌فاکتور پیوست است." } })).statusCode, 200);
    sent = await outbox(t);
    const reply = sent.find((m) => m.to === "sara@example.com")!;
    assert.match(reply.subject, new RegExp(`\\[#${number}\\]`));
    assert.match(reply.messageId!, /^<tkt\.tev_.+@arapoush\.com>$/);
    assert.match(reply.from, /support@arapoush\.com/);
    const [after] = await t.db.q<{ status: string; first_response_at: Date | null }>(`SELECT status, first_response_at FROM tickets WHERE number = $1`, [number]);
    assert.equal(after!.status, "pending");
    assert.ok(after!.first_response_at);

    // The customer answers: threads by In-Reply-To, quoted text is cut, the ticket reopens.
    const back = await handleInbound({ config: t.config, db: t.db }, mail({ from: "sara@example.com", subject: `Re: Quote [#${number}]`, inReplyTo: reply.messageId, body: "عالی، سفارش می‌دهیم.\n\nOn Mon, 3 Nov 2026 Arapoush wrote:\n> سلام، پیش‌فاکتور پیوست است." }));
    assert.deepEqual(back, { ticket: number, created: false });
    const v2 = (await t.app.inject({ method: "GET", url: `/v1/manage/tickets/${number}`, headers: { cookie: ali.cookie } })).json();
    const inbound = v2.events.find((e: { kind: string }) => e.kind === "reply_in");
    assert.equal(inbound.body.text, "عالی، سفارش می‌دهیم.");
    assert.equal(v2.ticket.status, "open");

    // "[#n]" from somebody else does not attach to the ticket; it opens a new one.
    const other = await handleInbound({ config: t.config, db: t.db }, mail({ from: "mallory@evil.example", subject: `Re: [#${number}]`, body: "let me in" }));
    assert.equal(other.created, true);
    assert.notEqual(other.ticket, number);
    // Auto-replies are ignored; the same Message-ID twice is stored once.
    assert.equal((await handleInbound({ config: t.config, db: t.db }, mail({ from: "sara@example.com", subject: "Out of office", body: "away", headers: "Auto-Submitted: auto-replied" }))).skipped, "automatic");
    const dup = mail({ from: "x@example.com", subject: "Hi", body: "once", id: "same-id" });
    await handleInbound({ config: t.config, db: t.db }, dup);
    assert.equal((await handleInbound({ config: t.config, db: t.db }, dup)).skipped, "duplicate");

    // Spam + block: the sender's next email is dropped.
    assert.equal((await t.app.inject({ method: "POST", url: `/v1/manage/tickets/${other.ticket}/spam`, headers: as(admin), payload: { spam: true, block: true } })).statusCode, 200);
    assert.equal((await handleInbound({ config: t.config, db: t.db }, mail({ from: "mallory@evil.example", subject: "again", body: "x" }))).skipped, "blocked");

    // Merge, then erase with step-up.
    assert.equal((await t.app.inject({ method: "POST", url: `/v1/manage/tickets/${other.ticket}/merge`, headers: as(admin), payload: { into: number } })).statusCode, 200);
    await stepUp(t.app, admin);
    assert.equal((await t.app.inject({ method: "DELETE", url: `/v1/manage/tickets/${number}`, headers: as(admin), payload: { reason: "Customer asked" } })).statusCode, 200);

    const acts = new Set((await t.db.q<{ action: string }>(`SELECT action FROM audit_events`)).map((x) => x.action));
    for (const a of ["ticket.created", "ticket.read", "ticket.note", "ticket.referred", "ticket.replied", "ticket.customer_reply", "ticket.merged", "ticket.erased"]) assert.ok(acts.has(a), a);
  } finally {
    await t.close();
  }
});

test("form builder: draft, validation, publish, routing rules, file fields, delivery bundle", async () => {
  const t = await testApp({ DELIVERY_TOKEN: TOKEN });
  try {
    const op = await signIn(t.app, t, "operator");
    const admin = await signIn(t.app, t, "super_admin");
    await t.app.inject({ method: "POST", url: "/v1/manage/teams", headers: as(admin), payload: { key: "support", name: "پشتیبانی" } });
    const { id } = (await t.app.inject({ method: "POST", url: "/v1/manage/forms", headers: as(op), payload: { slug: "sample-request", title: "درخواست نمونه" } })).json();
    const get = async () => (await t.app.inject({ method: "GET", url: `/v1/manage/forms/${id}`, headers: { cookie: op.cookie } })).json();
    let f = await get();
    assert.equal(f.form.status, "draft");

    const def = starterDefinition("درخواست نمونه");
    def.fields.push(
      { id: "kind", type: "select", label: { fa: "نوع" }, required: true, options: [{ value: "tube", label: { fa: "تیوب" } }, { value: "eff", label: { fa: "جوشان" } }] },
      { id: "qty", type: "number", label: { fa: "تعداد" }, min: 1, showIf: { field: "kind", op: "eq", value: "tube" } },
      { id: "brief", type: "file", label: { fa: "فایل طرح" }, accept: ["pdf"], max: 1 },
      { id: "dup", type: "text", label: {} },
    );
    def.settings.rules = [{ when: { field: "kind", op: "eq", value: "eff" }, set: { team: "support", priority: "high", tags: ["effervescent"] } }];
    const save = await t.app.inject({ method: "PUT", url: `/v1/manage/forms/${id}/draft`, headers: as(op), payload: { definition: def, version: f.form.updated_at } });
    assert.equal(save.statusCode, 200, save.body);
    assert.ok(save.json().issues.some((i: { path: string }) => i.path === "fields.6.label"), "missing label is reported");
    assert.equal((await t.app.inject({ method: "PUT", url: `/v1/manage/forms/${id}/draft`, headers: as(op), payload: { definition: def, version: f.form.updated_at } })).json().code, "CONFLICT_BASE_REVISION", "stale editor is refused");
    assert.equal((await t.app.inject({ method: "POST", url: `/v1/manage/forms/${id}/publish`, headers: as(op) })).json().code, "FORM_INVALID");
    def.fields.pop();
    f = await get();
    await t.app.inject({ method: "PUT", url: `/v1/manage/forms/${id}/draft`, headers: as(op), payload: { definition: def, version: f.form.updated_at } });
    assert.equal((await t.app.inject({ method: "POST", url: `/v1/manage/forms/${id}/publish`, headers: as(op) })).json().version, 1);

    const bundle = (await t.app.inject({ method: "GET", url: "/v1/delivery/bundle", headers: { authorization: `Bearer ${TOKEN}` } })).json();
    const pub = bundle.entries["form.sample-request"].data;
    assert.equal(pub.fields.length, 6);
    assert.equal(pub.settings, undefined, "routing and notify addresses never reach the website");

    const post = (values: Record<string, unknown>, files?: unknown[]) => t.app.inject({ method: "POST", url: "/v1/delivery/forms/sample-request", headers: site(`203.0.113.${Math.floor(Math.random() * 200)}`), payload: { locale: "fa", page: "/fa/forms/sample-request", values, files } });
    const bad = await post({ name: "x", email: "bad", message: "hi", kind: "nope", hacker: "1" });
    assert.equal(bad.statusCode, 400);
    const issues = Object.fromEntries(bad.json().issues.map((i: { path: string; message: string }) => [i.path, i.message]));
    assert.deepEqual(issues, { hacker: "unknown_field", email: "invalid_email", kind: "invalid_option" });
    // A field hidden by its condition is dropped, not validated.
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF").toString("base64");
    const ok = await post({ name: "Ali", email: "ali@example.com", message: "Need samples", kind: "eff", qty: "۵۰" }, [{ field: "brief", name: "brief.pdf", data: pdf }]);
    assert.equal(ok.statusCode, 201, ok.body);
    const [tk] = await t.db.q<{ priority: string; tags: string[]; team: string; id: string }>(`SELECT t.id, t.priority, t.tags, tm.key AS team FROM tickets t JOIN teams tm ON tm.id = t.team_id WHERE t.number = $1`, [ok.json().number]);
    assert.equal(tk!.team, "support");
    assert.equal(tk!.priority, "high");
    assert.deepEqual(tk!.tags, ["effervescent"]);
    const view = (await t.app.inject({ method: "GET", url: `/v1/manage/tickets/${ok.json().number}`, headers: { cookie: admin.cookie } })).json();
    assert.equal(view.data.values.qty, undefined, "hidden field dropped");
    assert.equal(view.attachments[0].name, "brief.pdf");
    const file = await t.app.inject({ method: "GET", url: `/v1/manage/tickets/${ok.json().number}/attachments/${view.attachments[0].id}`, headers: { cookie: admin.cookie } });
    assert.equal(file.headers["content-type"], "application/pdf");
    assert.match(file.body, /^%PDF/);
    // A PNG pretending to be the PDF field is refused.
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").toString("base64");
    assert.equal((await post({ name: "Ali", email: "ali@example.com", message: "x", kind: "eff" }, [{ field: "brief", name: "a.pdf", data: png }])).statusCode, 400);
  } finally {
    await t.close();
  }
});

test("SLA breaches are flagged once and notify the leads; quoted text stripping", async () => {
  const t = await testApp({ DELIVERY_TOKEN: TOKEN });
  try {
    const lead = await signIn(t.app, t, "operator");
    const admin = await signIn(t.app, t, "super_admin");
    const [sales] = await t.db.q<{ id: string }>(`SELECT id FROM teams WHERE key = 'sales'`);
    await t.app.inject({ method: "PUT", url: `/v1/manage/teams/${sales!.id}/members`, headers: as(admin), payload: [{ id: lead.id, role: "lead" }] });
    const r = await t.app.inject({ method: "POST", url: "/v1/delivery/forms/contact", headers: site(), payload: { locale: "en", page: "/en", values: { name: "Jo", email: "jo@example.com", message: "Hello" } } });
    assert.equal(r.statusCode, 201, r.body);
    await t.db.q(`UPDATE tickets SET first_response_due = clock_timestamp() - interval '1 minute'`);
    await checkSla({ config: t.config, db: t.db });
    await checkSla({ config: t.config, db: t.db });
    const n = await t.db.q(`SELECT 1 FROM ticket_events WHERE kind = 'sla_breached'`);
    assert.equal(n.length, 1, "flagged once");
    const notes = (await t.app.inject({ method: "GET", url: "/v1/manage/notifications", headers: { cookie: lead.cookie } })).json();
    assert.ok(notes.items.some((x: { kind: string }) => x.kind === "ticket.sla"));
    const overdue = (await t.app.inject({ method: "GET", url: "/v1/manage/tickets?view=overdue", headers: { cookie: lead.cookie } })).json();
    assert.equal(overdue.length, 1);
    assert.equal(overdue[0].sla.breached, true);

    assert.equal(stripQuoted("Thanks!\n\n-- \nJo\nCEO"), "Thanks!");
    assert.equal(stripQuoted("باشه\n\nدر تاریخ ۱۲ آبان ۱۴۰۵ آراپوش نوشت:\n> متن"), "باشه");
    assert.equal(stripQuoted("Line one\n> quoted in the middle\nLine two"), "Line one\n> quoted in the middle\nLine two", "inline quotes stay");
  } finally {
    await t.close();
  }
});

test("tube quote (T5): configuration in hidden fields and context, subject from it, confirmation with the number", async () => {
  const t = await testApp({ DELIVERY_TOKEN: TOKEN });
  try {
    const admin = await signIn(t.app, t, "super_admin");
    const config = { shape: "circular", diameter: "30", length: "110", closure: "airless", cap_colour: "metallicSilver", body_colour: "#1d1f22", print: "hotstamp", structure: "pe-evoh-5", link: "shape=circular&d=30&l=110&cap=airless" };
    const r = await t.app.inject({
      method: "POST",
      url: "/v1/delivery/forms/tube-quote",
      headers: site("198.51.100.77"),
      payload: {
        locale: "fa",
        page: "/fa/products/multi-layer-tube",
        values: { name: "Sara Karimi", company: "Daroo Co", phone: "09121234567", email: "sara@example.com", contact: "whatsapp", time: "morning", quantity: 50000, needed_by: "2026-12-20", message: "Gold foil logo", ...config },
        context: { spec: ["گرد · Ø30 × 110 mm", "پمپ ایرلس", "چاپ: هات استمپ"] },
      },
    });
    assert.equal(r.statusCode, 201, r.body);
    const { number } = r.json();

    // An unknown contact option is refused (the shared validator, same as in the browser).
    const bad = await t.app.inject({ method: "POST", url: "/v1/delivery/forms/tube-quote", headers: site("198.51.100.78"), payload: { locale: "en", page: "/en/products/multi-layer-tube", values: { name: "A", phone: "09120000000", contact: "nope" } } });
    assert.equal(bad.statusCode, 400);

    const ticket = (await t.app.inject({ method: "GET", url: `/v1/manage/tickets/${number}`, headers: { cookie: admin.cookie } })).json();
    assert.equal(ticket.data.subject, "Ø30 × 110 airless — Sara Karimi");
    assert.equal(ticket.data.values.print, "hotstamp");
    assert.equal(ticket.data.values.contact, "whatsapp");
    assert.deepEqual(ticket.data.context.spec, ["گرد · Ø30 × 110 mm", "پمپ ایرلس", "چاپ: هات استمپ"]);
    assert.equal(ticket.ticket.team.name, "فروش", "routed to sales");
    const sent = await outbox(t);
    const conf = sent.find((m) => m.to === "sara@example.com");
    assert.ok(conf, "the visitor gets a confirmation");
    assert.match(conf!.subject, new RegExp(`#${number}`));
    assert.match(conf!.text, new RegExp(`#${number}`));
    assert.match(conf!.text, /Sara Karimi/);
  } finally {
    await t.close();
  }
});
