"use client";

import { ArrowDown, ArrowUp, Plus, Trash } from "@phosphor-icons/react";
import { num } from "@/lib/fa";
import { allDiameters, freshId, locName, type Catalogue, type Issue, type LayerDef, type StructureDef } from "./model";
import { CheckChips, HexInput, IdField, IssueList, ItemTools, LocFields, MasterList, move } from "./parts";

type Props = { cat: Catalogue; set: (fn: (c: Catalogue) => Catalogue) => void; issues: Issue[]; disabled: boolean; selected: string; onSelect: (id: string) => void };

/** Wall build-ups, layers outside → inside, optionally limited to some shapes, diameters or closures. */
export function StructuresEditor({ cat, set, issues, disabled, selected, onSelect }: Props) {
  const index = Math.max(0, cat.structures.findIndex((s) => s.id === selected));
  const s = cat.structures[index];
  const ids = cat.structures.map((x) => x.id);
  const patch = (p: Partial<StructureDef>) => set((c) => ({ ...c, structures: c.structures.map((x, i) => (i === index ? { ...x, ...p } : x)) }));
  const setLayers = (fn: (l: LayerDef[]) => LayerDef[]) => s && patch({ layers: fn(s.layers) });
  const add = () => {
    const id = freshId("structure", ids);
    set((c) => ({ ...c, structures: [...c.structures, { id, name: { fa: "ساختار تازه" }, layers: [] }] }));
    onSelect(id);
  };
  const duplicate = () => {
    if (!s) return;
    const id = freshId(`${s.id}-copy`, ids);
    set((c) => ({ ...c, structures: [...c.structures.slice(0, index + 1), { ...structuredClone(s), id, name: { ...s.name, fa: `${s.name.fa ?? ""} (رونوشت)` } }, ...c.structures.slice(index + 1)] }));
    onSelect(id);
  };

  return (
    <div className="cm-split">
      <MasterList
        label="ساختارها"
        items={cat.structures.map((x) => ({ id: x.id, title: locName(x.name, x.id), sub: `${num(x.layers.length)} لایه`, issues: issues.filter((i) => i.id === x.id).length }))}
        selected={s?.id ?? ""}
        onSelect={onSelect}
        onAdd={add}
        addLabel="ساختار تازه"
        disabled={disabled}
      />
      {s ? (
        <section className="cm-detail" aria-labelledby="cm-structure-title">
          <div className="card">
            <div className="card-head">
              <h2 id="cm-structure-title">{locName(s.name, s.id)}</h2>
              <ItemTools
                what={locName(s.name, s.id)}
                index={index}
                count={cat.structures.length}
                disabled={disabled}
                onMove={(d) => set((c) => ({ ...c, structures: move(c.structures, index, d) }))}
                onDuplicate={duplicate}
                onDelete={() => {
                  if (!confirm(`ساختار «${locName(s.name, s.id)}» حذف شود؟`)) return;
                  set((c) => ({ ...c, structures: c.structures.filter((x) => x.id !== s.id) }));
                  onSelect(cat.structures[index === 0 ? 1 : index - 1]?.id ?? "");
                }}
              />
            </div>
            <div className="card-body stack">
              <IssueList issues={issues.filter((i) => i.id === s.id)} />
              <IdField value={s.id} taken={ids.filter((x) => x !== s.id)} disabled={disabled} onCommit={(to) => (patch({ id: to }), onSelect(to))} />
              <LocFields legend="نام" value={s.name} disabled={disabled} onChange={(name) => patch({ name })} />
              <CheckChips legend="فقط روی این شکل‌ها" hint="همه" options={cat.shapes.map((x) => ({ id: x.id, label: locName(x.name, x.id) }))} value={s.shapes} disabled={disabled} onChange={(shapes) => patch({ shapes })} />
              <CheckChips legend="فقط روی این قطرها" hint="همه" options={allDiameters(cat).map((d) => ({ id: d, label: `Ø${d}` }))} value={s.diameters} disabled={disabled} onChange={(diameters) => patch({ diameters })} />
              <CheckChips legend="فقط با این درب‌ها" hint="همه" options={cat.closures.map((x) => ({ id: x.id, label: locName(x.name, x.id) }))} value={s.closures} disabled={disabled} onChange={(closures) => patch({ closures })} />
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>لایه‌ها (بیرون ← درون)</h2>
              <button type="button" className="btn sm primary" disabled={disabled} onClick={() => setLayers((l) => [...l, { id: freshId("layer", l.map((x) => x.id)), color: "#a9c3d6", name: { fa: "لایهٔ تازه" }, text: {} }])}>
                <Plus size={14} aria-hidden /> لایه
              </button>
            </div>
            <div className="card-body cm-layers">
              <div className="cm-stack-preview" aria-hidden="true">
                {s.layers.map((l, i) => (
                  <span key={i} style={{ background: l.color }} title={locName(l.name, l.id)} />
                ))}
              </div>
              <ol className="cm-rows">
                {s.layers.map((l, i) => (
                  <li key={i} className="cm-row">
                    <div className="cm-row-head">
                      <span className="cm-dot xl" style={{ background: l.color }} aria-hidden="true" />
                      <h3 style={{ flex: 1 }}>
                        {num(i + 1)}. {locName(l.name, l.id)}
                      </h3>
                      <div className="row" style={{ gap: 2 }}>
                        <button type="button" className="btn sm ghost icon-btn" disabled={disabled || i === 0} onClick={() => setLayers((ls) => move(ls, i, -1))} aria-label={`لایهٔ ${locName(l.name, l.id)}: بیرونی‌تر`}>
                          <ArrowUp size={16} aria-hidden />
                        </button>
                        <button type="button" className="btn sm ghost icon-btn" disabled={disabled || i === s.layers.length - 1} onClick={() => setLayers((ls) => move(ls, i, 1))} aria-label={`لایهٔ ${locName(l.name, l.id)}: درونی‌تر`}>
                          <ArrowDown size={16} aria-hidden />
                        </button>
                        <button type="button" className="btn sm ghost icon-btn" disabled={disabled} onClick={() => confirm(`لایهٔ «${locName(l.name, l.id)}» حذف شود؟`) && setLayers((ls) => ls.filter((_, j) => j !== i))} aria-label={`حذف لایهٔ ${locName(l.name, l.id)}`}>
                          <Trash size={16} aria-hidden />
                        </button>
                      </div>
                    </div>
                    <div className="cm-grid-2">
                      <IdField label="شناسهٔ لایه" value={l.id} taken={s.layers.filter((_, j) => j !== i).map((x) => x.id)} disabled={disabled} onCommit={(id) => setLayers((ls) => ls.map((x, j) => (j === i ? { ...x, id } : x)))} />
                      <HexInput label={`رنگ لایهٔ ${locName(l.name, l.id)}`} value={l.color} disabled={disabled} onChange={(color) => setLayers((ls) => ls.map((x, j) => (j === i ? { ...x, color } : x)))} />
                    </div>
                    <LocFields legend="نام لایه" value={l.name} disabled={disabled} onChange={(name) => setLayers((ls) => ls.map((x, j) => (j === i ? { ...x, name } : x)))} />
                    <LocFields legend="کارکرد" value={l.text} disabled={disabled} onChange={(text) => setLayers((ls) => ls.map((x, j) => (j === i ? { ...x, text } : x)))} />
                  </li>
                ))}
                {!s.layers.length && <li className="empty small">لایه‌ای ندارد.</li>}
              </ol>
            </div>
          </div>
        </section>
      ) : (
        <div className="card empty">هنوز ساختاری تعریف نشده است.</div>
      )}
    </div>
  );
}
