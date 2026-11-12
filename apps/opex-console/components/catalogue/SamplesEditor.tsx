"use client";

import { diametersOf, freshId, locName, type Catalogue, type Issue, type SampleDef } from "./model";
import { IdField, ImagePick, IssueList, ItemTools, LocFields, MasterList, move } from "./parts";

type Props = { cat: Catalogue; set: (fn: (c: Catalogue) => Catalogue) => void; issues: Issue[]; disabled: boolean; selected: string; onSelect: (id: string) => void };

/**
 * Sample photos under the configurator. The tags rank them: shape is required; closure, diameter,
 * print and cap colour make a sample rise when the visitor's choice matches.
 */
export function SamplesEditor({ cat, set, issues, disabled, selected, onSelect }: Props) {
  const index = Math.max(0, cat.samples.findIndex((s) => s.id === selected));
  const s = cat.samples[index];
  const ids = cat.samples.map((x) => x.id);
  const patch = (p: Partial<SampleDef>) => set((c) => ({ ...c, samples: c.samples.map((x, i) => (i === index ? { ...x, ...p } : x)) }));
  const add = () => {
    const id = freshId("sample", ids);
    set((c) => ({ ...c, samples: [...c.samples, { id, image: "", shape: c.shapes[0]?.id ?? "", title: { fa: "نمونهٔ تازه" } }] }));
    onSelect(id);
  };
  const shape = cat.shapes.find((x) => x.id === s?.shape);
  const closures = shape ? cat.closures.filter((x) => x.compat[shape.id]) : cat.closures;

  return (
    <div className="cm-split">
      <MasterList
        label="نمونه‌ها"
        items={cat.samples.map((x) => ({ id: x.id, title: locName(x.title, x.id), sub: [locName(cat.shapes.find((y) => y.id === x.shape)?.name, x.shape), x.d && `⁨Ø${x.d}⁩`, locName(cat.closures.find((y) => y.id === x.closure)?.name, "")].filter(Boolean).join(" · "), image: x.image, issues: issues.filter((i) => i.id === x.id).length }))}
        selected={s?.id ?? ""}
        onSelect={onSelect}
        onAdd={add}
        addLabel="نمونهٔ تازه"
        disabled={disabled}
      />
      {s ? (
        <section className="cm-detail" aria-labelledby="cm-sample-title">
          <div className="card">
            <div className="card-head">
              <h2 id="cm-sample-title">{locName(s.title, s.id)}</h2>
              <ItemTools
                what={locName(s.title, s.id)}
                index={index}
                count={cat.samples.length}
                disabled={disabled}
                onMove={(d) => set((c) => ({ ...c, samples: move(c.samples, index, d) }))}
                onDelete={() => {
                  if (!confirm(`نمونهٔ «${locName(s.title, s.id)}» حذف شود؟`)) return;
                  set((c) => ({ ...c, samples: c.samples.filter((x) => x.id !== s.id) }));
                  onSelect(cat.samples[index === 0 ? 1 : index - 1]?.id ?? "");
                }}
              />
            </div>
            <div className="card-body stack">
              <IssueList issues={issues.filter((i) => i.id === s.id)} />
              <div className="cm-grid-2">
                <ImagePick label="عکس نمونه" value={s.image} disabled={disabled} onChange={(image) => patch({ image })} />
                <IdField value={s.id} taken={ids.filter((x) => x !== s.id)} disabled={disabled} onCommit={(to) => (patch({ id: to }), onSelect(to))} />
              </div>
              <LocFields legend="عنوان" value={s.title} disabled={disabled} onChange={(title) => patch({ title })} />
              <fieldset className="cm-fieldset">
                <legend>برچسب‌های رتبه‌بندی</legend>
                <div className="cm-grid-4">
                  <label className="f">
                    <span>شکل (لازم)</span>
                    <select value={s.shape} disabled={disabled} onChange={(e) => patch({ shape: e.target.value, d: undefined })} aria-invalid={!shape || undefined}>
                      {!shape && <option value={s.shape}>—</option>}
                      {cat.shapes.map((x) => (
                        <option key={x.id} value={x.id}>
                          {locName(x.name, x.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="f">
                    <span>قطر</span>
                    <select value={s.d ?? ""} disabled={disabled} onChange={(e) => patch({ d: e.target.value ? Number(e.target.value) : undefined })}>
                      <option value="">هر قطری</option>
                      {diametersOf(shape).map((d) => (
                        <option key={d} value={d}>
                          Ø{d}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="f">
                    <span>درب</span>
                    <select value={s.closure ?? ""} disabled={disabled} onChange={(e) => patch({ closure: e.target.value || undefined })}>
                      <option value="">هر دربی</option>
                      {closures.map((x) => (
                        <option key={x.id} value={x.id}>
                          {locName(x.name, x.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="f">
                    <span>روش چاپ</span>
                    <select value={s.print ?? ""} disabled={disabled} onChange={(e) => patch({ print: e.target.value || undefined })}>
                      <option value="">هر روشی</option>
                      {(cat.prints ?? []).map((x) => (
                        <option key={x.id} value={x.id}>
                          {locName(x.name, x.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="f">
                    <span>رنگ درب</span>
                    <select value={s.colour ?? ""} disabled={disabled} onChange={(e) => patch({ colour: e.target.value || undefined })}>
                      <option value="">هر رنگی</option>
                      {(cat.colourFamilies ?? []).map((x) => (
                        <option key={x.id} value={x.id}>
                          {locName(x.name, x.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </fieldset>
            </div>
          </div>
        </section>
      ) : (
        <div className="card empty">هنوز نمونه‌ای نیست.</div>
      )}
    </div>
  );
}
