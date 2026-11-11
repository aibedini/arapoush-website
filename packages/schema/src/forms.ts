/**
 * Form definitions (P11) and the one submission validator used by the website (in the browser), the
 * site's API route and OPEX. Dependency-free on purpose: it runs in all three.
 */
export const FORM_LOCALES = ["fa", "en", "tr"] as const;
export type FormLocale = (typeof FORM_LOCALES)[number];
export type L = Partial<Record<FormLocale, string>>;

export const FIELD_TYPES = ["text", "textarea", "email", "phone", "number", "select", "radio", "checkbox", "checkboxes", "date", "file", "consent", "heading", "paragraph", "hidden"] as const;
export type FormFieldType = (typeof FIELD_TYPES)[number];
/** Layout-only fields: shown, never submitted. */
export const DISPLAY_TYPES = new Set<FormFieldType>(["heading", "paragraph"]);
export const FILE_KINDS = ["pdf", "jpeg", "png", "webp"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export type ShowIf = { field: string; op: "eq" | "neq" | "in" | "filled" | "empty"; value?: string | string[] };
export type FieldRole = "name" | "email" | "phone" | "company" | "message";

export type FormField = {
  id: string;
  type: FormFieldType;
  label: L;
  help?: L;
  placeholder?: L;
  required?: boolean;
  width?: "full" | "half";
  options?: { value: string; label: L }[];
  /** text/textarea: length; number: value; checkboxes: picked count; file: count. */
  min?: number;
  max?: number;
  pattern?: string;
  showIf?: ShowIf;
  /** Marks who the requester is (name, email, …): used for threading, replies and the ticket header. */
  role?: FieldRole;
  accept?: FileKind[];
  /** hidden: a fixed value, or one the site fills in (`{page}`, `{utm_source}`, …). */
  defaultValue?: string;
};

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];
export type RuleOp = "eq" | "neq" | "contains" | "in" | "gte" | "lte" | "filled";
export type RoutingRule = { when: { field: string; op: RuleOp; value?: string | string[] }; set: { team?: string; priority?: Priority; assignee?: string; tags?: string[] } };

export type FormSettings = {
  /** Team key that receives new tickets (null: unrouted, visible to every operator). */
  team: string | null;
  priority: Priority;
  tags: string[];
  rules: RoutingRule[];
  /** Extra addresses emailed on each submission. */
  notify: string[];
  /** Email to the person who submitted (needs a field with role "email"). */
  confirmation: { enabled: boolean; subject: L; body: L };
  /** A standalone page at /{locale}/forms/{slug}. */
  page: { enabled: boolean; indexable: boolean; title: L; description: L };
  /** Ticket subject: text with {field_id} placeholders; empty uses the form title. */
  subject: string;
  retentionDays: number;
  perIpLimit: number;
};

export type FormDefinition = { title: L; intro: L; submitLabel: L; success: L; fields: FormField[]; settings: FormSettings };

export const DEFAULT_SETTINGS: FormSettings = {
  team: null,
  priority: "normal",
  tags: [],
  rules: [],
  notify: [],
  confirmation: { enabled: false, subject: {}, body: {} },
  page: { enabled: false, indexable: false, title: {}, description: {} },
  subject: "",
  retentionDays: 730,
  perIpLimit: 5,
};

export const pickL = (l: L | undefined, locale: string): string => (l?.[locale as FormLocale] || l?.fa || l?.en || l?.tr || "").trim();

export type FormValue = string | string[] | boolean | number;
export type FieldError = "required" | "invalid_email" | "invalid_phone" | "invalid_number" | "invalid_date" | "too_short" | "too_long" | "too_small" | "too_large" | "pattern" | "invalid_option" | "unknown_field" | "too_many_files" | "bad_file";

// Visitor text: NFC, no bidi overrides, no control characters except newline and tab.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const BIDI = /[‪-‮⁦-⁩]/g;
export const cleanText = (s: string) => s.normalize("NFC").replace(BIDI, "").replace(CONTROL, "").trim();
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;
const PHONE = /^[+(]?[\d\s()\-.]{5,24}$/;
// Persian and Arabic digits are accepted and stored as ASCII.
export const asciiDigits = (s: string) => s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

const isEmpty = (v: unknown) => v === undefined || v === null || v === "" || v === false || (Array.isArray(v) && v.length === 0);

/** Is the field shown, given the other answers? (A field hidden by its condition is never required or kept.) */
export function isVisible(f: FormField, values: Record<string, unknown>): boolean {
  const c = f.showIf;
  if (!c) return true;
  const v = values[c.field];
  const list = Array.isArray(v) ? v.map(String) : isEmpty(v) ? [] : [String(v)];
  switch (c.op) {
    case "filled":
      return list.length > 0;
    case "empty":
      return list.length === 0;
    case "eq":
      return list.includes(String(c.value ?? ""));
    case "neq":
      return !list.includes(String(c.value ?? ""));
    case "in":
      return (Array.isArray(c.value) ? c.value : [c.value ?? ""]).some((x) => list.includes(String(x)));
  }
}

const maxLen = (f: FormField) => f.max ?? (f.type === "textarea" ? 5000 : 300);

/**
 * Checks a submission against a definition. Returns the cleaned values (only visible, submittable
 * fields) and an error per field. Unknown keys are errors: nothing the form doesn't ask for is kept.
 * `files` gives the number of uploaded files per file field (the files themselves are checked by OPEX).
 */
export function validateSubmission(def: Pick<FormDefinition, "fields">, input: Record<string, unknown>, files: Record<string, number> = {}): { values: Record<string, FormValue>; errors: Record<string, FieldError> } {
  const values: Record<string, FormValue> = {};
  const errors: Record<string, FieldError> = {};
  const byId = new Map(def.fields.map((f) => [f.id, f]));
  for (const k of Object.keys(input)) if (!byId.has(k) || DISPLAY_TYPES.has(byId.get(k)!.type) || byId.get(k)!.type === "file") errors[k] = "unknown_field";
  for (const k of Object.keys(files)) if (byId.get(k)?.type !== "file") errors[k] = "unknown_field";

  for (const f of def.fields) {
    if (DISPLAY_TYPES.has(f.type) || !isVisible(f, { ...input, ...values })) continue;
    if (f.type === "file") {
      const n = files[f.id] ?? 0;
      if (!n) {
        if (f.required) errors[f.id] = "required";
      } else if (n > (f.max ?? 1)) errors[f.id] = "too_many_files";
      continue;
    }
    const raw = input[f.id];
    if (isEmpty(raw)) {
      if (f.required || (f.type === "consent" && f.required !== false)) errors[f.id] = "required";
      continue;
    }
    switch (f.type) {
      case "checkbox":
      case "consent":
        if (raw !== true && raw !== "true" && raw !== "on") errors[f.id] = "invalid_option";
        else values[f.id] = true;
        break;
      case "checkboxes": {
        const list = (Array.isArray(raw) ? raw : [raw]).map(String);
        const allowed = new Set((f.options ?? []).map((o) => o.value));
        if (list.some((x) => !allowed.has(x)) || new Set(list).size !== list.length) errors[f.id] = "invalid_option";
        else if (f.min !== undefined && list.length < f.min) errors[f.id] = "too_small";
        else if (f.max !== undefined && list.length > f.max) errors[f.id] = "too_large";
        else values[f.id] = list;
        break;
      }
      case "select":
      case "radio":
        if (typeof raw !== "string" || !(f.options ?? []).some((o) => o.value === raw)) errors[f.id] = "invalid_option";
        else values[f.id] = raw;
        break;
      case "number": {
        const n = typeof raw === "number" ? raw : Number(asciiDigits(String(raw)).replace(/[,\s٬]/g, ""));
        if (!Number.isFinite(n)) errors[f.id] = "invalid_number";
        else if (f.min !== undefined && n < f.min) errors[f.id] = "too_small";
        else if (f.max !== undefined && n > f.max) errors[f.id] = "too_large";
        else values[f.id] = n;
        break;
      }
      default: {
        if (typeof raw !== "string") {
          errors[f.id] = "invalid_option";
          break;
        }
        let s = cleanText(raw);
        if (f.type === "phone" || f.type === "date") s = asciiDigits(s);
        if (!s) {
          if (f.required) errors[f.id] = "required";
          break;
        }
        if (s.length > maxLen(f)) errors[f.id] = "too_long";
        else if (f.min !== undefined && s.length < f.min) errors[f.id] = "too_short";
        else if (f.type === "email" && (s.length > 200 || !EMAIL.test(s))) errors[f.id] = "invalid_email";
        else if (f.type === "phone" && !PHONE.test(s)) errors[f.id] = "invalid_phone";
        else if (f.type === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s)))) errors[f.id] = "invalid_date";
        else if (f.pattern && !safePattern(f.pattern)?.test(s)) errors[f.id] = "pattern";
        else values[f.id] = f.type === "email" ? s.toLowerCase() : s;
      }
    }
  }
  return { values, errors };
}

/** Operator-written patterns: short, compiled once, anchored. Invalid ones never match. */
const patterns = new Map<string, RegExp | null>();
function safePattern(p: string): RegExp | null {
  if (!patterns.has(p)) {
    let re: RegExp | null = null;
    try {
      re = p.length <= 200 ? new RegExp(`^(?:${p})$`, "u") : null;
    } catch {
      re = null;
    }
    patterns.set(p, re);
  }
  return patterns.get(p)!;
}

/** Structural problems in a definition (shown in the builder, enforced by OPEX on publish). */
export function definitionIssues(def: FormDefinition): { path: string; message: string }[] {
  const out: { path: string; message: string }[] = [];
  const seen = new Set<string>();
  const roles = new Set<string>();
  def.fields.forEach((f, i) => {
    const at = `fields.${i}`;
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(f.id)) out.push({ path: `${at}.id`, message: "Field id: lowercase letters, digits and _ (start with a letter)" });
    if (seen.has(f.id)) out.push({ path: `${at}.id`, message: `Duplicate field id "${f.id}"` });
    seen.add(f.id);
    if (!DISPLAY_TYPES.has(f.type) && f.type !== "hidden" && !pickL(f.label, "fa")) out.push({ path: `${at}.label`, message: "A label is required" });
    if (["select", "radio", "checkboxes"].includes(f.type)) {
      if (!f.options?.length) out.push({ path: `${at}.options`, message: "Add at least one option" });
      const vals = new Set<string>();
      f.options?.forEach((o, j) => {
        if (!o.value || vals.has(o.value)) out.push({ path: `${at}.options.${j}.value`, message: "Option values must be unique and not empty" });
        vals.add(o.value);
      });
    }
    if (f.showIf && !def.fields.slice(0, i).some((x) => x.id === f.showIf!.field)) out.push({ path: `${at}.showIf`, message: "A condition can only refer to a field above it" });
    if (f.pattern && !safePattern(f.pattern)) out.push({ path: `${at}.pattern`, message: "Invalid pattern" });
    if (f.role) {
      if (roles.has(f.role)) out.push({ path: `${at}.role`, message: `Only one field can be the requester's ${f.role}` });
      roles.add(f.role);
      if (f.role === "email" && f.type !== "email") out.push({ path: `${at}.role`, message: "The requester's email must be an email field" });
    }
  });
  if (def.settings.confirmation.enabled && !roles.has("email")) out.push({ path: "settings.confirmation", message: "A confirmation email needs a field marked as the requester's email" });
  def.settings.rules.forEach((r, i) => {
    if (!seen.has(r.when.field)) out.push({ path: `settings.rules.${i}`, message: `Rule refers to an unknown field "${r.when.field}"` });
  });
  if (!pickL(def.title, "fa")) out.push({ path: "title", message: "A title is required" });
  return out;
}

/** Routing: the form's defaults, then every matching rule in order (later rules win). */
export function route(def: Pick<FormDefinition, "settings">, values: Record<string, FormValue>) {
  const out = { team: def.settings.team, priority: def.settings.priority, assignee: null as string | null, tags: [...def.settings.tags] };
  for (const r of def.settings.rules) {
    const v = values[r.when.field];
    const list = Array.isArray(v) ? v.map(String) : v === undefined ? [] : [String(v)];
    const want = Array.isArray(r.when.value) ? r.when.value.map(String) : [String(r.when.value ?? "")];
    const num = Number(v);
    const hit =
      r.when.op === "eq" ? list.includes(want[0]!) :
      r.when.op === "neq" ? !list.includes(want[0]!) :
      r.when.op === "in" ? want.some((w) => list.includes(w)) :
      r.when.op === "contains" ? list.some((x) => x.toLowerCase().includes(want[0]!.toLowerCase())) :
      r.when.op === "gte" ? Number.isFinite(num) && num >= Number(want[0]) :
      r.when.op === "lte" ? Number.isFinite(num) && num <= Number(want[0]) :
      list.length > 0;
    if (!hit) continue;
    if (r.set.team !== undefined) out.team = r.set.team;
    if (r.set.priority) out.priority = r.set.priority;
    if (r.set.assignee) out.assignee = r.set.assignee;
    if (r.set.tags) out.tags.push(...r.set.tags);
  }
  out.tags = [...new Set(out.tags)];
  return out;
}

/** Fills {field_id} placeholders with answers (arrays joined, booleans as ✓). */
export function fillTemplate(tpl: string, values: Record<string, FormValue>, extra: Record<string, string> = {}) {
  return tpl.replace(/\{([a-z][a-z0-9_]*)\}/g, (_, k: string) => {
    const v = k in extra ? extra[k] : values[k];
    return v === undefined ? "" : Array.isArray(v) ? v.join("، ") : v === true ? "✓" : String(v);
  });
}
