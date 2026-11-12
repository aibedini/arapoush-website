/**
 * Guess which closure, shape and diameter a factory CAD file is for, from its file name
 * ("35 فیلیپ تاپ.STEP", "40 اوال فیلیپ تاپ.STEP", "کپ موشکی.STEP"). The operator checks every guess
 * before uploading; an unknown word leaves the field empty instead of guessing wrong.
 */
type Named = { id: string; name: { fa?: string; en?: string }; aliases?: string[] };
type Cat = { shapes: (Named & { model?: string; sizes: Record<string, unknown> })[]; closures: (Named & { compat?: Record<string, Record<string, string>> })[] };

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** Same spelling for the same word: digits, Arabic letters, spacing, common variants. */
export function normalizeName(s: string) {
  return s
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[۰-۹]/g, (c) => String(FA_DIGITS.indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String(AR_DIGITS.indexOf(c)))
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/‌/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[_\-.()[\],]+/g, " ")
    .replace(/([a-z؀-ۿ])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z؀-ۿ])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

/** Spellings that mean the same thing in factory file names. */
const SYNONYMS: [RegExp, string][] = [
  [/^(فیلیپ|فلیپ|flip|fliptop)$/, "flip"],
  [/^(تاپ|top)$/, "top"],
  [/^(اوال|اووال|بیضی|oval)$/, "oval"],
  [/^(سوپر|super)$/, "super"],
  [/^(موشکی|bullet)$/, "bullet"],
  [/^(لیپ|lip|lipstick|بالم|balm)$/, "lip"],
  [/^(استیک|stick)$/, "lip"],
  [/^(نازل|nozzle)$/, "nozzle"],
  [/^(چشمی|eye)$/, "eye"],
  [/^(پیچی|پیچ|screw)$/, "screw"],
  [/^(پرسی|press)$/, "press"],
  [/^(هشت|octagonal|octagon)$/, "octagon"],
  [/^(کونیکال|مخروطی|conical|cone)$/, "cone"],
  [/^(ایرلس|airless|پمپ|pump)$/, "airless"],
  [/^(ایستاده|stand|standup)$/, "stand"],
];
const NOISE = new Set(["درب", "در", "کپ", "cap", "step", "stp", "glb", "جدید", "new", "copy", "تیوب", "tube", "و"]);
const tokens = (s: string) =>
  normalizeName(s)
    .split(" ")
    .filter((t) => t && !NOISE.has(t) && !/^\d+$/.test(t))
    .map((t) => SYNONYMS.find(([re]) => re.test(t))?.[1] ?? t);

export type Guess = { closure: string; shape: string; diameter: number | null; reason: string };

export function guessTarget(fileName: string, cat: Cat): Guess {
  const norm = normalizeName(fileName);
  const words = tokens(fileName);
  const oval = words.includes("oval");
  const numbers = (norm.match(/\d+/g) ?? []).map(Number).filter((n) => n >= 10 && n <= 80);
  const shape = cat.shapes.find((s) => (oval ? s.model === "oval" || s.id.includes("oval") : s.model === "circular")) ?? cat.shapes[0];
  const d = numbers.find((n) => shape?.sizes[String(n)]) ?? null;

  const score = (x: Cat["closures"][number]) => {
    const own = new Set([...tokens(x.id), ...tokens(x.name.fa ?? ""), ...tokens(x.name.en ?? ""), ...(x.aliases ?? []).flatMap(tokens)]);
    let s = 0;
    for (const w of words) if (own.has(w)) s += 2;
    // Words the closure has but the file doesn't count a little against it (oval vs round, press…).
    for (const w of own) if (!words.includes(w) && ["oval", "press", "super", "eye", "flip", "bullet", "lip", "nozzle"].includes(w)) s -= 1;
    if (shape && x.compat?.[shape.id]) s += 0.5;
    if (shape && d != null && x.compat?.[shape.id]?.[String(d)]) s += 0.5;
    return s;
  };
  const ranked = cat.closures.map((x) => ({ x, s: score(x) })).sort((a, b) => b.s - a.s);
  const best = ranked[0] && ranked[0].s >= 2 && ranked[0].s > (ranked[1]?.s ?? -Infinity) ? ranked[0].x : undefined;
  const reason = [best ? `«${words.join(" ")}»` : "", d != null ? `Ø${d}` : ""].filter(Boolean).join(" · ");
  return { closure: best?.id ?? "", shape: d != null && shape ? shape.id : "", diameter: d, reason };
}
