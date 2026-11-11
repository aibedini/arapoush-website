"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ListChecks, Plus } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { canWrite, useAction, useApi, useMe } from "@/lib/hooks";
import { ago, num } from "@/lib/fa";
import { pickL, type L } from "@/lib/tickets";
import { Dialog, ErrorNote, Loading, PageHead } from "@/components/ui";

type Row = { id: string; slug: string; status: string; system: boolean; version: number; title: L; fields: number; dirty: boolean; page: boolean; open: number; total: number; updated_at: string };
const STATE: Record<string, [string, string]> = { draft: ["پیش‌نویس", "warn"], published: ["منتشرشده", "ok"], archived: ["بایگانی", ""] };

/** Every website form. Submissions become tickets; built-in forms feed the quote sheet and contact. */
export default function Forms() {
  const me = useMe();
  const list = useApi<Row[]>("/v1/manage/forms");
  const [create, setCreate] = useState(false);
  return (
    <>
      <PageHead title="فرم‌ها" sub="فرم بسازید، در هر صفحه‌ای بگذارید؛ هر پاسخ یک تیکت در صندوق تیکت‌ها می‌شود.">
        {canWrite(me) && (
          <button type="button" className="btn primary" onClick={() => setCreate(true)}>
            <Plus size={16} aria-hidden /> فرم تازه
          </button>
        )}
      </PageHead>
      <ErrorNote error={list.error} />
      {!list.data ? (
        <Loading />
      ) : (
        <div className="form-grid">
          {list.data.map((f) => (
            <Link key={f.id} href={`/forms/${f.id}`} className="card form-card">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <ListChecks size={22} aria-hidden />
                <span className="row">
                  {f.system && <span className="badge accent">داخلی سایت</span>}
                  <span className={`badge ${STATE[f.status]?.[1]}`}>{STATE[f.status]?.[0]}</span>
                  {f.dirty && f.status !== "draft" && <span className="badge warn">تغییر منتشرنشده</span>}
                </span>
              </div>
              <h2>{pickL(f.title)}</h2>
              <p className="small muted mono">/forms/{f.slug}</p>
              <p className="small muted">
                {num(f.fields)} فیلد · {num(f.open)} تیکت باز از {num(f.total)} · {ago(f.updated_at)}
              </p>
            </Link>
          ))}
        </div>
      )}
      <CreateForm open={create} onClose={() => setCreate(false)} />
    </>
  );
}

function CreateForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const act = useAction();
  const router = useRouter();
  const ok = title.trim() && /^[a-z0-9][a-z0-9-]{1,39}$/.test(slug);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="فرم تازه"
      footer={
        <button type="button" className="btn primary" disabled={!ok || act.busy} onClick={() => act.run(async () => router.push(`/forms/${(await api<{ id: string }>("/v1/manage/forms", { body: { title, slug } })).id}`))}>
          ساخت و ویرایش
        </button>
      }
    >
      <label className="f">
        <span>عنوان</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="درخواست نمونهٔ رایگان" autoFocus />
      </label>
      <label className="f">
        <span>نشانی (انگلیسی)</span>
        <input dir="ltr" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} placeholder="free-sample" />
      </label>
      <p className="small muted">فرم با نام، ایمیل و پیام شروع می‌شود؛ بقیه را در سازنده اضافه کنید.</p>
      <ErrorNote error={act.error} />
    </Dialog>
  );
}
