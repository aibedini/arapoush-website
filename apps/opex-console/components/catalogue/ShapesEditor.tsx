"use client";

import { useState } from "react";
import { Plus, Trash } from "@phosphor-icons/react";
import { num } from "@/lib/fa";
import { FIT_FA, SHAPE_MODELS, byNum, diametersOf, freshId, locName, removeDiameter, removeShape, renameShape, shapeUses, type Catalogue, type Issue, type ShapeDef, type SizeRow } from "./model";
import { ChipList, IdField, ImagePick, IssueList, ItemTools, LocFields, MasterList, move, numOrUndef } from "./parts";

type Props = { cat: Catalogue; set: (fn: (c: Catalogue) => Catalogue) => void; issues: Issue[]; disabled: boolean; selected: string; onSelect: (id: string) => void };

/** Tube shapes: names, 3D model, image, Excel wordings and the length/volume rows per diameter. */
export function ShapesEditor({ cat, set, issues, disabled, selected, onSelect }: Props) {
  const index = Math.max(0, cat.shapes.findIndex((s) => s.id === selected));
  const shape = cat.shapes[index];
  const patch = (p: Partial<ShapeDef>) => set((c) => ({ ...c, shapes: c.shapes.map((s, i) => (i === index ? { ...s, ...p } : s)) }));
  const ids = cat.shapes.map((s) => s.id);

  const add = () => {
    const id = freshId("shape", ids);
    set((c) => ({ ...c, shapes: [...c.shapes, { id, model: "circular", name: { fa: "شکل تازه" }, image: "", sizes: {} }] }));
    onSelect(id);
  };
  const del = () => {
    if (!shape) return;
    const u = shapeUses(cat, shape.id);
    const lines = [
      u.closures.length && `${num(u.closures.length)} درب سازگاری‌شان با این شکل را از دست می‌دهند`,
      u.prints.length && `${num(u.prints.length)} روش چاپ`,
      u.structures.length && `${num(u.structures.length)} ساختار`,
      u.samples.length && `${num(u.samples.length)} نمونه حذف می‌شوند`,
    ].filter(Boolean);
    if (!confirm(`شکل «${locName(shape.name, shape.id)}» حذف شود؟${lines.length ? "\n\n" + lines.join("\n") : ""}`)) return;
    set((c) => removeShape(c, shape.id));
    onSelect(cat.shapes[index === 0 ? 1 : index - 1]?.id ?? "");
  };

  return (
    <div className="cm-split">
      <MasterList
        label="شکل‌ها"
        items={cat.shapes.map((s) => ({ id: s.id, title: locName(s.name, s.id), sub: `${num(diametersOf(s).length)} قطر · ${num(Object.values(s.sizes).flat().length)} سایز`, image: s.image, issues: issues.filter((i) => i.id === s.id).length }))}
        selected={shape?.id ?? ""}
        onSelect={onSelect}
        onAdd={add}
        addLabel="شکل تازه"
        disabled={disabled}
      />
      {shape ? (
        <section className="cm-detail" aria-labelledby="cm-shape-title">
          <div className="card">
            <div className="card-head">
              <h2 id="cm-shape-title">{locName(shape.name, shape.id)}</h2>
              <ItemTools what={locName(shape.name, shape.id)} index={index} count={cat.shapes.length} disabled={disabled} onMove={(d) => set((c) => ({ ...c, shapes: move(c.shapes, index, d) }))} onDelete={del} />
            </div>
            <div className="card-body stack">
              <IssueList issues={issues.filter((i) => i.id === shape.id)} />
              <div className="cm-grid-2">
                <IdField value={shape.id} taken={ids.filter((x) => x !== shape.id)} disabled={disabled} onCommit={(to) => (set((c) => renameShape(c, shape.id, to)), onSelect(to))} />
                <label className="f">
                  <span>مدل سه‌بعدی</span>
                  <select value={shape.model} disabled={disabled} onChange={(e) => patch({ model: e.target.value as ShapeDef["model"] })}>
                    {SHAPE_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.fa}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <LocFields legend="نام" value={shape.name} disabled={disabled} onChange={(name) => patch({ name })} />
              <div className="cm-grid-2">
                <ImagePick label="تصویر شکل" value={shape.image} disabled={disabled} onChange={(image) => patch({ image })} />
                <ChipList label="نام‌ها در جدول اکسل" values={shape.aliases} disabled={disabled} placeholder="مثلاً: مقطع دایره" onChange={(aliases) => patch({ aliases: aliases.length ? aliases : undefined })} />
              </div>
            </div>
          </div>
          <Sizes cat={cat} shape={shape} set={set} disabled={disabled} />
        </section>
      ) : (
        <div className="card empty">هنوز شکلی تعریف نشده است. با «شکل تازه» شروع کنید.</div>
      )}
    </div>
  );
}

function Sizes({ cat, shape, set, disabled }: { cat: Catalogue; shape: ShapeDef; set: Props["set"]; disabled: boolean }) {
  const ds = diametersOf(shape);
  const [d, setD] = useState(ds[0] ?? "");
  const [newD, setNewD] = useState("");
  const [lens, setLens] = useState("");
  const cur = ds.includes(d) ? d : (ds[0] ?? "");
  const rows = shape.sizes[cur] ?? [];
  const setRows = (fn: (r: SizeRow[]) => SizeRow[]) => set((c) => ({ ...c, shapes: c.shapes.map((s) => (s.id === shape.id ? { ...s, sizes: { ...s.sizes, [cur]: fn(s.sizes[cur] ?? []) } } : s)) }));
  const sort = () => setRows((r) => [...r].sort((a, b) => a.l - b.l));
  const fits = cat.closures.filter((x) => x.compat[shape.id]?.[cur]);

  const addDiameter = () => {
    const v = Math.round(Number(newD));
    if (!(v > 0) || shape.sizes[String(v)]) return;
    set((c) => ({ ...c, shapes: c.shapes.map((s) => (s.id === shape.id ? { ...s, sizes: Object.fromEntries(Object.entries({ ...s.sizes, [String(v)]: [] }).sort(([a], [b]) => byNum(a, b))) } : s)) }));
    setD(String(v));
    setNewD("");
  };
  const delDiameter = () => {
    const n = cat.closures.filter((x) => x.compat[shape.id]?.[cur]).length;
    if (!confirm(`قطر ${cur} از «${locName(shape.name, shape.id)}» حذف شود؟${n ? `\n\nسازگاری و رنگ‌های ${num(n)} درب در این قطر هم حذف می‌شود.` : ""}`)) return;
    set((c) => removeDiameter(c, shape.id, cur));
  };
  const addLengths = () => {
    const vals = lens
      .split(/[\s,،؛;]+/)
      .map((x) => Number(x.replace(/[۰-۹]/g, (ch) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(ch)))))
      .filter((x) => x > 0);
    if (!vals.length) return;
    setRows((r) => [...r, ...vals.filter((l) => !r.some((x) => x.l === l)).map((l) => ({ l }))].sort((a, b) => a.l - b.l));
    setLens("");
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2>سایزها</h2>
        <form
          className="row"
          style={{ gap: 6 }}
          onSubmit={(e) => {
            e.preventDefault();
            addDiameter();
          }}
        >
          <label className="sr-only" htmlFor="cm-new-d">
            قطر تازه (mm)
          </label>
          <input id="cm-new-d" type="number" min={5} max={120} dir="ltr" value={newD} disabled={disabled} onChange={(e) => setNewD(e.target.value)} placeholder="Ø mm" style={{ inlineSize: 96 }} />
          <button type="submit" className="btn sm" disabled={disabled || !(Number(newD) > 0) || !!shape.sizes[String(Math.round(Number(newD)))]}>
            <Plus size={14} aria-hidden /> قطر
          </button>
        </form>
      </div>
      <div className="card-body stack">
        {ds.length ? (
          <>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "start" }}>
              <div className="cm-dtabs" role="group" aria-label="قطرها">
                {ds.map((x) => (
                  <button key={x} type="button" aria-pressed={x === cur} className="cm-dtab" onClick={() => setD(x)}>
                    <span dir="ltr">Ø{x}</span>
                    <span className="cm-dtab-n">{num(shape.sizes[x]?.length ?? 0)}</span>
                  </button>
                ))}
              </div>
              <button type="button" className="btn sm danger" disabled={disabled} onClick={delDiameter}>
                <Trash size={16} aria-hidden /> حذف قطر <span dir="ltr">Ø{cur}</span>
              </button>
            </div>
            <div role="region" aria-label={`سایزهای قطر ${cur} میلی‌متر`} className="stack">
              <div className="table-wrap cm-table">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">طول (mm)</th>
                      <th scope="col">حجم (ml)</th>
                      <th scope="col">منبع حجم</th>
                      <th scope="col">
                        <span className="sr-only">ابزار</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td>
                          <input type="number" dir="ltr" min={1} value={r.l || ""} disabled={disabled} aria-label={`طول ردیف ${num(i + 1)} (mm)`} aria-invalid={!(r.l > 0) || undefined} onKeyDown={(e) => e.key === "Enter" && sort()} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, l: Number(e.target.value) } : x)))} />
                        </td>
                        <td>
                          <input type="number" dir="ltr" min={0} step="any" value={r.ml ?? ""} disabled={disabled} aria-label={`حجم ردیف ${num(i + 1)} (ml)`} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, ml: numOrUndef(e.target.value) } : x)))} />
                        </td>
                        <td>
                          <select value={r.status ?? ""} disabled={disabled} aria-label={`منبع حجم ردیف ${num(i + 1)}`} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, status: (e.target.value || undefined) as SizeRow["status"] } : x)))}>
                            <option value="">—</option>
                            <option value="chart">جدول آراپوش</option>
                            <option value="estimate">تخمینی</option>
                          </select>
                        </td>
                        <td className="cm-td-tools">
                          <button type="button" className="btn sm ghost icon-btn" disabled={disabled} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label={`حذف طول ${num(r.l)}`}>
                            <Trash size={16} aria-hidden />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!rows.length && (
                      <tr>
                        <td colSpan={4} className="muted small">
                          برای این قطر هنوز طولی ثبت نشده است.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  addLengths();
                }}
              >
                <label className="f" style={{ flex: 1, minInlineSize: 220 }}>
                  <span>افزودن طول‌ها (چند عدد با فاصله یا ویرگول؛ ردیف‌ها مرتب می‌شوند)</span>
                  <input dir="ltr" value={lens} disabled={disabled} onChange={(e) => setLens(e.target.value)} placeholder="100 110 120" />
                </label>
                <button type="submit" className="btn" disabled={disabled || !lens.trim()} style={{ alignSelf: "end" }}>
                  <Plus size={16} aria-hidden /> افزودن
                </button>
              </form>
              <p className="small muted">
                درب‌های این قطر:{" "}
                {fits.length
                  ? fits.map((x, i) => (
                      <span key={x.id}>
                        {i > 0 && "، "}
                        {locName(x.name, x.id)}
                        {x.compat[shape.id]?.[cur] === "confirm" && <span className="muted"> ({FIT_FA.confirm})</span>}
                      </span>
                    ))
                  : "هیچ؛ در زبانهٔ درب‌ها تعیین کنید."}
              </p>
            </div>
          </>
        ) : (
          <p className="empty small">هنوز قطری ندارد. قطر را به میلی‌متر وارد کنید و «قطر» را بزنید.</p>
        )}
      </div>
    </div>
  );
}
