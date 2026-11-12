"use client";

import { PRINT_EFFECTS, allDiameters, freshId, locName, removePrint, renamePrint, type Catalogue, type Issue, type PrintDef } from "./model";
import { CheckChips, HexInput, IdField, ImagePick, IssueList, ItemTools, LocFields, MasterList, move, numOrUndef } from "./parts";
import { num } from "@/lib/fa";

type Props = { cat: Catalogue; set: (fn: (c: Catalogue) => Catalogue) => void; issues: Issue[]; disabled: boolean; selected: string; onSelect: (id: string) => void };

/** Print methods offered in the configurator (ids match the printing page), with their 3D look. */
export function PrintsEditor({ cat, set, issues, disabled, selected, onSelect }: Props) {
  const prints = cat.prints ?? [];
  const index = Math.max(0, prints.findIndex((p) => p.id === selected));
  const p = prints[index];
  const ids = prints.map((x) => x.id);
  const patch = (v: Partial<PrintDef>) => set((c) => ({ ...c, prints: (c.prints ?? []).map((x, i) => (i === index ? { ...x, ...v } : x)) }));
  const add = () => {
    const id = freshId("print", ids);
    set((c) => ({ ...c, prints: [...(c.prints ?? []), { id, name: { fa: "روش چاپ تازه" }, effect: "flat" }] }));
    onSelect(id);
  };
  const del = () => {
    if (!p) return;
    const n = cat.samples.filter((s) => s.print === p.id).length;
    if (!confirm(`روش چاپ «${locName(p.name, p.id)}» حذف شود؟${n ? `\n\nروش چاپ ${num(n)} نمونه خالی می‌شود.` : ""}`)) return;
    set((c) => removePrint(c, p.id));
    onSelect(prints[index === 0 ? 1 : index - 1]?.id ?? "");
  };
  const foil = p?.effect === "foil" || p?.effect === "combo";

  return (
    <div className="cm-split">
      <MasterList
        label="روش‌های چاپ"
        items={prints.map((x) => ({ id: x.id, title: locName(x.name, x.id), sub: `${PRINT_EFFECTS.find((e) => e.id === x.effect)?.fa ?? x.effect}${x.colours ? ` · تا ${num(x.colours)} رنگ` : ""}`, swatch: x.foil, issues: issues.filter((i) => i.id === x.id).length }))}
        selected={p?.id ?? ""}
        onSelect={onSelect}
        onAdd={add}
        addLabel="روش تازه"
        disabled={disabled}
      />
      {p ? (
        <section className="cm-detail" aria-labelledby="cm-print-title">
          <div className="card">
            <div className="card-head">
              <h2 id="cm-print-title">{locName(p.name, p.id)}</h2>
              <ItemTools what={locName(p.name, p.id)} index={index} count={prints.length} disabled={disabled} onMove={(d) => set((c) => ({ ...c, prints: move(c.prints ?? [], index, d) }))} onDelete={del} />
            </div>
            <div className="card-body stack">
              <IssueList issues={issues.filter((i) => i.id === p.id)} />
              <div className="cm-grid-3">
                <IdField value={p.id} taken={ids.filter((x) => x !== p.id)} disabled={disabled} onCommit={(to) => (set((c) => renamePrint(c, p.id, to)), onSelect(to))} />
                <label className="f">
                  <span>نما در سه‌بعدی</span>
                  <select value={p.effect} disabled={disabled} onChange={(e) => patch({ effect: e.target.value as PrintDef["effect"] })}>
                    {PRINT_EFFECTS.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.fa}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="f">
                  <span>حداکثر تعداد رنگ</span>
                  <input type="number" dir="ltr" min={1} max={20} value={p.colours ?? ""} disabled={disabled} onChange={(e) => patch({ colours: numOrUndef(e.target.value) })} />
                </label>
              </div>
              <LocFields legend="نام" value={p.name} disabled={disabled} onChange={(name) => patch({ name })} />
              <LocFields legend="توضیح کوتاه" multiline value={p.note} disabled={disabled} onChange={(note) => patch({ note })} />
              <div className="cm-grid-2">
                {foil ? <HexInput label="رنگ فویل" value={p.foil} disabled={disabled} onChange={(v) => patch({ foil: v || undefined })} /> : <div />}
                <ImagePick label="طرح نمونه (اختیاری)" value={p.artwork} disabled={disabled} onChange={(v) => patch({ artwork: v || undefined })} />
              </div>
              <CheckChips legend="فقط روی این شکل‌ها" hint="همه" options={cat.shapes.map((s) => ({ id: s.id, label: locName(s.name, s.id) }))} value={p.shapes} disabled={disabled} onChange={(shapes) => patch({ shapes })} />
              <CheckChips legend="فقط روی این قطرها" hint="همه" options={allDiameters(cat).map((d) => ({ id: d, label: `Ø${d}` }))} value={p.diameters} disabled={disabled} onChange={(diameters) => patch({ diameters })} />
            </div>
          </div>
        </section>
      ) : (
        <div className="card empty">هنوز روش چاپی تعریف نشده است.</div>
      )}
    </div>
  );
}
