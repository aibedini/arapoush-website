"use client";

import { useEffect, useMemo, useState } from "react";
import type { GroupField } from "@arapoush/schema";
import { api } from "./api";
import { useAction, useApi } from "./hooks";

type EntryView = {
  entry: { id: string; type_key: string; draft_revision_id: string | null; published_revision_id: string | null };
  schema: GroupField;
  draft: { id: string; number: number; data: Record<string, unknown> } | null;
};

/**
 * One content entry being edited on a dedicated page (slider builder, fonts): its draft, local
 * edits, save as draft and publish. Unsaved edits survive a closed tab (kept in this browser).
 */
export function useEntry(key: string) {
  const view = useApi<EntryView>(`/v1/manage/entries/${encodeURIComponent(key)}`);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const act = useAction();
  const backupKey = `opex:unsaved:${key}`;

  useEffect(() => {
    if (!view.data) return;
    const draft = view.data.draft?.data ?? {};
    try {
      const raw = localStorage.getItem(backupKey);
      const b = raw ? (JSON.parse(raw) as { base: string | null; data: Record<string, unknown> }) : null;
      if (b && b.base === (view.data.draft?.id ?? null)) return setData(b.data);
    } catch {}
    setData(draft);
  }, [view.data, backupKey]);

  const orig = useMemo(() => view.data?.draft?.data ?? {}, [view.data]);
  const dirty = !!data && JSON.stringify(data) !== JSON.stringify(orig);
  useEffect(() => {
    try {
      if (dirty && data) localStorage.setItem(backupKey, JSON.stringify({ base: view.data?.draft?.id ?? null, data }));
      else localStorage.removeItem(backupKey);
    } catch {}
  }, [dirty, data, backupKey, view.data]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const save = () =>
    act.run(async () => {
      await api(`/v1/manage/entries/${encodeURIComponent(key)}`, { method: "PUT", body: { data, base_revision_id: view.data?.draft?.id ?? null } });
      view.reload();
    }, "پیش‌نویس ذخیره شد. برای نمایش روی سایت، منتشر کنید.");
  const publish = () =>
    act.run(async () => {
      await api(`/v1/manage/entries/${encodeURIComponent(key)}/publish`, { body: {} });
      view.reload();
    }, "منتشر شد؛ سایت تا چند ثانیهٔ دیگر به‌روز می‌شود.");
  const discard = () => setData(orig);
  const unpublished = !!view.data && view.data.entry.draft_revision_id !== view.data.entry.published_revision_id;

  return { view, data, setData, dirty, save, publish, discard, act, unpublished };
}
