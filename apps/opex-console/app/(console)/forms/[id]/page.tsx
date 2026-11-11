"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  At,
  CalendarBlank,
  CaretDown,
  CheckSquare,
  Copy,
  DotsSixVertical,
  EyeSlash,
  Hash,
  ListBullets,
  ListChecks,
  Paperclip,
  Paragraph,
  Phone,
  RadioButton,
  SealCheck,
  TextAlignRight,
  TextH,
  TextT,
  Trash,
  type Icon,
} from "@phosphor-icons/react";
import { DEFAULT_SETTINGS, definitionIssues, isVisible, validateSubmission, type FormDefinition, type FormField, type FormFieldType, type L } from "@arapoush/schema";
import { api } from "@/lib/api";
import { canWrite, useAction, useApi, useMe } from "@/lib/hooks";
import { ago, LOCALE_LABEL, num, PRIORITY, when } from "@/lib/fa";
import { pickL } from "@/lib/tickets";
import { ErrorNote, Loading, PageHead } from "@/components/ui";

type View = {
  form: { id: string; slug: string; status: string; system: boolean; version: number; updated_at: string };
  draft: FormDefinition;
  published: FormDefinition | null;
  issues: { path: string; message: string }[];
  versions: { version: number; published_at: string; by: string | null }[];
  teams: { id: string; key: string; name: string }[];
};

const PALETTE: { type: FormFieldType; label: string; icon: Icon }[] = [
  { type: "text", label: "متن کوتاه", icon: TextT },
  { type: "textarea", label: "متن بلند", icon: TextAlignRight },
  { type: "email", label: "ایمیل", icon: At },
  { type: "phone", label: "تلفن", icon: Phone },
  { type: "number", label: "عدد", icon: Hash },
  { type: "select", label: "فهرست کشویی", icon: CaretDown },
  { type: "radio", label: "یک گزینه", icon: RadioButton },
  { type: "checkboxes", label: "چند گزینه", icon: ListChecks },
  { type: "checkbox", label: "تیک", icon: CheckSquare },
  { type: "date", label: "تاریخ", icon: CalendarBlank },
  { type: "file", label: "فایل", icon: Paperclip },
  { type: "consent", label: "رضایت", icon: SealCheck },
  { type: "heading", label: "عنوان بخش", icon: TextH },
  { type: "paragraph", label: "توضیح", icon: Paragraph },
  { type: "hidden", label: "پنهان", icon: EyeSlash },
];
const TYPE_LABEL = Object.fromEntries(PALETTE.map((p) => [p.type, p.label])) as Record<FormFieldType, string>;
const TYPE_ICON = Object.fromEntries(PALETTE.map((p) => [p.type, p.icon])) as Record<FormFieldType, Icon>;
const HAS_OPTIONS = new Set<FormFieldType>(["select", "radio", "checkboxes"]);
const LOCALES = ["fa", "en", "tr"] as const;
/** Key-order-independent JSON (Postgres jsonb reorders keys), for the unsaved-changes check. */
const stable = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(stable).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v);

const newField = (type: FormFieldType, taken: Set<string>): FormField => {
  let i = 1;
  while (taken.has(`${type}_${i}`)) i++;
  const label = { fa: TYPE_LABEL[type] };
  const base: FormField = { id: `${type}_${i}`, type, label, width: "full" };
  if (HAS_OPTIONS.has(type)) base.options = [{ value: "a", label: { fa: "گزینهٔ ۱" } }, { value: "b", label: { fa: "گزینهٔ ۲" } }];
  if (type === "file") Object.assign(base, { accept: ["pdf", "jpeg", "png"], max: 1 });
  if (type === "consent") Object.assign(base, { required: true, label: { fa: "با شرایط حریم خصوصی موافقم" } });
  return base;
};

/** Localized text in three tabs-in-a-row (fa is required, others fall back to it). */
function LInput({ label, value, onChange, multiline, disabled }: { label: string; value: L | undefined; onChange: (v: L) => void; multiline?: boolean; disabled?: boolean }) {
  const [loc, setLoc] = useState<(typeof LOCALES)[number]>("fa");
  const v = value ?? {};
  const Tag = multiline ? "textarea" : "input";
  return (
    <div className="f l-input">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="small muted">{label}</span>
        <span className="loc-tabs" role="tablist" aria-label={`زبان ${label}`}>
          {LOCALES.map((l) => (
            <button key={l} type="button" role="tab" aria-selected={loc === l} onClick={() => setLoc(l)} data-empty={!v[l]}>
              {l.toUpperCase()}
            </button>
          ))}
        </span>
      </div>
      <Tag aria-label={`${label} (${LOCALE_LABEL[loc]})`} dir={loc === "fa" ? "rtl" : "ltr"} disabled={disabled} value={v[loc] ?? ""} placeholder={loc !== "fa" ? v.fa : undefined} onChange={(e) => onChange({ ...v, [loc]: e.target.value })} rows={multiline ? 3 : undefined} />
    </div>
  );
}

/**
 * Form builder: palette, canvas (drag or move buttons) and the selected field's settings; then form
 * settings (routing, emails, page) and a live preview in all three languages.
 */
export default function FormBuilder() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const v = useApi<View>(`/v1/manage/forms/${id}`);
  const [def, setDef] = useState<FormDefinition | null>(null);
  const [base, setBase] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const [tab, setTab] = useState<"fields" | "settings" | "preview">("fields");
  const [drag, setDrag] = useState<number | null>(null);
  const act = useAction();
  const edit = canWrite(me);

  useEffect(() => {
    if (v.data) {
      setDef({ ...v.data.draft, settings: { ...DEFAULT_SETTINGS, ...v.data.draft.settings } });
      setBase(v.data.form.updated_at);
    }
  }, [v.data]);
  const dirty = useMemo(() => !!def && !!v.data && stable(def) !== stable({ ...v.data.draft, settings: { ...DEFAULT_SETTINGS, ...v.data.draft.settings } }), [def, v.data]);
  const issues = useMemo(() => (def ? definitionIssues(def) : []), [def]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  if (!v.data || !def) return v.error ? <ErrorNote error={v.error} /> : <Loading />;
  const f = v.data.form;
  const fields = def.fields;
  const setFields = (next: FormField[]) => setDef({ ...def, fields: next });
  const setField = (i: number, patch: Partial<FormField>) => setFields(fields.map((x, j) => (j === i ? (Object.fromEntries(Object.entries({ ...x, ...patch }).filter(([, val]) => val !== undefined)) as FormField) : x)));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= fields.length || from === to) return;
    const next = [...fields];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it!);
    setFields(next);
    setSel(to);
  };
  const add = (type: FormFieldType) => {
    const nf = newField(type, new Set(fields.map((x) => x.id)));
    const at = sel === null ? fields.length : sel + 1;
    setFields([...fields.slice(0, at), nf, ...fields.slice(at)]);
    setSel(at);
  };
  const save = () =>
    act.run(async () => {
      const r = await api<{ updated_at: string }>(`/v1/manage/forms/${id}/draft`, { method: "PUT", body: { definition: def, version: base } });
      setBase(r.updated_at);
      v.reload();
    }, "پیش‌نویس ذخیره شد.");
  const publish = () =>
    act.run(async () => {
      if (dirty) {
        const r = await api<{ updated_at: string }>(`/v1/manage/forms/${id}/draft`, { method: "PUT", body: { definition: def, version: base } });
        setBase(r.updated_at);
      }
      const r = await api<{ version: number }>(`/v1/manage/forms/${id}/publish`, { body: {} });
      v.reload();
      return r;
    }, "منتشر شد؛ سایت تا چند ثانیهٔ دیگر به‌روز می‌شود.");
  const current = sel !== null ? fields[sel] : null;
  const s = def.settings;
  const setS = (patch: Partial<FormDefinition["settings"]>) => setDef({ ...def, settings: { ...s, ...patch } });

  return (
    <>
      <PageHead title={pickL(def.title) || f.slug} sub={`/forms/${f.slug} · نسخهٔ منتشرشده ${num(f.version)} · ${f.system ? "فرم داخلی سایت" : "فرم سفارشی"}`}>
        <Link className="btn" href="/forms">
          همهٔ فرم‌ها
        </Link>
        {edit && (
          <>
            <button type="button" className="btn" disabled={!dirty || act.busy} onClick={save}>
              ذخیرهٔ پیش‌نویس
            </button>
            <button type="button" className="btn primary" disabled={act.busy || issues.length > 0} onClick={publish} title={issues.length ? "اول ایرادها را برطرف کنید" : undefined}>
              انتشار
            </button>
          </>
        )}
      </PageHead>
      <ErrorNote error={act.error} />
      {act.done && (
        <div className="note ok" role="status">
          {act.done}
        </div>
      )}
      {issues.length > 0 && (
        <div className="note warn" role="status">
          <b>{num(issues.length)} مورد پیش از انتشار:</b>
          <ul className="small" style={{ margin: "4px 0 0", paddingInlineStart: 18 }}>
            {issues.slice(0, 8).map((i) => (
              <li key={i.path + i.message}>
                <button type="button" className="link" onClick={() => (i.path.startsWith("fields.") ? (setTab("fields"), setSel(Number(i.path.split(".")[1]))) : setTab("settings"))}>
                  {i.path.startsWith("fields.") ? `«${pickL(fields[Number(i.path.split(".")[1])]?.label) || fields[Number(i.path.split(".")[1])]?.id}»` : "تنظیمات"}
                </button>
                : {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="tabs" role="tablist" aria-label="بخش‌های سازنده">
        {(
          [
            ["fields", "فیلدها"],
            ["settings", "مسیردهی و ایمیل‌ها"],
            ["preview", "پیش‌نمایش"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
        {dirty && <span className="badge warn" style={{ marginInlineStart: "auto" }}>تغییر ذخیره‌نشده</span>}
      </div>

      {tab === "fields" && (
        <div className="builder">
          <aside className="palette card" aria-label="افزودن فیلد">
            <h2 className="small muted">افزودن فیلد</h2>
            {PALETTE.map((p) => (
              <button key={p.type} type="button" className="pal-item" disabled={!edit} onClick={() => add(p.type)}>
                <p.icon size={18} aria-hidden /> {p.label}
              </button>
            ))}
          </aside>

          <section className="canvas card" aria-label="فیلدهای فرم">
            <div className="canvas-head">
              <LInput label="عنوان فرم" value={def.title} onChange={(title) => setDef({ ...def, title })} disabled={!edit} />
              <LInput label="مقدمه" value={def.intro} onChange={(intro) => setDef({ ...def, intro })} multiline disabled={!edit} />
            </div>
            <ol className="canvas-list">
              {fields.map((x, i) => {
                const Ico = TYPE_ICON[x.type];
                return (
                  <li
                    key={x.id + i}
                    className="cv-field"
                    data-width={x.width ?? "full"}
                    aria-current={sel === i ? "true" : undefined}
                    data-drop={drag !== null && drag !== i}
                    draggable={edit}
                    onDragStart={(e) => {
                      setDrag(i);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => drag !== null && e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (drag !== null) move(drag, i);
                      setDrag(null);
                    }}
                    onDragEnd={() => setDrag(null)}
                  >
                    <span className="grip" aria-hidden>
                      <DotsSixVertical size={18} />
                    </span>
                    <button type="button" className="cv-main" onClick={() => setSel(i)}>
                      <Ico size={18} aria-hidden />
                      <span className="cv-label">
                        {pickL(x.label) || <i className="muted">بدون برچسب</i>}
                        {x.required && <span className="req" aria-label="الزامی"> *</span>}
                      </span>
                      <span className="small muted">
                        {TYPE_LABEL[x.type]}
                        {x.role && " · هویت"}
                        {x.showIf && " · شرطی"}
                      </span>
                    </button>
                    {edit && (
                      <span className="cv-tools">
                        <button type="button" className="btn ghost icon-btn sm" aria-label={`بالا بردن ${pickL(x.label) || x.id}`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                          <ArrowUp size={16} aria-hidden />
                        </button>
                        <button type="button" className="btn ghost icon-btn sm" aria-label={`پایین بردن ${pickL(x.label) || x.id}`} disabled={i === fields.length - 1} onClick={() => move(i, i + 1)}>
                          <ArrowDown size={16} aria-hidden />
                        </button>
                        <button type="button" className="btn ghost icon-btn sm" aria-label={`رونوشت ${pickL(x.label) || x.id}`} onClick={() => (setFields([...fields.slice(0, i + 1), { ...x, id: newField(x.type, new Set(fields.map((y) => y.id))).id, role: undefined }, ...fields.slice(i + 1)]), setSel(i + 1))}>
                          <Copy size={16} aria-hidden />
                        </button>
                        <button type="button" className="btn ghost icon-btn sm danger" aria-label={`حذف ${pickL(x.label) || x.id}`} onClick={() => (setFields(fields.filter((_, j) => j !== i)), setSel(null))}>
                          <Trash size={16} aria-hidden />
                        </button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
            <div className="canvas-foot">
              <LInput label="متن دکمهٔ ارسال" value={def.submitLabel} onChange={(submitLabel) => setDef({ ...def, submitLabel })} disabled={!edit} />
              <LInput label="پیام پس از ارسال" value={def.success} onChange={(success) => setDef({ ...def, success })} multiline disabled={!edit} />
            </div>
          </section>

          <aside className="inspector card" aria-label="تنظیمات فیلد">
            {!current ? (
              <p className="empty small">یک فیلد را برای ویرایش انتخاب کنید، یا از فهرست کناری فیلد تازه اضافه کنید.</p>
            ) : (
              <FieldInspector key={sel} field={current} index={sel!} all={fields} disabled={!edit} onChange={(p) => setField(sel!, p)} />
            )}
          </aside>
        </div>
      )}

      {tab === "settings" && (
        <div className="cols-2">
          <section className="card">
            <div className="card-head">
              <h2>مسیردهی تیکت‌ها</h2>
            </div>
            <div className="card-body stack">
              <div className="filters">
                <label className="f">
                  <span>تیم</span>
                  <select value={s.team ?? ""} disabled={!edit} onChange={(e) => setS({ team: e.target.value || null })}>
                    <option value="">بدون تیم (همهٔ اپراتورها)</option>
                    {v.data.teams.map((t) => (
                      <option key={t.id} value={t.key}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="f">
                  <span>اولویت</span>
                  <select value={s.priority} disabled={!edit} onChange={(e) => setS({ priority: e.target.value as never })}>
                    {Object.entries(PRIORITY).map(([k, [l]]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="f">
                  <span>برچسب‌ها (با ویرگول)</span>
                  <input value={s.tags.join(", ")} disabled={!edit} onChange={(e) => setS({ tags: e.target.value.split(/[,،]/).map((x) => x.trim()).filter(Boolean) })} />
                </label>
              </div>
              <label className="f">
                <span>موضوع تیکت ({"{field_id}"} با پاسخ پر می‌شود؛ خالی = عنوان فرم)</span>
                <input dir="auto" value={s.subject} disabled={!edit} onChange={(e) => setS({ subject: e.target.value })} placeholder="{company} — درخواست نمونه" />
              </label>
              <h3>قواعد</h3>
              <p className="small muted">به ترتیب بررسی می‌شوند؛ قاعدهٔ پایین‌تر برنده است.</p>
              {s.rules.map((r, i) => (
                <div key={i} className="rule">
                  <span className="small">اگر</span>
                  <select aria-label="فیلد" value={r.when.field} disabled={!edit} onChange={(e) => setS({ rules: s.rules.map((x, j) => (j === i ? { ...x, when: { ...x.when, field: e.target.value } } : x)) })}>
                    {fields.filter((x) => !["heading", "paragraph", "file"].includes(x.type)).map((x) => (
                      <option key={x.id} value={x.id}>
                        {pickL(x.label) || x.id}
                      </option>
                    ))}
                  </select>
                  <select aria-label="شرط" value={r.when.op} disabled={!edit} onChange={(e) => setS({ rules: s.rules.map((x, j) => (j === i ? { ...x, when: { ...x.when, op: e.target.value as never } } : x)) })}>
                    <option value="eq">برابر</option>
                    <option value="neq">نابرابر</option>
                    <option value="contains">شامل</option>
                    <option value="gte">≥</option>
                    <option value="lte">≤</option>
                    <option value="filled">پر شده</option>
                  </select>
                  {r.when.op !== "filled" && <input aria-label="مقدار" value={String(r.when.value ?? "")} disabled={!edit} onChange={(e) => setS({ rules: s.rules.map((x, j) => (j === i ? { ...x, when: { ...x.when, value: e.target.value } } : x)) })} style={{ inlineSize: 120 }} />}
                  <span className="small">آنگاه</span>
                  <select aria-label="تیم" value={r.set.team ?? ""} disabled={!edit} onChange={(e) => setS({ rules: s.rules.map((x, j) => (j === i ? { ...x, set: { ...x.set, team: e.target.value || undefined } } : x)) })}>
                    <option value="">تیم بدون تغییر</option>
                    {v.data!.teams.map((t) => (
                      <option key={t.id} value={t.key}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <select aria-label="اولویت" value={r.set.priority ?? ""} disabled={!edit} onChange={(e) => setS({ rules: s.rules.map((x, j) => (j === i ? { ...x, set: { ...x.set, priority: (e.target.value || undefined) as never } } : x)) })}>
                    <option value="">اولویت بدون تغییر</option>
                    {Object.entries(PRIORITY).map(([k, [l]]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                  {edit && (
                    <button type="button" className="btn ghost icon-btn sm danger" aria-label="حذف قاعده" onClick={() => setS({ rules: s.rules.filter((_, j) => j !== i) })}>
                      <Trash size={16} aria-hidden />
                    </button>
                  )}
                </div>
              ))}
              {edit && fields.some((x) => !["heading", "paragraph", "file"].includes(x.type)) && (
                <button type="button" className="btn sm" onClick={() => setS({ rules: [...s.rules, { when: { field: fields.find((x) => !["heading", "paragraph", "file"].includes(x.type))!.id, op: "eq", value: "" }, set: {} }] })}>
                  + قاعدهٔ تازه
                </button>
              )}
            </div>
          </section>

          <div className="stack">
            <section className="card">
              <div className="card-head">
                <h2>ایمیل‌ها</h2>
              </div>
              <div className="card-body stack">
                <label className="f">
                  <span>رونوشت هر درخواست به (با ویرگول)</span>
                  <input dir="ltr" value={s.notify.join(", ")} disabled={!edit} onChange={(e) => setS({ notify: e.target.value.split(/[,،\s]+/).map((x) => x.trim()).filter(Boolean) })} placeholder="sales@arapoush.com" />
                </label>
                <label className="check">
                  <input type="checkbox" checked={s.confirmation.enabled} disabled={!edit} onChange={(e) => setS({ confirmation: { ...s.confirmation, enabled: e.target.checked } })} />
                  ایمیل تأیید برای فرستنده (پاسخ او به همین تیکت برمی‌گردد)
                </label>
                {s.confirmation.enabled && (
                  <>
                    <LInput label="موضوع ایمیل تأیید" value={s.confirmation.subject} onChange={(subject) => setS({ confirmation: { ...s.confirmation, subject } })} disabled={!edit} />
                    <LInput label="متن ایمیل تأیید ({name}، {number})" value={s.confirmation.body} onChange={(body) => setS({ confirmation: { ...s.confirmation, body } })} multiline disabled={!edit} />
                  </>
                )}
              </div>
            </section>
            <section className="card">
              <div className="card-head">
                <h2>صفحهٔ جداگانه و نگهداری</h2>
              </div>
              <div className="card-body stack">
                <label className="check">
                  <input type="checkbox" checked={s.page.enabled} disabled={!edit} onChange={(e) => setS({ page: { ...s.page, enabled: e.target.checked } })} />
                  صفحهٔ /forms/{f.slug} در سایت
                </label>
                {s.page.enabled && (
                  <>
                    <label className="check">
                      <input type="checkbox" checked={s.page.indexable} disabled={!edit} onChange={(e) => setS({ page: { ...s.page, indexable: e.target.checked } })} />
                      در گوگل و نقشهٔ سایت بیاید
                    </label>
                    <LInput label="عنوان صفحه (سئو)" value={s.page.title} onChange={(title) => setS({ page: { ...s.page, title } })} disabled={!edit} />
                    <LInput label="توضیح صفحه (سئو)" value={s.page.description} onChange={(description) => setS({ page: { ...s.page, description } })} multiline disabled={!edit} />
                  </>
                )}
                <div className="filters">
                  <label className="f">
                    <span>نگهداری (روز)</span>
                    <input type="number" min={30} max={3650} value={s.retentionDays} disabled={!edit} onChange={(e) => setS({ retentionDays: Number(e.target.value) })} />
                  </label>
                  <label className="f">
                    <span>سقف ارسال از هر IP در ۱۰ دقیقه</span>
                    <input type="number" min={1} max={100} value={s.perIpLimit} disabled={!edit} onChange={(e) => setS({ perIpLimit: Number(e.target.value) })} />
                  </label>
                </div>
              </div>
            </section>
            <section className="card">
              <div className="card-head">
                <h2>نسخه‌ها</h2>
              </div>
              <div className="card-body">
                {!v.data.versions.length ? (
                  <p className="small muted">هنوز منتشر نشده.</p>
                ) : (
                  <ul className="plain small">
                    {v.data.versions.map((x) => (
                      <li key={x.version}>
                        نسخهٔ {num(x.version)} · {x.by ?? "سیستم"} · <span title={when(x.published_at)}>{ago(x.published_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {tab === "preview" && <Preview def={def} />}
    </>
  );
}

function FieldInspector({ field: x, index, all, disabled, onChange }: { field: FormField; index: number; all: FormField[]; disabled: boolean; onChange: (p: Partial<FormField>) => void }) {
  const display = x.type === "heading" || x.type === "paragraph";
  const earlier = all.slice(0, index).filter((y) => !["heading", "paragraph", "file"].includes(y.type));
  const idRef = useRef(x.id);
  return (
    <div className="stack">
      <h2 className="row">{TYPE_LABEL[x.type]}</h2>
      <LInput label={display ? "متن" : "برچسب"} value={x.label} onChange={(label) => onChange({ label })} multiline={x.type === "paragraph"} disabled={disabled} />
      {!display && x.type !== "hidden" && (
        <>
          <LInput label="راهنما (زیر فیلد)" value={x.help} onChange={(help) => onChange({ help })} disabled={disabled} />
          {!["checkbox", "consent", "radio", "checkboxes", "file"].includes(x.type) && <LInput label="متن نمونه (placeholder)" value={x.placeholder} onChange={(placeholder) => onChange({ placeholder })} disabled={disabled} />}
          <div className="row">
            <label className="check">
              <input type="checkbox" checked={!!x.required} disabled={disabled} onChange={(e) => onChange({ required: e.target.checked || undefined })} /> الزامی
            </label>
            <label className="check">
              <input type="checkbox" checked={x.width === "half"} disabled={disabled} onChange={(e) => onChange({ width: e.target.checked ? "half" : "full" })} /> نیم‌عرض
            </label>
          </div>
        </>
      )}
      {HAS_OPTIONS.has(x.type) && (
        <fieldset className="stack">
          <legend className="small muted">گزینه‌ها</legend>
          {(x.options ?? []).map((o, j) => (
            <div key={j} className="row opt-row">
              <input aria-label={`مقدار گزینهٔ ${j + 1}`} dir="ltr" value={o.value} disabled={disabled} onChange={(e) => onChange({ options: x.options!.map((y, k) => (k === j ? { ...y, value: e.target.value.replace(/\s/g, "-") } : y)) })} style={{ inlineSize: 90 }} />
              <input aria-label={`برچسب گزینهٔ ${j + 1}`} value={o.label.fa ?? ""} disabled={disabled} onChange={(e) => onChange({ options: x.options!.map((y, k) => (k === j ? { ...y, label: { ...y.label, fa: e.target.value } } : y)) })} />
              <input aria-label={`برچسب انگلیسی گزینهٔ ${j + 1}`} dir="ltr" placeholder="EN" value={o.label.en ?? ""} disabled={disabled} onChange={(e) => onChange({ options: x.options!.map((y, k) => (k === j ? { ...y, label: { ...y.label, en: e.target.value } } : y)) })} />
              <input aria-label={`برچسب ترکی گزینهٔ ${j + 1}`} dir="ltr" placeholder="TR" value={o.label.tr ?? ""} disabled={disabled} onChange={(e) => onChange({ options: x.options!.map((y, k) => (k === j ? { ...y, label: { ...y.label, tr: e.target.value } } : y)) })} />
              <button type="button" className="btn ghost icon-btn sm danger" aria-label={`حذف گزینهٔ ${j + 1}`} disabled={disabled} onClick={() => onChange({ options: x.options!.filter((_, k) => k !== j) })}>
                <Trash size={14} aria-hidden />
              </button>
            </div>
          ))}
          {!disabled && (
            <button type="button" className="btn sm" onClick={() => onChange({ options: [...(x.options ?? []), { value: `opt-${(x.options?.length ?? 0) + 1}`, label: { fa: `گزینهٔ ${(x.options?.length ?? 0) + 1}` } }] })}>
              <ListBullets size={14} aria-hidden /> گزینهٔ تازه
            </button>
          )}
        </fieldset>
      )}
      {["text", "textarea", "number", "checkboxes", "file"].includes(x.type) && (
        <div className="filters">
          <label className="f">
            <span>{x.type === "number" ? "کمترین مقدار" : x.type === "checkboxes" ? "کمترین انتخاب" : x.type === "file" ? "—" : "کمترین طول"}</span>
            <input type="number" disabled={disabled || x.type === "file"} value={x.min ?? ""} onChange={(e) => onChange({ min: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </label>
          <label className="f">
            <span>{x.type === "number" ? "بیشترین مقدار" : x.type === "checkboxes" ? "بیشترین انتخاب" : x.type === "file" ? "تعداد فایل" : "بیشترین طول"}</span>
            <input type="number" disabled={disabled} value={x.max ?? ""} onChange={(e) => onChange({ max: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </label>
        </div>
      )}
      {x.type === "file" && (
        <fieldset className="row">
          <legend className="small muted">نوع فایل مجاز</legend>
          {(["pdf", "jpeg", "png", "webp"] as const).map((k) => (
            <label key={k} className="check">
              <input type="checkbox" disabled={disabled} checked={(x.accept ?? []).includes(k)} onChange={(e) => onChange({ accept: e.target.checked ? [...(x.accept ?? []), k] : (x.accept ?? []).filter((y) => y !== k) })} /> {k.toUpperCase()}
            </label>
          ))}
        </fieldset>
      )}
      {x.type === "hidden" && (
        <label className="f">
          <span>مقدار ({"{page}"}، {"{utm_source}"}، {"{utm_campaign}"} یا متن ثابت)</span>
          <input dir="ltr" disabled={disabled} value={x.defaultValue ?? ""} onChange={(e) => onChange({ defaultValue: e.target.value })} />
        </label>
      )}
      {!display && (
        <details>
          <summary>پیشرفته</summary>
          <div className="stack" style={{ marginBlockStart: 8 }}>
            <label className="f">
              <span>شناسه (انگلیسی، در قواعد و گزارش‌ها)</span>
              <input
                dir="ltr"
                disabled={disabled}
                value={x.id}
                onChange={(e) => onChange({ id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
                onBlur={() => {
                  if (x.id !== idRef.current && all.some((y, j) => j !== index && y.showIf?.field === idRef.current)) alert("شرط فیلدهای دیگر به شناسهٔ قبلی اشاره دارد؛ آن‌ها را هم بررسی کنید.");
                  idRef.current = x.id;
                }}
              />
            </label>
            {["text", "textarea", "email", "phone", "select"].includes(x.type) || x.type === "email" ? (
              <label className="f">
                <span>این فیلد نشان‌دهندهٔ … درخواست‌دهنده است</span>
                <select disabled={disabled} value={x.role ?? ""} onChange={(e) => onChange({ role: (e.target.value || undefined) as never })}>
                  <option value="">هیچ‌کدام</option>
                  <option value="name">نام</option>
                  <option value="email">ایمیل (برای پاسخ و پیگیری)</option>
                  <option value="phone">تلفن</option>
                  <option value="company">شرکت</option>
                  <option value="message">پیام</option>
                </select>
              </label>
            ) : null}
            {x.type === "text" && (
              <label className="f">
                <span>الگو (عبارت منظم)</span>
                <input dir="ltr" disabled={disabled} value={x.pattern ?? ""} onChange={(e) => onChange({ pattern: e.target.value || undefined })} placeholder="[A-Z]{2}\d{4}" />
              </label>
            )}
            <fieldset className="stack">
              <legend className="small muted">نمایش شرطی</legend>
              <select
                aria-label="فقط وقتی نمایش بده که"
                disabled={disabled || !earlier.length}
                value={x.showIf?.field ?? ""}
                onChange={(e) => onChange({ showIf: e.target.value ? { field: e.target.value, op: "eq", value: "" } : undefined })}
              >
                <option value="">همیشه نمایش بده</option>
                {earlier.map((y) => (
                  <option key={y.id} value={y.id}>
                    فقط وقتی «{pickL(y.label) || y.id}» …
                  </option>
                ))}
              </select>
              {x.showIf && (
                <div className="row">
                  <select aria-label="شرط" disabled={disabled} value={x.showIf.op} onChange={(e) => onChange({ showIf: { ...x.showIf!, op: e.target.value as never } })}>
                    <option value="eq">برابر</option>
                    <option value="neq">نابرابر</option>
                    <option value="filled">پر شده</option>
                    <option value="empty">خالی</option>
                  </select>
                  {(x.showIf.op === "eq" || x.showIf.op === "neq") &&
                    (() => {
                      const src = all.find((y) => y.id === x.showIf!.field);
                      return src?.options ? (
                        <select aria-label="مقدار" disabled={disabled} value={String(x.showIf.value ?? "")} onChange={(e) => onChange({ showIf: { ...x.showIf!, value: e.target.value } })}>
                          <option value="">—</option>
                          {src.options.map((o) => (
                            <option key={o.value} value={o.value}>
                              {pickL(o.label)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input aria-label="مقدار" disabled={disabled} value={String(x.showIf.value ?? "")} onChange={(e) => onChange({ showIf: { ...x.showIf!, value: e.target.value } })} />
                      );
                    })()}
                </div>
              )}
            </fieldset>
          </div>
        </details>
      )}
    </div>
  );
}

/** How the form behaves on the site (conditions and validation run with the same code). */
function Preview({ def }: { def: FormDefinition }) {
  const [loc, setLoc] = useState<(typeof LOCALES)[number]>("fa");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ok, setOk] = useState(false);
  const dir = loc === "fa" ? "rtl" : "ltr";
  const t = (l: L | undefined) => pickL(l, loc);
  const set = (id: string, val: unknown) => (setValues({ ...values, [id]: val }), setOk(false));
  const MSG: Record<string, string> = { required: "الزامی است", invalid_email: "ایمیل درست نیست", invalid_phone: "شماره درست نیست", invalid_option: "گزینه درست نیست", too_long: "بلند است", too_short: "کوتاه است", too_small: "کم است", too_large: "زیاد است", pattern: "قالب درست نیست", invalid_number: "عدد نیست", invalid_date: "تاریخ درست نیست" };
  return (
    <section className="card">
      <div className="card-head">
        <h2>پیش‌نمایش</h2>
        <span className="loc-tabs" role="tablist" aria-label="زبان پیش‌نمایش">
          {LOCALES.map((l) => (
            <button key={l} type="button" role="tab" aria-selected={loc === l} onClick={() => setLoc(l)}>
              {LOCALE_LABEL[l]}
            </button>
          ))}
        </span>
      </div>
      <form
        className="card-body preview-form"
        dir={dir}
        lang={loc}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const r = validateSubmission(def, Object.fromEntries(Object.entries(values).filter(([k]) => def.fields.find((x) => x.id === k)?.type !== "file")), Object.fromEntries(def.fields.filter((x) => x.type === "file" && values[x.id]).map((x) => [x.id, 1])));
          setErrors(r.errors);
          setOk(!Object.keys(r.errors).length);
        }}
      >
        <h3>{t(def.title)}</h3>
        {t(def.intro) && <p className="muted">{t(def.intro)}</p>}
        <div className="pf-grid">
          {def.fields
            .filter((x) => x.type !== "hidden" && isVisible(x, values))
            .map((x) => {
              const err = errors[x.id];
              const id = `pv-${x.id}`;
              if (x.type === "heading") return <h4 key={x.id} className="pf-full">{t(x.label)}</h4>;
              if (x.type === "paragraph") return <p key={x.id} className="pf-full muted">{t(x.label)}</p>;
              const common = { id, "aria-invalid": !!err || undefined, "aria-describedby": err ? `${id}-e` : undefined };
              let control: React.ReactNode;
              if (x.type === "textarea") control = <textarea {...common} rows={4} placeholder={t(x.placeholder)} value={String(values[x.id] ?? "")} onChange={(e) => set(x.id, e.target.value)} />;
              else if (x.type === "select")
                control = (
                  <select {...common} value={String(values[x.id] ?? "")} onChange={(e) => set(x.id, e.target.value)}>
                    <option value="">—</option>
                    {x.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {t(o.label)}
                      </option>
                    ))}
                  </select>
                );
              else if (x.type === "radio" || x.type === "checkboxes")
                control = (
                  <div className="pf-opts" role={x.type === "radio" ? "radiogroup" : "group"} aria-labelledby={`${id}-l`}>
                    {x.options?.map((o) => {
                      const cur = values[x.id];
                      const on = x.type === "radio" ? cur === o.value : Array.isArray(cur) && cur.includes(o.value);
                      return (
                        <label key={o.value} className="check">
                          <input type={x.type === "radio" ? "radio" : "checkbox"} name={id} checked={on} onChange={() => set(x.id, x.type === "radio" ? o.value : on ? (cur as string[]).filter((y) => y !== o.value) : [...((cur as string[]) ?? []), o.value])} /> {t(o.label)}
                        </label>
                      );
                    })}
                  </div>
                );
              else if (x.type === "checkbox" || x.type === "consent")
                return (
                  <div key={x.id} className="pf-full">
                    <label className="check">
                      <input type="checkbox" {...common} checked={values[x.id] === true} onChange={(e) => set(x.id, e.target.checked)} /> {t(x.label)}
                      {x.required && " *"}
                    </label>
                    {err && <span id={`${id}-e`} className="pf-err">{MSG[err] ?? err}</span>}
                  </div>
                );
              else if (x.type === "file") control = <input {...common} type="file" onChange={(e) => set(x.id, e.target.files?.length ? true : undefined)} />;
              else control = <input {...common} type={x.type === "email" ? "email" : x.type === "number" ? "text" : x.type === "date" ? "date" : x.type === "phone" ? "tel" : "text"} inputMode={x.type === "number" ? "decimal" : undefined} dir={x.type === "email" || x.type === "phone" ? "ltr" : undefined} placeholder={t(x.placeholder)} value={String(values[x.id] ?? "")} onChange={(e) => set(x.id, e.target.value)} />;
              return (
                <div key={x.id} className={x.width === "half" ? "pf-half" : "pf-full"}>
                  <label htmlFor={id} id={`${id}-l`} className="pf-label">
                    {t(x.label)}
                    {x.required && <span aria-hidden> *</span>}
                  </label>
                  {control}
                  {t(x.help) && <span className="small muted">{t(x.help)}</span>}
                  {err && (
                    <span id={`${id}-e`} className="pf-err">
                      {MSG[err] ?? err}
                    </span>
                  )}
                </div>
              );
            })}
        </div>
        {ok ? <div className="note ok">{t(def.success)}</div> : null}
        <button className="btn primary">{t(def.submitLabel)}</button>
        <p className="small muted">پیش‌نمایش چیزی نمی‌فرستد؛ فقط شرط‌ها و اعتبارسنجی را نشان می‌دهد.</p>
      </form>
    </section>
  );
}
