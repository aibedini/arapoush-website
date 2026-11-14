"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api, previewSrc } from "@/lib/api";
import { can, useAction, useApi, useMe } from "@/lib/hooks";
import { ago, num, when } from "@/lib/fa";
import { ErrorNote, Loading, PageHead } from "@/components/ui";
import { LOCALE_NAME, nm, STATUS, type PostSummary, type Status, type Taxonomy } from "./_components/lib";

const FILTERS: ["" | Status | "mine", string][] = [
  ["", "همه"],
  ["draft", "پیش‌نویس"],
  ["review", "در انتظار بازبینی"],
  ["scheduled", "زمان‌بندی‌شده"],
  ["published", "منتشرشده"],
  ["mine", "مال من"],
  ["archived", "بایگانی"],
];

/** The journal in OPEX: every post with its state and languages; editors see what waits for review. */
export default function BlogList() {
  const me = useMe();
  const router = useRouter();
  const [filter, setFilter] = useState<"" | Status | "mine">("");
  const [q, setQ] = useState("");
  const qs = filter === "mine" ? "?mine=1" : filter ? `?status=${filter}` : "";
  const posts = useApi<PostSummary[]>(`/v1/manage/blog/posts${qs}`);
  const tax = useApi<Taxonomy>("/v1/manage/blog/taxonomy");
  const act = useAction();
  const all = useMemo(() => posts.data ?? [], [posts.data]);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? all.filter((p) => Object.values(p.titles).some((t) => t?.toLowerCase().includes(n))) : all;
  }, [all, q]);
  const cat = (id: string | null) => nm(tax.data?.categories.find((c) => c.id === id)?.name);
  const author = (id: string | null) => nm(tax.data?.authors.find((a) => a.id === id)?.name);
  const review = all.filter((p) => p.status === "review").length;

  const create = () =>
    act.run(async () => {
      const r = await api<{ id: string }>("/v1/manage/blog/posts", { body: {} });
      router.push(`/blog/${r.id}`);
    });

  return (
    <>
      <PageHead title="بلاگ (مجله)" sub="مقاله‌های سایت به سه زبان؛ با سئو و GEO، تاریخچهٔ نسخه‌ها، پیش‌نمایش، زمان‌بندی و بازبینی پیش از انتشار.">
        {can(me, "blog.manage") && (
          <Link className="btn" href="/blog/settings">
            دسته‌ها، برچسب‌ها و نویسنده‌ها
          </Link>
        )}
        {can(me, "blog.write") && (
          <button type="button" className="btn primary" onClick={create} disabled={act.busy}>
            مقالهٔ تازه
          </button>
        )}
      </PageHead>
      <div className="grid">
        <ErrorNote error={act.error ?? posts.error} />
        {review > 0 && can(me, "blog.publish") && filter !== "review" && (
          <button type="button" className="note warn" style={{ textAlign: "start", cursor: "pointer" }} onClick={() => setFilter("review")}>
            {num(review)} مقاله در انتظار بازبینی شماست.
          </button>
        )}
        <section className="card" aria-label="فهرست مقاله‌ها">
          <div className="card-body filters">
            <label className="f">
              <span>جست‌وجو در عنوان‌ها</span>
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <label className="f">
              <span>وضعیت</span>
              <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
                {FILTERS.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!posts.data ? (
            <div className="card-body">
              <Loading />
            </div>
          ) : shown.length === 0 ? (
            <div className="empty">{all.length ? "مقاله‌ای با این فیلتر نیست." : "هنوز مقاله‌ای نوشته نشده. «مقالهٔ تازه» را بزنید."}</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>مقاله</th>
                    <th>زبان‌ها</th>
                    <th>وضعیت</th>
                    <th>نویسنده</th>
                    <th>آخرین تغییر</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
                          {p.cover ? <img src={previewSrc(p.cover)} alt="" width={56} height={36} style={{ objectFit: "cover", borderRadius: 4, flex: "none" }} /> : <span className="thumb" style={{ inlineSize: 56, blockSize: 36 }} aria-hidden="true" />}
                          <div>
                            <Link href={`/blog/${p.id}`} style={{ fontWeight: 600 }}>
                              {p.titles.fa || p.titles.en || p.titles.tr || "(بی‌عنوان)"}
                            </Link>
                            <div className="small muted">
                              {cat(p.categoryId)}
                              {p.featured && " · ویژه"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="row" style={{ gap: 4 }}>
                          {(["fa", "en", "tr"] as const).map((l) => (
                            <span key={l} className={`badge${p.live.includes(l) ? " ok" : p.ready.includes(l) ? " accent" : ""}`} title={`${LOCALE_NAME[l]}: ${p.live.includes(l) ? "روی سایت" : p.ready.includes(l) ? "آماده، منتشر نشده" : "نوشته نشده"}`}>
                              {l.toUpperCase()}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${STATUS[p.status][1]}`}>{STATUS[p.status][0]}</span>
                        {p.unpublishedChanges && <div className="small muted">تغییرهای منتشرنشده</div>}
                        {p.scheduledAt && <div className="small muted">{when(p.scheduledAt)}</div>}
                      </td>
                      <td className="small">
                        {author(p.authorId)}
                        {p.mine && <span className="badge"> شما</span>}
                      </td>
                      <td className="small muted">{ago(p.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
