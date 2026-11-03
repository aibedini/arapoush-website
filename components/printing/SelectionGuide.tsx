"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import RollText from "@/components/ui/RollText";
import { quoteMailto } from "@/lib/configurator/quote";
import { contact, siteUrl } from "@/lib/site";
import { t, type L, type Printing, type Tech, type TechId } from "@/lib/printingText";
import { AskIcon, CheckIcon, CrossIcon } from "./PrintIcons";
import styles from "./Printing.module.css";

type Answers = Record<string, string[]>;
type Status = "fits" | "check" | "no";
type Ranked = { tech: Tech; score: number; status: Status; ok: L[]; ask: L[]; no: L[] };

/**
 * Ranks the five methods from the visitor's answers. Every reason shown comes from the content
 * file (Arapoush's own pages); when a source says nothing, the method is marked "check with us"
 * rather than guessed. The ranking is a first suggestion, never a final recommendation.
 */
export function rank(questions: Printing["guide"]["questions"], answers: Answers, techs: Tech[]): Ranked[] {
  const rows = new Map<TechId, Ranked>(techs.map((tech) => [tech.id, { tech, score: 0, status: "fits", ok: [], ask: [], no: [] }]));
  for (const q of questions)
    for (const id of answers[q.id] ?? []) {
      const opt = q.options.find((o) => o.id === id);
      if (!opt) continue;
      opt.effects?.forEach((e) => {
        const r = rows.get(e.m)!;
        r.score += e.s ?? 1;
        r.ok.push(e.why);
      });
      opt.asks?.forEach((e) => rows.get(e.m)!.ask.push(e.why));
      opt.excludes?.forEach((e) => rows.get(e.m)!.no.push(e.why));
    }
  const order: Record<Status, number> = { fits: 0, check: 1, no: 2 };
  return [...rows.values()]
    .map((r) => ({ ...r, status: (r.no.length ? "no" : r.ask.length || !r.score ? "check" : "fits") as Status }))
    .sort((a, b) => order[a.status] - order[b.status] || b.score - a.score);
}

export default function SelectionGuide({ c, techs, locale }: { c: Printing["guide"]; techs: Tech[]; locale: string }) {
  const [answers, setAnswers] = useState<Answers>({});
  const picked = Object.values(answers).some((a) => a.length);
  const ranked = useMemo(() => rank(c.questions, answers, techs), [c.questions, answers, techs]);
  const notes = c.questions.flatMap((q) => (answers[q.id] ?? []).map((id) => q.options.find((o) => o.id === id)?.note).filter(Boolean)) as L[];

  const toggle = (qid: string, oid: string, multi?: boolean) =>
    setAnswers((a) => {
      const cur = a[qid] ?? [];
      const on = cur.includes(oid);
      return { ...a, [qid]: multi ? (on ? cur.filter((x) => x !== oid) : [...cur, oid]) : on ? [] : [oid] };
    });

  const statusLabel = { fits: t(c.fits, locale), check: t(c.check, locale), no: t(c.no, locale) };
  const summary = c.questions.flatMap((q) => (answers[q.id] ?? []).map((id) => `${t(q.label, locale)} ${t(q.options.find((o) => o.id === id)?.label, locale)}`));
  const mail = quoteMailto({
    to: contact.email,
    subject: t(c.title, locale),
    spec: [...summary, "", ...ranked.filter((r) => r.status !== "no").map((r) => `${t(r.tech.name, locale)}: ${statusLabel[r.status]}`)],
    fields: [],
    link: `${siteUrl}/${locale}/printing#guide`,
  });

  return (
    <section id="guide" className={`${styles.guide} ${styles.onDark}`} aria-labelledby="guide-title">
      <div className={styles.navyBg} aria-hidden="true">
        <Image src="/images/printing/bg-navy.webp" alt="" fill sizes="100vw" quality={70} data-no-mirror />
      </div>
      <div className={styles.inner}>
        <div className={styles.guideTop}>
          <div className={styles.layers} aria-hidden="true">
            <Image src="/images/printing/layers.webp" alt="" fill sizes="(max-width: 767px) 90vw, 30vw" data-no-mirror />
          </div>
          <div className={styles.guideIntro} data-reveal>
            <p className={styles.kicker} lang={locale === "fa" ? "en" : undefined}>
              {t(c.eyebrow, locale)}
            </p>
            <h2 id="guide-title" className={styles.h2}>
              {t(c.title, locale)}
            </h2>
            <p className={styles.lead}>{t(c.lead, locale)}</p>
          </div>
          <ol className={styles.steps}>
            {c.steps.map((s, i) => (
              <li key={s.en}>
                <span className={styles.stepNum}>{new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 }).format(i + 1)}</span>
                {t(s, locale)}
              </li>
            ))}
          </ol>
        </div>

        <div className={styles.guideBody}>
          <div className={styles.questions}>
            {c.questions.map((q) => (
              <fieldset key={q.id} className={styles.question}>
                <legend>{t(q.label, locale)}</legend>
                <div className={styles.options}>
                  {q.options.map((o) => (
                    <button key={o.id} type="button" className={styles.option} aria-pressed={(answers[q.id] ?? []).includes(o.id)} onClick={() => toggle(q.id, o.id, q.multi)}>
                      {t(o.label, locale)}
                    </button>
                  ))}
                </div>
              </fieldset>
            ))}
            {picked && (
              <button type="button" className={styles.guideReset} onClick={() => setAnswers({})}>
                {t(c.reset, locale)}
              </button>
            )}
          </div>

          <div className={styles.results} aria-live="polite">
            <h3 className={styles.resultsTitle}>{t(c.result, locale)}</h3>
            {!picked ? (
              <p className={styles.resultsEmpty}>{t(c.empty, locale)}</p>
            ) : (
              <>
                {ranked.map((r) => (
                  <article key={r.tech.id} className={styles.result} data-status={r.status}>
                    <div className={styles.resultHead}>
                      <h4 className={styles.resultName}>{t(r.tech.name, locale)}</h4>
                      <span className={styles.badge} data-status={r.status}>
                        {statusLabel[r.status]}
                      </span>
                    </div>
                    {(r.ok.length > 0 || r.ask.length > 0 || r.no.length > 0) && (
                      <ul className={styles.why}>
                        {r.no.map((w, i) => (
                          <li key={`n${i}`} className={styles.whyNo}>
                            <CrossIcon />
                            {t(w, locale)}
                          </li>
                        ))}
                        {r.status !== "no" &&
                          r.ok.map((w, i) => (
                            <li key={`o${i}`} className={styles.whyOk}>
                              <CheckIcon />
                              {t(w, locale)}
                            </li>
                          ))}
                        {r.status !== "no" &&
                          r.ask.map((w, i) => (
                            <li key={`a${i}`} className={styles.whyAsk}>
                              <AskIcon />
                              {t(w, locale)}
                            </li>
                          ))}
                      </ul>
                    )}
                  </article>
                ))}
                {notes.map((n) => (
                  <p key={n.en} className={styles.guideNote}>
                    {t(n, locale)}
                  </p>
                ))}
              </>
            )}
            <div className={styles.guideActions}>
              <a href={mail} className={`btn ${styles.lightBtn}`}>
                <RollText text={t(c.ask, locale)} />
              </a>
              <a href="#compare" className={`btn ${styles.outlineLight}`}>
                <RollText text={t(c.steps[2], locale)} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
