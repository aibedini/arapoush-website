import { isImage, LOCALES, type Field, type GroupField } from "./fields.ts";
import { sanitizeText, sanitizeUrl, TextRejected } from "./sanitize.ts";

export type Issue = { path: string; code: string; message: string };

/**
 * Validates `value` against `field` and returns a sanitised copy plus any issues. Unknown keys are
 * rejected (strict), so a partner can never smuggle fields the schema doesn't know.
 */
export function validate(field: Field, value: unknown, path = ""): { value: unknown; issues: Issue[] } {
  const issues: Issue[] = [];
  const out = walk(field, value, path || "/", issues);
  return { value: out, issues };
}

const err = (issues: Issue[], path: string, code: string, message: string) => void issues.push({ path, code, message });

function text(f: Extract<Field, { kind: "text" }>, v: unknown, path: string, issues: Issue[]) {
  if (typeof v !== "string") return err(issues, path, "TYPE", "Expected text"), v;
  try {
    const s = sanitizeText(v, { persian: f.persianNormalize ?? path.endsWith("@fa"), multiline: f.multiline });
    if (f.max && s.length > f.max) err(issues, path, "TOO_LONG", `At most ${f.max} characters`);
    return s;
  } catch (e) {
    if (e instanceof TextRejected) return err(issues, path, e.code, e.message), v;
    throw e;
  }
}

function image(v: unknown, path: string, issues: Issue[]) {
  if (!isImage(v)) return err(issues, path, "TYPE", "Expected an image { src, width, height }"), v;
  const allowed = new Set(["src", "width", "height", "alt"]);
  for (const k of Object.keys(v)) if (!allowed.has(k)) err(issues, `${path}/${k}`, "UNKNOWN_FIELD", "Unknown field");
  const out: Record<string, unknown> = { src: v.src };
  if (v.width !== undefined) out.width = v.width;
  if (v.height !== undefined) out.height = v.height;
  if (v.alt !== undefined) out.alt = walk({ kind: "text", localized: true, max: 300 }, v.alt, `${path}/alt`, issues);
  return out;
}

function walk(field: Field, v: unknown, path: string, issues: Issue[]): unknown {
  if (v === undefined || v === null) {
    if (field.required) err(issues, path, "REQUIRED", "Required");
    return v;
  }
  switch (field.kind) {
    case "text":
      if (!field.localized) return text(field, v, path, issues);
      if (typeof v !== "object" || Array.isArray(v)) return err(issues, path, "TYPE", "Expected { fa, en, tr }"), v;
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([l, s]) => {
          if (!(LOCALES as readonly string[]).includes(l)) err(issues, `${path}@${l}`, "UNKNOWN_LOCALE", "Unknown locale");
          return [l, text(field, s, `${path}@${l}`, issues)];
        }),
      );
    case "number":
      if (typeof v !== "number" || !Number.isFinite(v)) return err(issues, path, "TYPE", "Expected a number"), v;
      if (field.integer && !Number.isInteger(v)) err(issues, path, "INTEGER", "Expected a whole number");
      if (field.min !== undefined && v < field.min) err(issues, path, "MIN", `At least ${field.min}`);
      if (field.max !== undefined && v > field.max) err(issues, path, "MAX", `At most ${field.max}`);
      return v;
    case "boolean":
      if (typeof v !== "boolean") err(issues, path, "TYPE", "Expected true/false");
      return v;
    case "enum":
      if (typeof v !== "string" || !field.values.includes(v)) err(issues, path, "ENUM", `One of: ${field.values.join(", ")}`);
      return v;
    case "url": {
      const one = (s: unknown, p: string) => {
        if (typeof s !== "string") return err(issues, p, "TYPE", "Expected a URL"), s;
        try {
          return sanitizeUrl(s, { internal: field.internal });
        } catch (e) {
          return err(issues, p, "URL", (e as Error).message), s;
        }
      };
      if (field.localized && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([l, s]) => [l, one(s, `${path}@${l}`)]));
      return one(v, path);
    }
    case "image":
      if (field.path) {
        if (typeof v !== "string" || !/^\/(images|media)\/[\w\-./]+$/.test(v) || v.includes("..")) err(issues, path, "IMAGE_PATH", "Expected an /images/ or /media/ path");
        return v;
      }
      if (field.perLocale) {
        if (typeof v !== "object" || Array.isArray(v)) return err(issues, path, "TYPE", "Expected { default, fa?, en?, tr? }"), v;
        const out: Record<string, unknown> = {};
        for (const [k, img] of Object.entries(v as Record<string, unknown>)) {
          if (k !== "default" && !(LOCALES as readonly string[]).includes(k)) err(issues, `${path}/${k}`, "UNKNOWN_FIELD", "Unknown locale");
          out[k] = image(img, `${path}/${k}`, issues);
        }
        if (!out.default) err(issues, `${path}/default`, "REQUIRED", "A default image is required");
        return out;
      }
      return image(v, path, issues);
    case "file":
      if (typeof v === "string") return /^\/(files|media)\//.test(v) ? v : (err(issues, path, "FILE", "Expected a /files/ or /media/ path"), v);
      if (typeof v !== "object" || typeof (v as { src?: unknown }).src !== "string") return err(issues, path, "TYPE", "Expected a file"), v;
      return v;
    case "list": {
      if (!Array.isArray(v)) return err(issues, path, "TYPE", "Expected a list"), v;
      if (field.min !== undefined && v.length < field.min) err(issues, path, "MIN_ITEMS", `At least ${field.min} items`);
      if (field.max !== undefined && v.length > field.max) err(issues, path, "MAX_ITEMS", `At most ${field.max} items`);
      if (field.key) {
        const ids = v.map((x) => (x as Record<string, unknown>)?.[field.key!]);
        if (new Set(ids).size !== ids.length) err(issues, path, "DUPLICATE_ID", `Items need unique "${field.key}"`);
      }
      return v.map((item, i) => {
        const id = field.key ? (item as Record<string, unknown>)?.[field.key] : undefined;
        return walk(field.of, item, id !== undefined ? `${path}[${field.key}=${id}]` : `${path}[${i}]`, issues);
      });
    }
    case "group": {
      if (typeof v !== "object" || Array.isArray(v)) return err(issues, path, "TYPE", "Expected an object"), v;
      const out: Record<string, unknown> = {};
      const join = (k: string) => (path === "/" ? `/${k}` : `${path}/${k}`);
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        const f = field.fields[k];
        if (!f) {
          err(issues, join(k), "UNKNOWN_FIELD", "Unknown field");
          continue;
        }
        out[k] = walk(f, val, join(k), issues);
      }
      for (const [k, f] of Object.entries(field.fields)) if (f.required && out[k] === undefined) err(issues, join(k), "REQUIRED", "Required");
      return out;
    }
  }
}

/** Finds the field definition that governs `path` (selectors and locale ignored). */
export function fieldAt(schema: GroupField, path: string): Field | undefined {
  let f: Field | undefined = schema;
  for (const raw of path.replace(/@.*$/, "").split("/").filter(Boolean)) {
    const key = raw.replace(/\[[^\]]*\]/g, "");
    if (!f) return undefined;
    if (key) {
      while (f && f.kind === "list") f = f.of;
      if (!f || f.kind !== "group") return undefined;
      f = f.fields[key];
    }
    if (/\[[^\]]*\]/.test(raw)) while (f && f.kind === "list") f = f.of;
  }
  return f;
}

/** True when the field, or any group/list above it, is locked. */
export function isLockedPath(schema: GroupField, path: string): boolean {
  let f: Field | undefined = schema;
  if (f.locked) return true;
  for (const raw of path.replace(/@.*$/, "").split("/").filter(Boolean)) {
    const key = raw.replace(/\[[^\]]*\]/g, "");
    if (key) {
      while (f && f.kind === "list") {
        if (f.locked) return true;
        f = f.of;
      }
      if (!f || f.kind !== "group") return false;
      f = f.fields[key];
      if (f?.locked) return true;
    }
  }
  return false;
}

/** Same as isLockedPath for operator-only. */
export function isOperatorOnlyPath(schema: GroupField, path: string): boolean {
  let f: Field | undefined = schema;
  for (const raw of path.replace(/@.*$/, "").split("/").filter(Boolean)) {
    const key = raw.replace(/\[[^\]]*\]/g, "");
    if (key) {
      while (f && f.kind === "list") {
        if (f.operatorOnly) return true;
        f = f.of;
      }
      if (!f || f.kind !== "group") return false;
      f = f.fields[key];
      if (f?.operatorOnly) return true;
    }
  }
  return false;
}
