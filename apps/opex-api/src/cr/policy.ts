import { globMatch, matchPath } from "@arapoush/schema";
import { splitLocale } from "../authz/grants.ts";
import { editRatio } from "./merge.ts";

/** Plan §7.3: operator-configured approval policies, evaluated by a pure function. */
export type Policy = {
  id: string;
  name: string;
  priority: number;
  scope: { partners?: string[]; types?: string[]; fields?: string[]; locales?: string[] };
  conditions: {
    maxItems?: number;
    textEditDistanceRatio?: { lte: number };
    maxLengthDelta?: number;
    noNewAssets?: boolean;
    assetsOnly?: boolean;
    noLinks?: boolean;
    locales?: string[];
    principalRoles?: string[];
    principals?: string[];
    timeWindow?: { tz: string; days?: string[]; from?: string; to?: string };
    entryCreate?: boolean;
    entryDelete?: boolean;
    requiresSecondApprover?: boolean;
    cooldown?: { maxPerHour: number };
  };
  effect: "auto_approve" | "require_review" | "deny";
  auto_publish: boolean;
  enabled?: boolean;
};

export type CrItem = { type: string; path: string; op: "set" | "insert" | "remove"; old: unknown; value: unknown; kind?: string; newAssets?: string[] };
export type Ctx = { partner: string; principal: string; role: string | null; now: Date; autoApprovedLastHour: number; assetsPending: boolean };
export type Outcome = { effect: "auto_approve" | "require_review" | "deny"; autoPublish: boolean; fourEyes: boolean; policy: string | null; reasons: string[] };

const BULK = 50;
const LINKY = /(^|\/)(href|url|link|links)(\/|\[|$)/i;
const hasLink = (it: CrItem) => it.kind === "url" || LINKY.test(it.path) || (typeof it.value === "string" && /\bhttps?:\/\//i.test(it.value));

function inWindow(w: NonNullable<Policy["conditions"]["timeWindow"]>, now: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: w.tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).map((p) => [p.type, p.value]));
  const day = String(parts.weekday).slice(0, 3).toLowerCase();
  const hm = `${parts.hour}:${parts.minute}`;
  if (w.days?.length && !w.days.includes(day)) return false;
  if (w.from && hm < w.from) return false;
  if (w.to && hm >= w.to) return false;
  return true;
}

/** Why a policy's conditions fail (empty = they hold). */
function failed(p: Policy, items: CrItem[], ctx: Ctx): string[] {
  const c = p.conditions;
  const why: string[] = [];
  if (c.maxItems !== undefined && items.length > c.maxItems) why.push(`more than ${c.maxItems} items`);
  if (c.textEditDistanceRatio) {
    for (const it of items) {
      const r = typeof it.old === "string" && typeof it.value === "string" ? editRatio(it.old, it.value) : 1;
      if (r > c.textEditDistanceRatio.lte) why.push(`${it.path}: edit ratio ${r.toFixed(2)} > ${c.textEditDistanceRatio.lte}`);
    }
  }
  if (c.maxLengthDelta !== undefined) {
    for (const it of items) {
      const d = Math.abs(String(it.value ?? "").length - String(it.old ?? "").length);
      if (d > c.maxLengthDelta) why.push(`${it.path}: length changes by ${d}`);
    }
  }
  if (c.noNewAssets && items.some((i) => i.newAssets?.length)) why.push("adds media");
  if (c.assetsOnly && items.some((i) => !i.newAssets?.length)) why.push("not media-only");
  if (c.noLinks && items.some(hasLink)) why.push("changes a link");
  if (c.locales?.length && items.some((i) => !c.locales!.includes(splitLocale(i.path).locale ?? ""))) why.push("touches another language");
  if (c.principalRoles?.length && !c.principalRoles.includes(ctx.role ?? "")) why.push(`role ${ctx.role ?? "none"} not allowed`);
  if (c.principals?.length && !c.principals.includes(ctx.principal)) why.push("author not listed");
  if (c.timeWindow && !inWindow(c.timeWindow, ctx.now)) why.push("outside the time window");
  if (!c.entryCreate && items.some((i) => i.op === "insert")) why.push("adds items");
  if (!c.entryDelete && items.some((i) => i.op === "remove")) why.push("removes items");
  if (c.cooldown && ctx.autoApprovedLastHour >= c.cooldown.maxPerHour) why.push(`cooldown: ${ctx.autoApprovedLastHour} auto-approvals in the last hour`);
  return why;
}

const inScope = (p: Policy, items: CrItem[], ctx: Ctx) =>
  (!p.scope.partners?.length || p.scope.partners.includes(ctx.partner)) &&
  items.every(
    (i) =>
      (!p.scope.types?.length || p.scope.types.some((g) => globMatch(g, i.type))) &&
      (!p.scope.fields?.length || p.scope.fields.some((g) => matchPath(g, i.path))) &&
      (!p.scope.locales?.length || p.scope.locales.includes(splitLocale(i.path).locale ?? "")),
  );

/**
 * Decides a change request. Hard rules first (they cannot be overridden), then enabled policies by
 * priority (highest first); the first policy in scope whose conditions hold decides. Default: review.
 */
export function evaluatePolicies(items: CrItem[], policies: Policy[], ctx: Ctx): Outcome {
  const review = (reasons: string[], policy: string | null = null): Outcome => ({ effect: "require_review", autoPublish: false, fourEyes: false, policy, reasons });
  if (items.length > BULK) return review([`bulk change (${items.length} items > ${BULK})`]);
  if (items.some((i) => i.type.startsWith("global.") && hasLink(i))) return review(["link change on site-wide content"]);
  const reasons: string[] = [];
  for (const p of [...policies].filter((x) => x.enabled !== false).sort((a, b) => b.priority - a.priority)) {
    if (!inScope(p, items, ctx)) continue;
    const why = failed(p, items, ctx);
    if (why.length) {
      reasons.push(`${p.name}: ${why.join("; ")}`);
      continue;
    }
    if (p.effect === "auto_approve" && ctx.assetsPending) return review([`${p.name}: media scan not finished`], p.id);
    if (p.effect === "auto_approve" && p.conditions.requiresSecondApprover) return { ...review([`${p.name}: needs a second approver`], p.id), fourEyes: true };
    return { effect: p.effect, autoPublish: p.effect === "auto_approve" && p.auto_publish, fourEyes: false, policy: p.id, reasons: [`matched ${p.name}`] };
  }
  return review(reasons.length ? reasons : ["no policy matched"]);
}
