/** Merging OPEX content over the code defaults (client-safe, no server imports). */
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Content wins over code; objects merge key by key, arrays and strings are replaced. */
export function overlay<T>(base: T, over: unknown): T {
  if (over === undefined || over === null) return base;
  if (isObj(base) && isObj(over)) {
    const out: Record<string, unknown> = { ...base };
    for (const [k, v] of Object.entries(over)) if (k in base) out[k] = overlay(base[k], v);
    return out as T;
  }
  if (Array.isArray(base)) return (Array.isArray(over) ? over : base) as T;
  return (typeof over === typeof base ? over : base) as T;
}
