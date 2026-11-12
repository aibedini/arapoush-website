"use client";

import { CubeTransparent } from "@phosphor-icons/react";
import { num } from "@/lib/fa";
import {
  CLOSURE_MODELS,
  COLOUR_IDS,
  FIT_FA,
  SHAPE_MODELS,
  closureUses,
  diametersOf,
  freshId,
  locName,
  removeClosure,
  renameClosure,
  type Catalogue,
  type ClosureDef,
  type ClosureShape,
  type ColourId,
  type Fit,
  type Issue,
  type Tab,
} from "./model";
import { ChipList, IdField, ImagePick, IssueList, ItemTools, LocFields, MasterList, move, numOrUndef } from "./parts";

type Props = { cat: Catalogue; set: (fn: (c: Catalogue) => Catalogue) => void; issues: Issue[]; disabled: boolean; selected: string; onSelect: (id: string) => void; onTab: (t: Tab) => void };

const fitCount = (x: ClosureDef) => Object.values(x.compat).reduce((k, m) => k + Object.keys(m).length, 0);

/** Closures: identity, the 3D look and where each one fits, with its colours per diameter. */
export function ClosuresEditor({ cat, set, issues, disabled, selected, onSelect, onTab }: Props) {
  const index = Math.max(0, cat.closures.findIndex((x) => x.id === selected));
  const x = cat.closures[index];
  const ids = cat.closures.map((c) => c.id);
  const patch = (p: Partial<ClosureDef>) => set((c) => ({ ...c, closures: c.closures.map((y, i) => (i === index ? { ...y, ...p } : y)) }));
  const add = () => {
    const id = freshId("closure", ids);
    set((c) => ({ ...c, closures: [...c.closures, { id, model: "param", name: { fa: "درب تازه" }, image: "", compat: {}, shape3d: { body: "round", width: 1.05, height: 0.9, top: "flat" } }] }));
    onSelect(id);
  };
  const duplicate = () => {
    if (!x) return;
    const id = freshId(`${x.id}-copy`, ids);
    const rest = { ...x, model3d: undefined, models3d: undefined };
    set((c) => ({ ...c, closures: [...c.closures.slice(0, index + 1), { ...structuredClone(rest), id, name: { ...x.name, fa: `${x.name.fa ?? ""} (رونوشت)` } }, ...c.closures.slice(index + 1)] }));
    onSelect(id);
  };
  const del = () => {
    if (!x) return;
    const u = closureUses(cat, x.id);
    const more = [u.structures.length && `${num(u.structures.length)} ساختار از محدودیت‌شان کنار می‌گذارند`, u.samples.length && `درب ${num(u.samples.length)} نمونه خالی می‌شود`].filter(Boolean);
    if (!confirm(`درب «${locName(x.name, x.id)}» حذف شود؟${more.length ? "\n\n" + more.join("\n") : ""}`)) return;
    set((c) => removeClosure(c, x.id));
    onSelect(cat.closures[index === 0 ? 1 : index - 1]?.id ?? "");
  };

  return (
    <div className="cm-split">
      <MasterList
        label="درب‌ها"
        items={cat.closures.map((c) => ({
          id: c.id,
          title: locName(c.name, c.id),
          sub: `${CLOSURE_MODELS.find((m) => m.id === c.model)?.fa ?? c.model} · ${num(fitCount(c))} قطر`,
          image: c.image,
          issues: issues.filter((i) => i.tab === "closures" && i.id === c.id).length,
          badge: c.model3d || c.models3d ? <span className="badge ok" title="مدل سه‌بعدی کارخانه">CAD</span> : undefined,
        }))}
        selected={x?.id ?? ""}
        onSelect={onSelect}
        onAdd={add}
        addLabel="درب تازه"
        disabled={disabled}
      />
      {x ? (
        <section className="cm-detail" aria-labelledby="cm-closure-title">
          <div className="card">
            <div className="card-head">
              <h2 id="cm-closure-title">{locName(x.name, x.id)}</h2>
              <ItemTools what={locName(x.name, x.id)} index={index} count={cat.closures.length} disabled={disabled} onMove={(d) => set((c) => ({ ...c, closures: move(c.closures, index, d) }))} onDuplicate={duplicate} onDelete={del} />
            </div>
            <div className="card-body stack">
              <IssueList issues={issues.filter((i) => i.tab === "closures" && i.id === x.id)} />
              <div className="cm-grid-2">
                <IdField value={x.id} taken={ids.filter((y) => y !== x.id)} disabled={disabled} onCommit={(to) => (set((c) => renameClosure(c, x.id, to)), onSelect(to))} />
                <ImagePick label="تصویر درب" value={x.image} disabled={disabled} onChange={(image) => patch({ image })} />
              </div>
              <LocFields legend="نام" value={x.name} disabled={disabled} onChange={(name) => patch({ name })} />
              <ChipList label="نام‌ها در جدول اکسل" values={x.aliases} disabled={disabled} placeholder="مثلاً: فلیپ تاپ" onChange={(aliases) => patch({ aliases: aliases.length ? aliases : undefined })} />
            </div>
          </div>

          <FitMatrix cat={cat} x={x} disabled={disabled} patch={patch} />
          <Look cat={cat} x={x} disabled={disabled} patch={patch} onTab={onTab} />
        </section>
      ) : (
        <div className="card empty">هنوز دربی تعریف نشده است.</div>
      )}
    </div>
  );
}

/**
 * Where the closure fits: one table per shape, diameters across. The first row is the fit (none,
 * listed in the chart, or offered pending sign-off); the rows under it are the cap colours offered
 * at that diameter. Colours of a diameter without a fit are kept but not offered.
 */
export function FitMatrix({ cat, x, disabled, patch }: { cat: Catalogue; x: ClosureDef; disabled: boolean; patch: (p: Partial<ClosureDef>) => void }) {
  const fams = cat.colourFamilies?.length ? cat.colourFamilies : COLOUR_IDS.map((id) => ({ id, name: { fa: id }, swatch: "#ccc", kind: "solid" as const }));
  const setFit = (shape: string, d: string, v: Fit | "") => {
    const m = { ...(x.compat[shape] ?? {}) };
    if (v) m[d] = v;
    else delete m[d];
    const compat = { ...x.compat, [shape]: m };
    if (!Object.keys(m).length) delete compat[shape];
    const colours = x.colours ? { ...x.colours } : {};
    // A new fit starts with the colours of its nearest fitted neighbour, or white.
    if (v && !x.colours?.[shape]?.[d]?.length) {
      const near = Object.keys(x.colours?.[shape] ?? {}).sort((a, b) => Math.abs(Number(a) - Number(d)) - Math.abs(Number(b) - Number(d)))[0];
      colours[shape] = { ...(colours[shape] ?? {}), [d]: near ? [...x.colours![shape]![near]!] : ["white"] };
    }
    patch({ compat, colours: Object.keys(colours).length ? colours : undefined });
  };
  const setColour = (shape: string, d: string, id: ColourId, on: boolean) => {
    const cur = x.colours?.[shape]?.[d] ?? [];
    const next = on ? COLOUR_IDS.filter((c) => c === id || cur.includes(c)) : cur.filter((c) => c !== id);
    const byD = { ...(x.colours?.[shape] ?? {}), [d]: next };
    if (!next.length) delete byD[d];
    const colours = { ...(x.colours ?? {}), [shape]: byD };
    if (!Object.keys(byD).length) delete colours[shape];
    patch({ colours: Object.keys(colours).length ? colours : undefined });
  };
  const fillRow = (shape: string, ds: string[], v: Fit | "") => {
    const m: Record<string, Fit> = {};
    if (v) for (const d of ds) m[d] = x.compat[shape]?.[d] ?? v;
    const compat = { ...x.compat };
    if (v) compat[shape] = m;
    else delete compat[shape];
    patch({ compat });
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2>سازگاری و رنگ‌ها</h2>
        <span className="small muted">
          {num(fitCount(x))} قطر · «{FIT_FA.confirm}» یعنی پیشنهاد می‌شود ولی هنوز در جدول آراپوش نیامده
        </span>
      </div>
      <div className="card-body stack">
        {cat.shapes.map((s) => {
          const ds = diametersOf(s);
          if (!ds.length) return null;
          const shapeName = locName(s.name, s.id);
          const needs = x.shoulder && x.shoulder !== s.model && !(x.shoulder === "eyeNozzle" && s.model !== "oval");
          return (
            <div key={s.id} className="cm-matrix">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h3>{shapeName}</h3>
                <div className="row" style={{ gap: 4 }}>
                  <button type="button" className="btn sm ghost" disabled={disabled} onClick={() => fillRow(s.id, ds, "confirm")} aria-label={`همه: نیاز به تأیید (${shapeName})`}>
                    همه: نیاز به تأیید
                  </button>
                  <button type="button" className="btn sm ghost" disabled={disabled || !x.compat[s.id]} onClick={() => fillRow(s.id, ds, "")} aria-label={`هیچ‌کدام (${shapeName})`}>
                    هیچ‌کدام
                  </button>
                </div>
              </div>
              {needs && <p className="small muted">شانهٔ این درب «{SHAPE_MODELS.find((m) => m.id === x.shoulder)?.fa}» است.</p>}
              <div className="table-wrap">
                <table>
                  <caption className="sr-only">
                    سازگاری {locName(x.name, x.id)} با {shapeName}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">قطر (mm)</th>
                      {ds.map((d) => (
                        <th key={d} scope="col" className="cm-mx-d" dir="ltr">
                          Ø{d}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">سازگاری</th>
                      {ds.map((d) => {
                        const v = x.compat[s.id]?.[d] ?? "";
                        return (
                          <td key={d} className="cm-mx-cell" data-fit={v || "none"}>
                            <select value={v} disabled={disabled} aria-label={`${shapeName} Ø${d}: سازگاری`} onChange={(e) => setFit(s.id, d, e.target.value as Fit | "")}>
                              <option value="">—</option>
                              <option value="chart">{FIT_FA.chart}</option>
                              <option value="confirm">{FIT_FA.confirm}</option>
                            </select>
                          </td>
                        );
                      })}
                    </tr>
                    {fams.map((f) => (
                      <tr key={f.id}>
                        <th scope="row">
                          <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                            <span className="cm-dot" style={{ background: f.swatch }} aria-hidden="true" />
                            {locName(f.name, f.id)}
                          </span>
                        </th>
                        {ds.map((d) => {
                          const fit = !!x.compat[s.id]?.[d];
                          const on = !!x.colours?.[s.id]?.[d]?.includes(f.id);
                          return (
                            <td key={d} className="cm-mx-cell" data-off={!fit || undefined}>
                              <label className="cm-mx-hit">
                                <input type="checkbox" checked={on} disabled={disabled || !fit} aria-label={`${shapeName} Ø${d}: ${locName(f.name, f.id)}`} onChange={(e) => setColour(s.id, d, f.id, e.target.checked)} />
                              </label>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const RATIOS: { k: keyof ClosureShape; label: string; min: number; max: number; step: number }[] = [
  { k: "width", label: "پهنا (× شعاع تیوب)", min: 0.4, max: 1.4, step: 0.01 },
  { k: "height", label: "ارتفاع دامنه (× شعاع)", min: 0.2, max: 4, step: 0.05 },
  { k: "topHeight", label: "ارتفاع سر (× شعاع)", min: 0, max: 3, step: 0.05 },
  { k: "ribs", label: "شیار دور درب", min: 0, max: 120, step: 1 },
];

/** How the closure is drawn: the 3D family, parametric shape and the approved factory model. */
function Look({ cat, x, disabled, patch, onTab }: { cat: Catalogue; x: ClosureDef; disabled: boolean; patch: (p: Partial<ClosureDef>) => void; onTab: (t: Tab) => void }) {
  const s = x.shape3d ?? {};
  const set3d = (p: Partial<ClosureShape>) => patch({ shape3d: { ...s, ...p } });
  const param = x.model === "param" || x.model === "nozzle";
  return (
    <div className="card">
      <div className="card-head">
        <h2>نمای سه‌بعدی</h2>
        {x.model3d || x.models3d ? <span className="badge ok">مدل کارخانه تأییدشده</span> : <span className="badge">مدل ساخته‌شده از پارامترها</span>}
      </div>
      <div className="card-body stack">
        <div className="cm-grid-2">
          <label className="f">
            <span>خانوادهٔ سه‌بعدی</span>
            <select value={x.model} disabled={disabled} onChange={(e) => patch({ model: e.target.value as ClosureDef["model"] })} aria-describedby="cm-model-hint">
              {CLOSURE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fa}
                </option>
              ))}
            </select>
            <small id="cm-model-hint" className="small muted">
              {CLOSURE_MODELS.find((m) => m.id === x.model)?.hint}
            </small>
          </label>
          <label className="f">
            <span>شانهٔ تیوب</span>
            <select value={x.shoulder ?? ""} disabled={disabled} onChange={(e) => patch({ shoulder: (e.target.value || undefined) as ClosureDef["shoulder"] })}>
              <option value="">همان شکل تیوب</option>
              {SHAPE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fa}
                </option>
              ))}
            </select>
          </label>
        </div>
        {param && (
          <fieldset className="cm-fieldset">
            <legend>شکل پارامتری</legend>
            <div className="cm-grid-4">
              <label className="f">
                <span>بدنه</span>
                <select value={s.body ?? "round"} disabled={disabled} onChange={(e) => set3d({ body: e.target.value as ClosureShape["body"] })}>
                  <option value="round">گرد</option>
                  <option value="octagon">هشت‌ضلعی</option>
                </select>
              </label>
              <label className="f">
                <span>سر درب</span>
                <select value={s.top ?? "flat"} disabled={disabled} onChange={(e) => set3d({ top: e.target.value as ClosureShape["top"] })}>
                  <option value="flat">تخت</option>
                  <option value="dome">گنبدی</option>
                  <option value="cone">مخروطی</option>
                  <option value="bullet">گلوله‌ای</option>
                </select>
              </label>
              {RATIOS.map((r) => (
                <label key={r.k} className="f">
                  <span>{r.label}</span>
                  <input type="number" dir="ltr" min={r.min} max={r.max} step={r.step} value={(s[r.k] as number | undefined) ?? ""} disabled={disabled} onChange={(e) => set3d({ [r.k]: numOrUndef(e.target.value) })} />
                </label>
              ))}
            </div>
            <div className="row" style={{ gap: 16 }}>
              <label className="check">
                <input type="checkbox" checked={!!s.oval} disabled={disabled} onChange={(e) => set3d({ oval: e.target.checked || undefined })} />
                <span>بیضی (هم‌شکل تیوب بیضی)</span>
              </label>
              <label className="check">
                <input type="checkbox" checked={!!s.pump} disabled={disabled} onChange={(e) => set3d({ pump: e.target.checked || undefined })} />
                <span>پمپ ایرلس (خط جدایش)</span>
              </label>
            </div>
          </fieldset>
        )}
        <div className="cm-model3d">
          <CubeTransparent size={22} aria-hidden />
          {x.model3d || x.models3d ? (
            <div className="stack" style={{ gap: 2 }}>
              {x.model3d && (
                <span>
                  مدل کارخانه برای همهٔ قطرها: گلویی <span dir="ltr">Ø{x.model3d.neckDiameterMm} mm</span>، دهانه رو به <code>{x.model3d.axis}</code>.
                </span>
              )}
              {x.models3d && (
                <span>
                  مدل کارخانهٔ ویژهٔ قطر:{" "}
                  {Object.entries(x.models3d)
                    .flatMap(([shape, ds]) => Object.keys(ds).map((d) => `${locName(cat.shapes.find((s) => s.id === shape)?.name, shape)} Ø${d}`))
                    .join("، ")}
                </span>
              )}
              <span className="small muted">پارامترهای بالا جایگزین می‌مانند برای قطرهای بدون مدل یا اگر فایل در دسترس نباشد.</span>
            </div>
          ) : (
            <span>هنوز فایل STEP یا GLB کارخانه برای این درب تأیید نشده است.</span>
          )}
          <button type="button" className="btn sm" onClick={() => onTab("models")}>
            مدل‌های سه‌بعدی
          </button>
        </div>
      </div>
    </div>
  );
}
