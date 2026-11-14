"use client";

import Link from "next/link";
import { useState } from "react";
import { LOCALES, slugify, type Locale } from "@arapoush/schema";
import { api } from "@/lib/api";
import { can, useAction, useApi, useMe } from "@/lib/hooks";
import { num } from "@/lib/fa";
import { Dialog, ErrorNote, Loading, PageHead } from "@/components/ui";
import { ImagePick, Lines } from "../_components/BlockEditor";
import { LOCALE_NAME, nm, type Author, type Taxonomy } from "../_components/lib";

type Loc = Partial<Record<Locale, string>>;
type Kind = "categories" | "tags" | "authors";
/** One editable row of any kind (fields not used by a kind stay empty). */
type Item = { id?: string; name?: Loc; slug?: Loc | string; description?: Loc; position?: number; role?: Loc; bio?: Loc; expertise?: string[]; sameAs?: string[]; photo?: Author["photo"]; principalId?: string | null };
const TITLE: Record<Kind, string> = { categories: "دسته‌ها", tags: "برچسب‌ها", authors: "نویسنده‌ها" };

/** Categories, tags and authors of the journal (blog.manage). */
export default function BlogSettings() {
  const me = useMe();
  const tax = useApi<Taxonomy>("/v1/manage/blog/taxonomy");
  const ops = useApi<{ id: string; display_name: string; email: string | null }[]>(can(me, "users.read") ? "/v1/manage/operators" : null);
  const act = useAction();
  const [tab, setTab] = useState<Kind>("categories");
  const [edit, setEdit] = useState<{ kind: Kind; item: Item } | null>(null);
  const manage = can(me, "blog.manage");

  const remove = (kind: Kind, id: string, name: string) =>
    confirm(`«${name}» حذف شود؟`) &&
    act.run(async () => {
      await api(`/v1/manage/blog/${kind}/${id}`, { method: "DELETE" });
      tax.reload();
    }, "حذف شد.");

  const rows: { id: string; name: string; meta: string; posts: number; item: Item }[] =
    tab === "categories"
      ? (tax.data?.categories ?? []).map((c) => ({ id: c.id, name: nm(c.name), meta: LOCALES.filter((l) => c.slug[l]).map((l) => `${l}: ${c.slug[l]}`).join(" · "), posts: c.posts, item: c }))
      : tab === "tags"
        ? (tax.data?.tags ?? []).map((t) => ({ id: t.id, name: nm(t.name), meta: t.slug, posts: t.posts, item: t }))
        : (tax.data?.authors ?? []).map((a) => ({ id: a.id, name: nm(a.name), meta: [nm(a.role), a.slug].filter((x) => x !== "—").join(" · "), posts: a.posts, item: a }));

  return (
    <>
      <div className="small" style={{ marginBlockEnd: 8 }}>
        <Link href="/blog">بلاگ</Link> / دسته‌ها، برچسب‌ها و نویسنده‌ها
      </div>
      <PageHead title="دسته‌ها، برچسب‌ها و نویسنده‌ها" sub="دسته‌ها صفحهٔ خودشان را روی سایت دارند (نشانی جدا برای هر زبان). نویسنده‌ها صفحهٔ پروفایل دارند: سمت، تخصص و پیوند به LinkedIn برای اعتبار (E-E-A-T).">
        {manage && (
          <button type="button" className="btn primary" onClick={() => setEdit({ kind: tab, item: {} })}>
            {tab === "categories" ? "دستهٔ تازه" : tab === "tags" ? "برچسب تازه" : "نویسندهٔ تازه"}
          </button>
        )}
      </PageHead>
      <div className="tabs" role="tablist" aria-label="بخش‌ها">
        {(Object.keys(TITLE) as Kind[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {TITLE[k]}
          </button>
        ))}
      </div>
      <div className="grid">
        <ErrorNote error={act.error ?? tax.error} />
        {act.done && (
          <div className="note ok" role="status">
            {act.done}
          </div>
        )}
        <section className="card" aria-label={TITLE[tab]}>
          {!tax.data ? (
            <div className="card-body">
              <Loading />
            </div>
          ) : rows.length === 0 ? (
            <div className="empty">هنوز چیزی تعریف نشده.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>نام</th>
                    <th>نشانی و جزئیات</th>
                    <th>مقاله‌ها</th>
                    <th>
                      <span className="sr-only">کار</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.name}</td>
                      <td className="small muted" dir="auto">
                        {r.meta}
                      </td>
                      <td>{num(r.posts)}</td>
                      <td>
                        {manage && (
                          <div className="row">
                            <button type="button" className="btn sm" onClick={() => setEdit({ kind: tab, item: r.item })}>
                              ویرایش
                            </button>
                            <button type="button" className="btn sm danger" onClick={() => remove(tab, r.id, r.name)}>
                              حذف
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      {edit && (
        <Editor
          kind={edit.kind}
          item={edit.item}
          operators={ops.data ?? []}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            tax.reload();
          }}
        />
      )}
    </>
  );
}

function LocFields({ label, value, onChange, max, multiline, slug }: { label: string; value: Loc; onChange: (v: Loc) => void; max: number; multiline?: boolean; slug?: boolean }) {
  return (
    <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 6 }}>
      <legend className="small" style={{ fontWeight: 600, marginBlockEnd: 4 }}>
        {label}
      </legend>
      {LOCALES.map((l) => (
        <label key={l} className="f">
          <span>{LOCALE_NAME[l]}</span>
          {multiline ? (
            <textarea rows={3} maxLength={max} dir={l === "fa" ? "rtl" : "ltr"} value={value[l] ?? ""} onChange={(e) => onChange({ ...value, [l]: e.target.value })} />
          ) : (
            <input maxLength={max} dir={l === "fa" ? "rtl" : "ltr"} value={value[l] ?? ""} onChange={(e) => onChange({ ...value, [l]: slug ? slugify(e.target.value) : e.target.value })} />
          )}
        </label>
      ))}
    </fieldset>
  );
}

function Editor({ kind, item, operators, onClose, onSaved }: { kind: Kind; item: Item; operators: { id: string; display_name: string; email: string | null }[]; onClose: () => void; onSaved: () => void }) {
  const act = useAction();
  const isNew = !item.id;
  const [name, setName] = useState<Loc>(item.name ?? {});
  const [slugs, setSlugs] = useState<Loc>(typeof item.slug === "object" && item.slug ? item.slug : {});
  const [slug, setSlug] = useState(typeof item.slug === "string" ? item.slug : "");
  const [description, setDescription] = useState<Loc>(item.description ?? {});
  const [position, setPosition] = useState(item.position ?? 0);
  const [role, setRole] = useState<Loc>(item.role ?? {});
  const [bio, setBio] = useState<Loc>(item.bio ?? {});
  const [expertise, setExpertise] = useState<string[]>(item.expertise ?? []);
  const [sameAs, setSameAs] = useState<string[]>(item.sameAs ?? []);
  const [photo, setPhoto] = useState(item.photo ?? null);
  const [principalId, setPrincipalId] = useState(item.principalId ?? "");

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const strip = (v: Loc) => Object.fromEntries(Object.entries(v).filter(([, x]) => x?.trim()));
    const body =
      kind === "categories"
        ? { name: strip(name), slug: strip(slugs), description: strip(description), position }
        : kind === "tags"
          ? { name: strip(name), slug: slug || slugify(name.fa || name.en || "") }
          : { slug: slug || slugify(name.en || name.fa || ""), name: strip(name), role: strip(role), bio: strip(bio), expertise: expertise.filter((x) => x.trim()), photo, sameAs: sameAs.filter((x) => x.trim()), principalId: principalId || null };
    act.run(async () => {
      await api(isNew ? `/v1/manage/blog/${kind}` : `/v1/manage/blog/${kind}/${item.id}`, { method: isNew ? "POST" : "PUT", body });
      onSaved();
    });
  };

  return (
    <Dialog open wide onClose={onClose} title={`${isNew ? "تازه" : "ویرایش"}: ${TITLE[kind]}`}>
      <form className="stack" onSubmit={save}>
        <LocFields label="نام" value={name} onChange={setName} max={kind === "authors" ? 120 : 80} />
        {kind === "categories" ? (
          <>
            <LocFields label="نشانی (slug) هر زبان؛ خالی = این دسته در آن زبان صفحه ندارد" value={slugs} onChange={setSlugs} max={100} slug />
            <button type="button" className="btn sm" style={{ justifySelf: "start" }} onClick={() => setSlugs(Object.fromEntries(LOCALES.filter((l) => name[l]).map((l) => [l, slugify(name[l]!)])))}>
              ساخت نشانی‌ها از نام
            </button>
            <LocFields label="توضیح (بالای صفحهٔ دسته و توضیح متا)" value={description} onChange={setDescription} max={300} multiline />
            <label className="f" style={{ maxInlineSize: 160 }}>
              <span>ترتیب</span>
              <input type="number" min={0} max={1000} value={position} onChange={(e) => setPosition(Number(e.target.value))} />
            </label>
          </>
        ) : (
          <label className="f">
            <span>نشانی (slug)</span>
            <input dir="auto" maxLength={100} value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder={slugify(name.en || name.fa || "")} />
          </label>
        )}
        {kind === "authors" && (
          <>
            <LocFields label="سمت" value={role} onChange={setRole} max={120} />
            <LocFields label="معرفی کوتاه" value={bio} onChange={setBio} max={1500} multiline />
            <div className="stack" style={{ gap: 4 }}>
              <span className="small" style={{ fontWeight: 600 }}>
                حوزه‌های تخصص (knowsAbout)
              </span>
              <Lines values={expertise} onChange={setExpertise} max={80} limit={12} label="تخصص" />
            </div>
            <div className="stack" style={{ gap: 4 }}>
              <span className="small" style={{ fontWeight: 600 }}>
                پروفایل‌ها (LinkedIn، ORCID، …؛ https)
              </span>
              <Lines values={sameAs} onChange={setSameAs} max={300} limit={8} label="نشانی" />
            </div>
            <ImagePick label="عکس" value={photo} onChange={setPhoto} alt={false} />
            <label className="f">
              <span>حساب کاربری OPEX (مقاله‌های تازهٔ او خودکار به این نام نوشته می‌شوند)</span>
              <select value={principalId} onChange={(e) => setPrincipalId(e.target.value)}>
                <option value="">—</option>
                {operators.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.display_name} {o.email ? `(${o.email})` : ""}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <ErrorNote error={act.error} />
        <div className="row">
          <button className="btn primary" disabled={act.busy}>
            ذخیره
          </button>
          <button type="button" className="btn" onClick={onClose}>
            انصراف
          </button>
        </div>
      </form>
    </Dialog>
  );
}
