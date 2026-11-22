"use client";

import { useState } from "react";
import { canWrite, useMe } from "@/lib/hooks";
import type { useEntry } from "@/lib/useEntry";
import { PreviewFrames } from "./PreviewFrames";
import { ErrorNote } from "./ui";

/** Save / publish / preview for a dedicated entry page (see lib/useEntry). */
export function EntryBar({ e, type }: { e: ReturnType<typeof useEntry>; type: string }) {
  const me = useMe();
  const [frames, setFrames] = useState(false);
  const writable = canWrite(me);
  return (
    <div className="entry-bar" role="region" aria-label="ذخیره و انتشار">
      <span>{e.dirty ? <span className="badge warn">تغییرات ذخیره‌نشده</span> : e.unpublished ? <span className="badge warn">پیش‌نویس منتشرنشده</span> : <span className="badge ok">منتشرشده و به‌روز</span>}</span>
      <ErrorNote error={e.act.error} />
      {e.act.done && !e.dirty && (
        <span className="small" role="status" style={{ color: "var(--ok)" }}>
          {e.act.done}
        </span>
      )}
      <span className="row" style={{ marginInlineStart: "auto" }}>
        <button type="button" className="btn sm" disabled={e.dirty} title={e.dirty ? "اول ذخیره کنید" : undefined} onClick={() => setFrames(true)}>
          پیش‌نمایش روی سایت
        </button>
        {writable && (
          <>
            {e.dirty && (
              <button type="button" className="btn sm ghost" onClick={e.discard}>
                دور ریختن تغییرات
              </button>
            )}
            <button type="button" className="btn sm primary" disabled={!e.dirty || e.act.busy} onClick={e.save}>
              ذخیرهٔ پیش‌نویس
            </button>
            <button type="button" className="btn sm" disabled={e.dirty || !e.unpublished || e.act.busy} onClick={e.publish}>
              انتشار
            </button>
          </>
        )}
      </span>
      <PreviewFrames open={frames} onClose={() => setFrames(false)} type={type} />
    </div>
  );
}
