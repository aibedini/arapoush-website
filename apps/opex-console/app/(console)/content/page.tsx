"use client";

import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { ago, num, when } from "@/lib/fa";
import { ErrorNote, Loading, PageHead } from "@/components/ui";

type Entry = { id: string; type_key: string; draft_number: number | null; draft_at: string | null; published_number: number | null; published_at: string | null; scheduled_at: string | null; unpublished_changes: boolean; open_crs: number };
type Type = { key: string; label: string };

const GROUP = (k: string) => (k.startsWith("global.") ? "سراسری" : k.startsWith("page.home") ? "صفحهٔ اصلی" : k.startsWith("product.") ? "محصولات" : "صفحه‌ها");

export default function ContentList() {
  const entries = useApi<Entry[]>("/v1/manage/entries");
  const types = useApi<Type[]>("/v1/manage/types");
  const label = (k: string) => types.data?.find((t) => t.key === k)?.label ?? k;
  const groups = new Map<string, Entry[]>();
  for (const e of entries.data ?? []) groups.set(GROUP(e.type_key), [...(groups.get(GROUP(e.type_key)) ?? []), e]);

  return (
    <>
      <PageHead title="محتوا" sub="همهٔ متن‌ها و تصویرهای سایت؛ هر ذخیره یک نسخهٔ تازه می‌سازد و تا انتشار روی سایت نمی‌رود." />
      <ErrorNote error={entries.error} />
      {entries.loading && !entries.data ? (
        <Loading rows={8} />
      ) : (
        <div className="grid">
          {[...groups].map(([g, list]) => (
            <section key={g} className="card" aria-label={g}>
              <div className="card-head">
                <h2>{g}</h2>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>محتوا</th>
                      <th>وضعیت</th>
                      <th>پیش‌نویس</th>
                      <th>منتشرشده</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <Link href={`/content/${encodeURIComponent(e.type_key)}`} style={{ fontWeight: 600 }}>
                            {label(e.type_key)}
                          </Link>
                          <div>
                            <code className="small muted">{e.type_key}</code>
                          </div>
                        </td>
                        <td>
                          <div className="row">
                            {e.unpublished_changes ? <span className="badge warn">تغییرات منتشرنشده</span> : <span className="badge ok">به‌روز</span>}
                            {e.scheduled_at && <span className="badge accent">زمان‌بندی: {when(e.scheduled_at)}</span>}
                            {e.open_crs > 0 && <span className="badge accent">{num(e.open_crs)} درخواست تغییر</span>}
                          </div>
                        </td>
                        <td className="small">
                          نسخهٔ {num(e.draft_number)} <span className="muted">· {ago(e.draft_at)}</span>
                        </td>
                        <td className="small">{e.published_number ? <>نسخهٔ {num(e.published_number)} <span className="muted">· {ago(e.published_at)}</span></> : <span className="muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
