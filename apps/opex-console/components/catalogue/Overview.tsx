"use client";

import { CheckCircle, Warning } from "@phosphor-icons/react";
import { num } from "@/lib/fa";
import { FIT_FA, diametersOf, locName, type Catalogue, type Issue, type Tab } from "./model";

export const TAB_FA: Record<Tab, string> = {
  overview: "نمای کلی",
  shapes: "شکل‌ها و سایزها",
  closures: "درب‌ها",
  colours: "رنگ‌ها",
  prints: "چاپ",
  structures: "ساختار دیواره",
  samples: "نمونه‌ها",
  import: "ورود از اکسل",
  models: "مدل‌های سه‌بعدی",
};

/** Counts, what needs attention, and every closure's fit across all diameters at a glance. */
export function Overview({ cat, issues, onOpen }: { cat: Catalogue; issues: Issue[]; onOpen: (tab: Tab, id?: string) => void }) {
  const sizes = cat.shapes.reduce((k, s) => k + Object.values(s.sizes).flat().length, 0);
  const diameters = cat.shapes.reduce((k, s) => k + diametersOf(s).length, 0);
  const stats: [string, number, string, Tab][] = [
    ["شکل", cat.shapes.length, `${num(diameters)} قطر · ${num(sizes)} سایز`, "shapes"],
    ["درب", cat.closures.length, `${num(cat.closures.filter((x) => x.model3d || x.models3d).length)} با مدل کارخانه`, "closures"],
    ["روش چاپ", cat.prints?.length ?? 0, "", "prints"],
    ["رنگ بدنه", cat.bodyColours?.length ?? 0, `${num(cat.colourFamilies?.length ?? 0)} خانوادهٔ رنگ درب`, "colours"],
    ["ساختار", cat.structures.length, "", "structures"],
    ["نمونه", cat.samples.length, "", "samples"],
  ];
  const bad = issues.filter((i) => i.level === "bad");
  const cols = cat.shapes.flatMap((s) => diametersOf(s).map((d) => ({ shape: s.id, d })));

  return (
    <div className="stack">
      <div className="stats">
        {stats.map(([k, v, s, tab]) => (
          <button key={k} type="button" className="card stat cm-stat" onClick={() => onOpen(tab)}>
            <span className="k">{k}</span>
            <span className="v">{num(v)}</span>
            {s && <span className="s">{s}</span>}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>موارد قابل بررسی</h2>
          {issues.length ? (
            <span className={`badge ${bad.length ? "bad" : "warn"}`}>
              {num(bad.length)} خطا · {num(issues.length - bad.length)} هشدار
            </span>
          ) : (
            <span className="badge ok">بدون مشکل</span>
          )}
        </div>
        <div className="card-body">
          {issues.length ? (
            <ul className="cm-issues cm-issues-all">
              {issues.slice(0, 60).map((i, k) => (
                <li key={k} data-level={i.level}>
                  <Warning size={14} aria-hidden />
                  <span style={{ flex: 1 }}>{i.text}</span>
                  <button type="button" className="btn sm ghost" onClick={() => onOpen(i.tab, i.id)}>
                    {TAB_FA[i.tab]}
                  </button>
                </li>
              ))}
              {issues.length > 60 && <li className="muted small">و {num(issues.length - 60)} مورد دیگر…</li>}
            </ul>
          ) : (
            <p className="row muted">
              <CheckCircle size={18} aria-hidden /> همه چیز کامل است.
            </p>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>نقشهٔ سازگاری درب‌ها</h2>
          <span className="row small muted" style={{ gap: 12 }}>
            <span>
              <span className="cm-fit" data-fit="chart" aria-hidden="true" /> {FIT_FA.chart}
            </span>
            <span>
              <span className="cm-fit" data-fit="confirm" aria-hidden="true" /> {FIT_FA.confirm}
            </span>
          </span>
        </div>
        <div className="table-wrap cm-coverage">
          <table>
            <caption className="sr-only">سازگاری هر درب با شکل‌ها و قطرها</caption>
            <thead>
              <tr>
                <th scope="col" rowSpan={2}>
                  درب
                </th>
                {cat.shapes.map((s) => (
                  <th key={s.id} scope="colgroup" colSpan={diametersOf(s).length} className="cm-cov-shape">
                    {locName(s.name, s.id)}
                  </th>
                ))}
              </tr>
              <tr>
                {cols.map((c) => (
                  <th key={c.shape + c.d} scope="col" dir="ltr" className="cm-cov-d">
                    {c.d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cat.closures.map((x) => (
                <tr key={x.id}>
                  <th scope="row">
                    <button type="button" className="link" onClick={() => onOpen("closures", x.id)}>
                      {locName(x.name, x.id)}
                    </button>
                  </th>
                  {cols.map((c) => {
                    const v = x.compat[c.shape]?.[c.d];
                    return (
                      <td key={c.shape + c.d} className="cm-cov-cell">
                        {v ? <span className="cm-fit" data-fit={v} /> : null}
                        <span className="sr-only">{v ? FIT_FA[v] : "ندارد"}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
