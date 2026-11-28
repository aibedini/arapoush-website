"use client";

import { PartsLibrary } from "@/components/studio/PartsLibrary";
import { PageHead } from "@/components/ui";

/** 3D studio (S2): factory models of every product line, previewed, mounted and approved. */
export default function StudioPage() {
  return (
    <>
      <PageHead title="استودیو سه‌بعدی" sub="بدنه‌ها و درب‌های هر لاین محصول از فایل STEP: پیش‌نمایش، اتصال به هم و تأیید برای سایت" />
      <PartsLibrary />
    </>
  );
}
