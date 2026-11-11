import { test } from "node:test";
import assert from "node:assert/strict";
import { contentType } from "@arapoush/schema";
import { evaluate, project, type Grant } from "../authz/grants.ts";
import { applyItems, editRatio } from "./merge.ts";
import { evaluatePolicies, type CrItem, type Ctx, type Policy } from "./policy.ts";

const printing = contentType("page.printing")!.schema;
const g = (scope: Grant["scope"], actions: string[], extra: Partial<Grant> = {}): Grant => ({ id: `g${Math.random()}`, subject_kind: "partner_role", subject_id: "aracms_editor", scope, actions, expires_at: null, ...extra });

test("grants: decision table (deny by default, exclude wins, locales, actions, expiry, locks)", () => {
  const editor = g({ types: ["page.*"], fields: ["/hero/**", "/tech/**"], exclude: ["/hero/features/**"], locales: ["fa", "en"] }, ["read", "propose"]);
  const rows: [Grant[], string, string, string | null, "read" | "propose" | "entry.create", boolean, string][] = [
    [[], "page.printing", "/hero/title", "fa", "read", false, "no_grant"],
    [[editor], "page.printing", "/hero/title", "fa", "propose", true, "granted"],
    [[editor], "page.printing", "/hero/title", "tr", "propose", false, "no_grant"],
    [[editor], "page.printing", "/hero/features[0]/text", "fa", "read", false, "no_grant"],
    [[editor], "page.printing", "/guide/title", "fa", "read", false, "no_grant"],
    [[editor], "global.site", "/meta/title", "fa", "read", false, "no_grant"],
    [[editor], "page.printing", "/hero/title", "fa", "entry.create", false, "no_grant"],
    [[editor], "page.printing", "/tech/items[id=flexo]/id", null, "propose", false, "locked"],
    [[g({ types: ["*"] }, ["propose"])], "page.printing", "/tech/items[id=flexo]/sample", null, "propose", false, "operator_only"],
    [[g({ types: ["page.printing"] }, ["read"], { expires_at: new Date(Date.now() - 1000) })], "page.printing", "/hero/title", "fa", "read", false, "no_grant"],
  ];
  for (const [grants, type, path, locale, action, allow, reason] of rows) {
    const d = evaluate(grants, printing, { type, path, locale, action });
    assert.equal(d.allow, allow, `${type}${path}@${locale} ${action}`);
    assert.equal(d.reason, reason, `${type}${path}@${locale} ${action}`);
  }
});

test("projection omits what is not granted, per field and per locale", () => {
  const data = { hero: { title: { fa: "ف", en: "E", tr: "T" }, lead: { fa: "x" } }, guide: { title: { en: "G" } } };
  const can = (p: string, l?: string) => evaluate([g({ types: ["page.printing"], fields: ["/hero/title"], locales: ["fa", "en"] }, ["read"])], printing, { type: "page.printing", path: p, locale: l, action: "read" }).allow;
  assert.deepEqual(project(printing, data, can), { hero: { title: { fa: "ف", en: "E" } } });
});

test("three-way merge applies untouched fields and reports conflicts without partial writes", () => {
  const cur = { a: { x: "old", y: "changed by operator" }, list: [{ id: "p", v: 1 }, { id: "q", v: 2 }] };
  const ok = applyItems(cur, [{ id: "1", path: "/a/x", op: "set", old: "old", value: "new" }]);
  assert.equal(ok.conflicts.length, 0);
  assert.equal((ok.data as typeof cur).a.x, "new");
  const clash = applyItems(cur, [
    { id: "1", path: "/a/x", op: "set", old: "old", value: "new" },
    { id: "2", path: "/a/y", op: "set", old: "original", value: "mine" },
  ]);
  assert.deepEqual(clash.conflicts.map((c) => c.item), ["2"]);
  assert.equal(clash.data, cur, "nothing applies when anything conflicts");
  // Already holding the proposed value is not a conflict.
  assert.equal(applyItems(cur, [{ id: "1", path: "/a/y", op: "set", old: "x", value: "changed by operator" }]).conflicts.length, 0);
  const ins = applyItems(cur, [{ id: "1", path: "/list", op: "insert", old: null, value: { id: "r", v: 3 } }]);
  assert.equal((ins.data as typeof cur).list.length, 3);
  const rm = applyItems(cur, [{ id: "1", path: "/list[id=p]", op: "remove", old: { id: "p", v: 1 }, value: null }]);
  assert.deepEqual((rm.data as typeof cur).list.map((x) => x.id), ["q"]);
  assert.equal(editRatio("ARAPOUSH Tube Printing", "ARAPOUSH Tube Printng"), 1 / 22);
});

test("policies: hard rules, priority, conditions and the time window", () => {
  const ctx: Ctx = { partner: "aracms", principal: "prn_1", role: "aracms_editor", now: new Date("2026-11-11T07:00:00Z"), autoApprovedLastHour: 0, assetsPending: false };
  const typo: CrItem = { type: "page.printing", path: "/hero/title@en", op: "set", old: "ARAPOUSH Tube Printing Technologies", value: "ARAPOUSH Tube Printing Technology" };
  const rewrite: CrItem = { ...typo, value: "Something entirely different here" };
  const typos: Policy = { id: "p1", name: "Typos", priority: 100, scope: { types: ["page.printing"] }, conditions: { maxItems: 5, textEditDistanceRatio: { lte: 0.2 }, noLinks: true, principalRoles: ["aracms_editor"], timeWindow: { tz: "Asia/Tehran", days: ["sat", "sun", "mon", "tue", "wed"], from: "08:00", to: "18:00" } }, effect: "auto_approve", auto_publish: true };
  const denyHero: Policy = { id: "p0", name: "No hero", priority: 10, scope: { fields: ["/hero/**"] }, conditions: {}, effect: "deny", auto_publish: false };

  // 2026-11-11 07:00 UTC is Wednesday 10:30 in Tehran: inside the window.
  assert.deepEqual(evaluatePolicies([typo], [typos], ctx), { effect: "auto_approve", autoPublish: true, fourEyes: false, policy: "p1", reasons: ["matched Typos"] });
  const big = evaluatePolicies([rewrite], [typos], ctx);
  assert.equal(big.effect, "require_review");
  assert.match(big.reasons.join(), /edit ratio/);
  // The higher priority decides; the lower one only applies when it does not match.
  assert.equal(evaluatePolicies([rewrite], [typos, denyHero], ctx).effect, "deny");
  assert.equal(evaluatePolicies([typo], [typos, denyHero], ctx).effect, "auto_approve");
  // Friday evening in Tehran: outside the window.
  assert.match(evaluatePolicies([typo], [typos], { ...ctx, now: new Date("2026-11-13T16:00:00Z") }).reasons.join(), /time window/);
  // Hard rules cannot be overridden.
  assert.equal(evaluatePolicies(Array(51).fill(typo), [{ ...typos, conditions: {} }], ctx).effect, "require_review");
  assert.equal(evaluatePolicies([{ type: "global.site", path: "/footer/links[0]/href", op: "set", old: "/a", value: "/b" }], [{ ...typos, scope: {}, conditions: {} }], ctx).effect, "require_review");
  assert.equal(evaluatePolicies([typo], [typos], { ...ctx, assetsPending: true }).effect, "require_review");
  assert.equal(evaluatePolicies([typo], [{ ...typos, conditions: { cooldown: { maxPerHour: 3 } } }], { ...ctx, autoApprovedLastHour: 3 }).effect, "require_review");
  assert.equal(evaluatePolicies([typo], [{ ...typos, conditions: { requiresSecondApprover: true } }], ctx).fourEyes, true);
  assert.equal(evaluatePolicies([typo], [], ctx).effect, "require_review", "default is review");
});
