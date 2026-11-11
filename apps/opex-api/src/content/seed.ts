import seed from "@arapoush/schema/generated/seed.json" with { type: "json" };
import { CONTENT_TYPES } from "@arapoush/schema";
import type { Deps } from "../app.ts";
import { audit, SYSTEM_REQUEST } from "../audit/audit.ts";
import { ulid } from "../ids.ts";
import { publish, registerTypes, saveDraft } from "./service.ts";

const MIGRATION = { kind: "system" as const, id: "system:migration", display: "Initial import from the website" };

/**
 * Creates any missing entry from the website's current content (generated seed) as revision 1 and
 * publishes it, so OPEX starts out serving exactly what the site shows. Existing entries are never
 * touched. Safe to run on every start.
 */
export async function seedContent(deps: Deps): Promise<string[]> {
  const { db, config } = deps;
  const tenant = config.TENANT;
  await registerTypes(db);
  const created: string[] = [];
  for (const t of CONTENT_TYPES) {
    const data = (seed as Record<string, unknown>)[t.key];
    if (!data) continue;
    await db.tx(async (q) => {
      const [exists] = await q(`SELECT 1 FROM entries WHERE tenant_id = $1 AND type_key = $2 AND slug = 'main'`, [tenant, t.key]);
      if (exists) return;
      const id = ulid("ent_");
      await q(`INSERT INTO entries (id, tenant_id, type_key, slug) VALUES ($1,$2,$3,'main')`, [id, tenant, t.key]);
      await audit(q, tenant, { action: "content.entry.create", actor: MIGRATION, request: SYSTEM_REQUEST, resource: { type: "entry", id, entry: t.key } });
      await saveDraft(q, tenant, { typeKey: t.key, data, baseRevisionId: null, actor: MIGRATION, request: SYSTEM_REQUEST, note: "Imported from the website" });
      await publish(q, tenant, { typeKey: t.key, actor: MIGRATION, request: SYSTEM_REQUEST, trigger: "seed" });
      created.push(t.key);
    });
  }
  return created;
}
