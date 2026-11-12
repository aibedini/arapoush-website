"use client";

import type { Dictionary } from "@/lib/i18n";
import type { PublicForm } from "@/lib/forms";
import type { Department } from "@/lib/contactText";
import { normalize } from "@/lib/configurator/model";
import Samples from "./Samples";
import QuoteForm from "./QuoteForm";
import { useTube } from "./TubeState";

/** Related samples for the current selection (`grid` or a scrolling `rail`). */
export function SamplesSection({ style = "grid" }: { style?: "grid" | "rail" }) {
  const { cat, cfg, setCfg, c, locale } = useTube();
  return <Samples t={c} locale={locale} product={cat} cfg={cfg} style={style} onApply={(patch) => setCfg(normalize(cat, { ...cfg, ...patch }))} />;
}

/** The quote request (OPEX form), carrying the current selection. */
export function QuoteSection({ email, form, forms, department }: { email: string; form: PublicForm; forms: Dictionary["forms"]; department?: Department }) {
  const { spec, subjectSpec, search, c, locale, cfg } = useTube();
  const values = {
    shape: cfg.shape,
    diameter: String(cfg.d),
    length: String(cfg.l),
    closure: cfg.closure,
    cap_colour: cfg.colour ?? "",
    cap_hex: cfg.capHex ?? "",
    body_colour: cfg.body ?? "",
    print: cfg.print ?? "",
    structure: cfg.structure,
    link: search,
  };
  return <QuoteForm t={c} forms={forms} form={form} values={values} spec={spec} subjectSpec={subjectSpec} search={search} email={email} locale={locale} department={department} />;
}
