import { LOCALES, globMatch, isLocalizedText, isLockedPath, isOperatorOnlyPath, leafPaths, matchPath, subtreeHas, type Field, type GroupField } from "@arapoush/schema";
import type { Q } from "../db/index.ts";
import type { Principal } from "../auth/principal.ts";

/** Plan §4.3. What a partner principal may do; deny by default. */
export const GRANT_ACTIONS = ["read", "propose", "media.upload", "cr.withdraw", "cr.read_all", "entry.create", "entry.delete"] as const;
export type GrantAction = (typeof GRANT_ACTIONS)[number];

export type GrantScope = { types: string[]; fields?: string[]; exclude?: string[]; locales?: string[] };
export type Grant = { id: string; subject_kind: "partner_role" | "partner_user" | "partner_client"; subject_id: string; scope: GrantScope; actions: string[]; expires_at: Date | string | null };

export type Target = { type: string; path: string; locale?: string | null; action: GrantAction };
export type Decision = { allow: boolean; grant?: string; reason: string };

/** Splits "/a/b@fa" into path and locale. */
export const splitLocale = (p: string) => {
  const m = /^(.*)@([a-z]{2})$/.exec(p);
  return m ? { path: m[1]!, locale: m[2]! } : { path: p, locale: null };
};

/**
 * Pure grant evaluation (unit-tested with a decision table). Locked and operator-only fields are
 * never grantable, whatever the grants say; `exclude` beats `fields`; expired grants are ignored.
 */
export function evaluate(grants: Grant[], schema: GroupField | null, t: Target, now = Date.now()): Decision {
  // A proposal replaces everything under its path, so it is checked against every field below it
  // (S2: a partner proposing at "/" or a whole list item must not rewrite locked or operator-only fields).
  const writes = t.action === "propose";
  if (schema && t.path !== "" && t.path !== "/" && isLockedPath(schema, t.path)) return { allow: false, reason: "locked" };
  if (schema && t.path !== "" && t.path !== "/" && isOperatorOnlyPath(schema, t.path)) return { allow: false, reason: "operator_only" };
  if (schema && writes && subtreeHas(schema, t.path || "/", "locked")) return { allow: false, reason: "locked" };
  if (schema && writes && subtreeHas(schema, t.path || "/", "operatorOnly")) return { allow: false, reason: "operator_only" };
  const leaves = schema && writes ? leafPaths(schema, t.path || "/") : null;
  for (const g of grants) {
    if (g.expires_at && new Date(g.expires_at).getTime() <= now) continue;
    if (!g.actions.includes(t.action)) continue;
    if (!g.scope.types.some((p) => globMatch(p, t.type))) continue;
    const path = t.path || "/";
    const fields = g.scope.fields?.length ? g.scope.fields : ["/**"];
    if (path !== "/" && !fields.some((p) => matchPath(p, path))) continue;
    if (path !== "/" && (g.scope.exclude ?? []).some((p) => matchPath(p, path))) continue;
    // Writes at a group: every field below must be inside the grant and none excluded.
    if (leaves && !leaves.every((l) => fields.some((p) => matchPath(p, l)) && !(g.scope.exclude ?? []).some((p) => matchPath(p, l)))) continue;
    if (t.locale && g.scope.locales?.length && !g.scope.locales.includes(t.locale)) continue;
    return { allow: true, grant: g.id, reason: "granted" };
  }
  return { allow: false, reason: "no_grant" };
}

/** Grants that apply to a partner principal: its user grants, its role's grants and its client's. */
export async function grantsFor(q: Q, tenant: string, p: Principal): Promise<Grant[]> {
  return q<Grant>(
    `SELECT id, subject_kind, subject_id, scope, actions, expires_at FROM grants
      WHERE tenant_id = $1 AND (expires_at IS NULL OR expires_at > clock_timestamp())
        AND ((subject_kind = 'partner_user' AND subject_id = $2)
          OR (subject_kind = 'partner_role' AND subject_id = $3)
          OR (subject_kind = 'partner_client' AND subject_id = $4))
      ORDER BY created_at`,
    [tenant, p.id, p.role ?? "", p.partnerClientId ?? ""],
  );
}

/**
 * Read projection: keeps only what the caller may read. Fields outside the grant are omitted (not
 * nulled); localized text keeps only granted locales. Returns undefined when nothing is visible.
 */
export function project(schema: GroupField, data: unknown, can: (path: string, locale?: string) => boolean): unknown {
  const walk = (f: Field, v: unknown, path: string): unknown => {
    if (v === undefined) return undefined;
    if (f.kind === "group") {
      const o = (v ?? {}) as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, c] of Object.entries(f.fields)) {
        const x = walk(c, o[k], `${path}/${k}`);
        if (x !== undefined) out[k] = x;
      }
      return Object.keys(out).length ? out : undefined;
    }
    if (f.kind === "list") {
      if (!Array.isArray(v)) return undefined;
      const items = v.map((it, i) => {
        const key = f.key && it && typeof it === "object" ? (it as Record<string, unknown>)[f.key] : undefined;
        const x = walk(f.of, it, `${path}[${key !== undefined ? `${f.key}=${key}` : i}]`);
        // Keyed items keep their key so AraCMS can address them.
        return x !== undefined && f.key && key !== undefined && typeof x === "object" ? { [f.key]: key, ...(x as object) } : x;
      });
      return items.some((x) => x !== undefined) ? items.map((x) => x ?? null) : undefined;
    }
    if (f.kind === "text" && f.localized && isLocalizedText(v)) {
      const out = Object.fromEntries(LOCALES.filter((l) => v[l] !== undefined && can(path, l)).map((l) => [l, v[l]]));
      return Object.keys(out).length ? out : undefined;
    }
    return can(path) ? v : undefined;
  };
  return walk(schema, data, "") ?? {};
}

/** The schema as the caller may see it: fields without any read grant are dropped. */
export function projectSchema(schema: GroupField, can: (path: string) => boolean): GroupField | null {
  const walk = (f: Field, path: string): Field | null => {
    if (f.kind === "group") {
      const fields = Object.fromEntries(
        Object.entries(f.fields)
          .map(([k, c]) => [k, walk(c, `${path}/${k}`)] as const)
          .filter(([, c]) => c !== null),
      ) as Record<string, Field>;
      return Object.keys(fields).length ? { ...f, fields } : null;
    }
    if (f.kind === "list") {
      const of = walk(f.of, `${path}[0]`);
      return of ? { ...f, of } : null;
    }
    return can(path) ? f : null;
  };
  return walk(schema, "") as GroupField | null;
}
