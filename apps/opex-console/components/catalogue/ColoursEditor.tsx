"use client";

import { Plus, Trash } from "@phosphor-icons/react";
import { num } from "@/lib/fa";
import { FAMILY_KINDS, freshId, locName, type BodyColour, type Catalogue, type ColourFamily, type Issue } from "./model";
import { ChipList, HexInput, IdField, IssueList, LocFields, move } from "./parts";
import { ArrowDown, ArrowUp } from "@phosphor-icons/react";

type Props = { cat: Catalogue; set: (fn: (c: Catalogue) => Catalogue) => void; issues: Issue[]; disabled: boolean };

/**
 * Cap colour families (fixed ids: the size charts name them, closures list them per diameter) and the
 * tube body colours (free list).
 */
export function ColoursEditor({ cat, set, issues, disabled }: Props) {
  const fams = cat.colourFamilies ?? [];
  const bodies = cat.bodyColours ?? [];
  const patchFam = (i: number, p: Partial<ColourFamily>) => set((c) => ({ ...c, colourFamilies: (c.colourFamilies ?? []).map((f, j) => (j === i ? { ...f, ...p } : f)) }));
  const patchBody = (i: number, p: Partial<BodyColour>) => set((c) => ({ ...c, bodyColours: (c.bodyColours ?? []).map((b, j) => (j === i ? { ...b, ...p } : b)) }));
  const used = (id: string) => cat.closures.filter((x) => Object.values(x.colours ?? {}).some((m) => Object.values(m).some((l) => l.includes(id as ColourFamily["id"])))).length;

  return (
    <div className="stack">
      <IssueList issues={issues} />
      <div className="card">
        <div className="card-head">
          <h2>رنگ‌های درب</h2>
          <span className="small muted">پنج خانوادهٔ جدول سایز آراپوش؛ برای هر درب در زبانهٔ درب‌ها، به تفکیک قطر انتخاب می‌شوند.</span>
        </div>
        <ul className="cm-rows">
          {fams.map((f, i) => (
            <li key={f.id} className="cm-row">
              <div className="cm-row-head">
                <span className="cm-dot xl" style={{ background: f.swatch }} aria-hidden="true" />
                <div className="stack" style={{ gap: 0 }}>
                  <h3>{locName(f.name, f.id)}</h3>
                  <span className="small muted">
                    <code>{f.id}</code> · {num(used(f.id))} درب
                  </span>
                </div>
              </div>
              <div className="cm-grid-3">
                <label className="f">
                  <span>نوع</span>
                  <select value={f.kind} disabled={disabled} onChange={(e) => patchFam(i, { kind: e.target.value as ColourFamily["kind"] })}>
                    {FAMILY_KINDS.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.fa}
                      </option>
                    ))}
                  </select>
                </label>
                <HexInput label={`رنگ نمونهٔ ${locName(f.name, f.id)}`} value={f.swatch} disabled={disabled} onChange={(swatch) => patchFam(i, { swatch })} />
              </div>
              <LocFields legend="نام" value={f.name} disabled={disabled} onChange={(name) => patchFam(i, { name })} />
              {f.kind === "custom" && <ChipList label="پالت پیشنهادی (کد رنگ)" ltr swatch values={f.palette} disabled={disabled} placeholder="#1f5f9f" onChange={(palette) => patchFam(i, { palette: palette.length ? palette : undefined })} />}
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>رنگ بدنهٔ تیوب</h2>
          <button
            type="button"
            className="btn sm primary"
            disabled={disabled}
            onClick={() => set((c) => ({ ...c, bodyColours: [...(c.bodyColours ?? []), { id: freshId("colour", (c.bodyColours ?? []).map((b) => b.id)), name: { fa: "رنگ تازه" }, hex: "#ffffff" }] }))}
          >
            <Plus size={14} aria-hidden /> رنگ بدنه
          </button>
        </div>
        <ul className="cm-rows">
          {bodies.map((b, i) => (
            <li key={i} className="cm-row">
              <div className="cm-row-head">
                <span className="cm-dot xl" style={{ background: b.hex }} aria-hidden="true" />
                <h3 style={{ flex: 1 }}>{locName(b.name, b.id)}</h3>
                <div className="row" style={{ gap: 2 }}>
                  <button type="button" className="btn sm ghost icon-btn" disabled={disabled || i === 0} onClick={() => set((c) => ({ ...c, bodyColours: move(c.bodyColours ?? [], i, -1) }))} aria-label={`${locName(b.name, b.id)}: یکی بالاتر`}>
                    <ArrowUp size={16} aria-hidden />
                  </button>
                  <button type="button" className="btn sm ghost icon-btn" disabled={disabled || i === bodies.length - 1} onClick={() => set((c) => ({ ...c, bodyColours: move(c.bodyColours ?? [], i, 1) }))} aria-label={`${locName(b.name, b.id)}: یکی پایین‌تر`}>
                    <ArrowDown size={16} aria-hidden />
                  </button>
                  <button type="button" className="btn sm danger" disabled={disabled} onClick={() => confirm(`رنگ «${locName(b.name, b.id)}» حذف شود؟`) && set((c) => ({ ...c, bodyColours: (c.bodyColours ?? []).filter((_, j) => j !== i) }))}>
                    <Trash size={16} aria-hidden /> حذف
                  </button>
                </div>
              </div>
              <div className="cm-grid-3">
                <IdField value={b.id} taken={bodies.filter((_, j) => j !== i).map((x) => x.id)} disabled={disabled} onCommit={(id) => patchBody(i, { id })} />
                <HexInput label={`کد رنگ ${locName(b.name, b.id)}`} value={b.hex} disabled={disabled} onChange={(hex) => patchBody(i, { hex })} />
              </div>
              <LocFields legend="نام" value={b.name} disabled={disabled} onChange={(name) => patchBody(i, { name })} />
            </li>
          ))}
          {!bodies.length && <li className="empty small">رنگ بدنه‌ای تعریف نشده؛ تیوب سفید نمایش داده می‌شود.</li>}
        </ul>
      </div>
    </div>
  );
}
