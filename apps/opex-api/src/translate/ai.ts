import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { LOCALE_INFO, type Locale } from "@arapoush/schema";
import type { Config } from "../config.ts";
import { Problem } from "../http/problem.ts";

/** One string to translate. `max` is the field's length limit, passed to the model as a hint. */
export type Seg = { key: string; text: string; max?: number };
type Log = { warn: (o: object, msg: string) => void };

const Out = z.object({ segments: z.array(z.object({ key: z.string(), text: z.string() })) });

/** Segments per request stay small enough for a complete answer (Persian text costs more tokens). */
const CHUNK_CHARS = 6000;
const CHUNK_SEGMENTS = 120;
/** Requests to the model at once, across targets and chunks. */
const PARALLEL = 3;

export function chunks(segs: Seg[]): Seg[][] {
  const out: Seg[][] = [];
  let cur: Seg[] = [];
  let size = 0;
  for (const s of segs) {
    if (cur.length && (size + s.text.length > CHUNK_CHARS || cur.length >= CHUNK_SEGMENTS)) (out.push(cur), (cur = []), (size = 0));
    cur.push(s);
    size += s.text.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

const SYSTEM =
  "You translate the website and articles of Arapoush, a manufacturer of multi-layer plastic tubes and effervescent tablet tubes (packaging for cosmetics, pharma, hygiene and food). " +
  "Translate each segment faithfully and naturally for customers and search readers in the target language, using the industry's usual terms. Website copy (headings, buttons, labels) stays short and idiomatic, like a native copywriter would write it. " +
  "Keep the inline markup exactly: **bold**, *italic*, [link text](url) - translate the link text, never the url. Keep line breaks, placeholders like {name} or {{count}}, numbers, units, codes and brand names (Arapoush, OPEX). " +
  "When a segment has a `max`, the translation must not be longer than that many characters. " +
  "Return every segment with its key unchanged.";

/** One model call: one chunk into one language. */
async function callModel(client: Anthropic, from: Locale, to: Locale, segs: Seg[], note?: string) {
  const res = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    // A refused request is retried on a fallback model in the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(Out) },
    system: SYSTEM + (note ? `\n\nEditor's instructions for this job: ${note}` : ""),
    messages: [{ role: "user", content: `Translate from ${LOCALE_INFO[from].name} to ${LOCALE_INFO[to].name}.\n\n${JSON.stringify({ segments: segs })}` }],
  });
  if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") throw new Error(res.stop_reason);
  if (!res.parsed_output) throw new Error("empty output");
  return res.parsed_output.segments;
}

/** Runs `jobs` with at most `n` at a time. */
async function pool<T>(jobs: (() => Promise<T>)[], n: number): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, jobs.length) }, async () => {
      while (next < jobs.length) {
        const i = next++;
        out[i] = await jobs[i]!();
      }
    }),
  );
  return out;
}

/** What each target language needs (in mode "missing" the lists differ per language). */
export type TranslateJob = { from: Locale; targets: { to: Locale; segments: Seg[] }[]; note?: string };
/** Per target: key → translated text (only keys that came back non-empty). */
export type TranslateResult = Map<Locale, Map<string, string>>;

async function claude(config: Config, log: Log, job: TranslateJob): Promise<TranslateResult> {
  const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, timeout: 180_000, maxRetries: 2 });
  const tasks = job.targets.flatMap(({ to, segments }) => chunks(segments).map((p) => ({ to, p })));
  try {
    const answers = await pool(
      tasks.map(({ to, p }) => () => callModel(client, job.from, to, p, job.note)),
      PARALLEL,
    );
    const out: TranslateResult = new Map(job.targets.map((t) => [t.to, new Map()]));
    tasks.forEach(({ to, p }, i) => {
      const asked = new Set(p.map((s) => s.key));
      for (const s of answers[i]!) if (asked.has(s.key) && s.text.trim()) out.get(to)!.set(s.key, s.text);
    });
    return out;
  } catch (e) {
    log.warn({ err: e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : (e as Error).message }, "AI translation failed");
    throw new Problem(502, "AI_FAILED", "The translation service did not answer; try again");
  }
}

/** The engine: Claude in production; tests swap `engine.translate` for a fake. */
export const engine = { translate: claude };

export function assertAi(config: Config) {
  if (!config.ANTHROPIC_API_KEY) throw new Problem(503, "AI_OFF", "AI translation is not configured (ANTHROPIC_API_KEY)");
}

export async function translate(config: Config, log: Log, job: TranslateJob): Promise<TranslateResult> {
  const targets = job.targets.filter((t) => t.segments.length);
  if (!targets.length) return new Map(job.targets.map((t) => [t.to, new Map()]));
  assertAi(config);
  const out = await engine.translate(config, log, { ...job, targets });
  for (const t of job.targets) if (!out.has(t.to)) out.set(t.to, new Map());
  return out;
}
