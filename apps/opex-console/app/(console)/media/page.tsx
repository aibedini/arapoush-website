"use client";

import { MediaLibrary } from "@/components/MediaLibrary";
import { PageHead } from "@/components/ui";

export default function MediaPage() {
  return (
    <>
      <PageHead title="رسانه" sub="تصویرها و فایل‌هایی که در محتوا استفاده می‌شوند" />
      <div className="card">
        <div className="card-body">
          <MediaLibrary />
        </div>
      </div>
    </>
  );
}
