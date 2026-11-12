"use client";

import { useState } from "react";
import OpexForm from "@/components/forms/OpexForm";
import type { Dictionary } from "@/lib/i18n";
import type { PublicForm } from "@/lib/forms";
import { pickL } from "@arapoush/schema";
import s from "./Contact.module.css";

/** A segmented switch between forms (suggestions / complaints). Only the chosen form is mounted. */
export default function FeedbackTabs({ tabs, locale, page, t }: { tabs: { form: PublicForm; label: string }[]; locale: string; page: string; t: Dictionary["forms"] }) {
  const [active, setActive] = useState(0);
  const current = tabs[active]!.form;
  const intro = pickL(current.intro, locale);
  return (
    <div className={s.feedback} data-reveal>
      <div className={s.segment} role="radiogroup" aria-label={tabs.map((x) => x.label).join(" / ")}>
        {tabs.map((x, i) => (
          <button key={x.form.slug} type="button" role="radio" aria-checked={i === active} className={s.segmentBtn} onClick={() => setActive(i)}>
            {x.label}
          </button>
        ))}
      </div>
      <div className={s.formCard}>
        {intro && <p className={s.text}>{intro}</p>}
        <OpexForm key={current.slug} form={current} t={t} locale={locale} page={page} />
      </div>
    </div>
  );
}
