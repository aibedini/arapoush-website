import { cache } from "react";
import seed from "@arapoush/schema/generated/seed.json";

/**
 * Site content from OPEX (docs/opex/OPEX-PLAN.md §10.1).
 *
 * - `ensureContent()` (async) loads the published bundle from the OPEX Delivery API. The fetch is
 *   cached by Next under the `opex` tag, so pages stay static until OPEX calls
 *   /api/opex/revalidate.
 * - The loaders (`getDictionary`, `getTubeProduct`, …) stay synchronous and read what
 *   `ensureContent()` loaded.
 * - When OPEX is not configured, the site renders from its own files (the dictionaries and
 *   content/*.json), exactly as before.
 * - When OPEX is configured but unreachable, it uses the last good bundle, then the generated
 *   snapshot (`@arapoush/schema/generated/seed.json`), so a build never fails because OPEX is down.
 */

export type Entries = Record<string, unknown>;
type Bundle = { entries: Record<string, { revision: string; number: number; data: unknown }> };

const baseUrl = () => process.env.OPEX_DELIVERY_URL?.replace(/\/$/, "");
const token = () => process.env.OPEX_DELIVERY_TOKEN;
export const opexEnabled = () => !!(baseUrl() && token());

/** The snapshot the site falls back to: the content OPEX was seeded with. */
export const snapshot = seed as unknown as Entries;

let published: Entries | null = null;
let warned = false;

// Per request: a preview (draft) bundle when the editor opened a preview link.
const requestStore = cache(() => ({ preview: null as Entries | null }));

const unwrap = (b: Bundle): Entries => Object.fromEntries(Object.entries(b.entries).map(([k, v]) => [k, v.data]));

async function fetchBundle(path: string, init: RequestInit & { next?: { tags?: string[]; revalidate?: number } }) {
  const res = await fetch(`${baseUrl()}${path}`, { ...init, headers: { authorization: `Bearer ${token()}`, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`OPEX ${path}: ${res.status}`);
  return unwrap((await res.json()) as Bundle);
}

/** Load published content (and, in draft mode, the editor's preview). Safe to call repeatedly. */
export async function ensureContent(): Promise<void> {
  if (!opexEnabled()) return;
  try {
    // Tagged so a publish webhook refreshes it at once; the hourly revalidate is a safety net (a missed
    // webhook, or a build reusing an old .next/cache).
    published = await fetchBundle("/v1/delivery/bundle", { cache: "force-cache", next: { tags: ["opex"], revalidate: 3600 } });
  } catch (e) {
    if (!warned) console.warn(`[opex] using ${published ? "the last good bundle" : "the snapshot"}: ${(e as Error).message}`);
    warned = true;
    published ??= snapshot;
  }
  const previewToken = await currentPreviewToken();
  if (previewToken) {
    try {
      requestStore().preview = await fetchBundle("/v1/delivery/preview", { cache: "no-store", headers: { "opex-preview": previewToken } });
    } catch (e) {
      console.warn(`[opex] preview unavailable: ${(e as Error).message}`);
    }
  }
}

async function currentPreviewToken(): Promise<string | null> {
  try {
    const { draftMode, cookies } = await import("next/headers");
    if (!(await draftMode()).isEnabled) return null;
    return (await cookies()).get("opex_preview")?.value ?? null;
  } catch {
    return null; // outside a request (build of static params, scripts)
  }
}

/** Published (or previewed) data of one content type; `undefined` when OPEX is off. */
export function entry<T = Record<string, unknown>>(type: string): T | undefined {
  let preview: Entries | null = null;
  try {
    preview = requestStore().preview;
  } catch {}
  const src = preview ?? published;
  return (src?.[type] ?? (src ? snapshot[type] : undefined)) as T | undefined;
}

/** Every published (or previewed) entry whose key starts with `prefix` (forms: `form.`). */
export function entriesWithPrefix<T = Record<string, unknown>>(prefix: string): [string, T][] {
  let preview: Entries | null = null;
  try {
    preview = requestStore().preview;
  } catch {}
  const src = preview ?? published ?? {};
  return Object.entries(src).filter(([k]) => k.startsWith(prefix)) as [string, T][];
}

/** Data for a type: OPEX when on, else the snapshot (used for images and other non-dictionary data). */
export function entryOrSnapshot<T = Record<string, unknown>>(type: string): T {
  return (entry<T>(type) ?? snapshot[type]) as T;
}
