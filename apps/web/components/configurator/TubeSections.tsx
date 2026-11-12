"use client";

import { normalize } from "@/lib/configurator/model";
import Samples from "./Samples";
import QuoteForm from "./QuoteForm";
import { useTube } from "./TubeState";

/** Related samples for the current selection (`grid` or a scrolling `rail`). */
export function SamplesSection({ style = "grid" }: { style?: "grid" | "rail" }) {
  const { cat, cfg, setCfg, c, locale } = useTube();
  return <Samples t={c} locale={locale} product={cat} cfg={cfg} style={style} onApply={(patch) => setCfg(normalize(cat, { ...cfg, ...patch }))} />;
}

/** The quote request, pre-filled with the current selection. */
export function QuoteSection({ email, direct }: { email: string; direct?: boolean }) {
  const { spec, subjectSpec, search, c, locale } = useTube();
  return <QuoteForm t={c} spec={spec} subjectSpec={subjectSpec} search={search} email={email} locale={locale} direct={direct} />;
}
