"use client";

import Link from "next/link";
import type { FontSettings } from "@arapoush/schema";
import { EntryBar } from "@/components/EntryBar";
import { SliderStudio } from "@/components/slider/SliderStudio";
import { ErrorNote, Loading, PageHead } from "@/components/ui";
import { canWrite, useApi, useMe } from "@/lib/hooks";
import { useEntry } from "@/lib/useEntry";

/** Slider builder for the home hero (`page.home.hero` → `slider`). */
export default function SliderPage() {
  const me = useMe();
  const e = useEntry("page.home.hero");
  const site = useApi<{ draft: { data: { fonts?: FontSettings } } | null }>("/v1/manage/entries/global.site");
  if (e.view.error) return <ErrorNote error={e.view.error} />;
  return (
    <>
      <PageHead title="اسلایدساز صفحهٔ اصلی" sub="اسلایدها، لایه‌ها، ترنزیشن‌ها و تنظیمات هر دستگاه">
        <Link className="btn" href="/fonts">
          فونت‌ها
        </Link>
        <Link className="btn" href="/content/page.home.hero">
          متن‌های ثابت اسلایدر
        </Link>
      </PageHead>
      {!e.data ? (
        <Loading rows={10} />
      ) : (
        <>
          <EntryBar e={e} type="page.home.hero" />
          <SliderStudio data={e.data} onChange={e.setData} canEdit={canWrite(me)} fonts={site.data?.draft?.data.fonts} />
        </>
      )}
    </>
  );
}
