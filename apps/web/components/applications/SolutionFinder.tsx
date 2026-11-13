"use client";

import { useState } from "react";
import Image from "next/image";
import RollText from "@/components/ui/RollText";
import { ASK_QUOTE, PICK_INDUSTRY, t, type Applications, type AskDetail, type L } from "@/lib/applicationsText";
import { printingPath, productPaths } from "@/lib/site";
import { ArrowIcon, CheckIcon, INDUSTRY_ICONS } from "./AppIcons";
import styles from "./Applications.module.css";

export type FinderRefs = {
  /** Catalogue closures the finder may suggest: name and photo. */
  closures: Record<string, { name: L; image: string }>;
  /** Print method names (page.printing). */
  techs: Record<string, L>;
};

/**
 * Three choices (industry, contents, priority) → a suggested direction: structure, closures from the
 * catalogue, print methods and what to send. It never promises compatibility; "ask with these
 * details" carries the answers into the quote form.
 */
export default function SolutionFinder({ c, industries, refs, locale }: { c: Applications["finder"]; industries: Applications["industries"]["items"]; refs: FinderRefs; locale: string }) {
  const [industry, setIndustry] = useState(industries[0]!.id);
  const [content, setContent] = useState(c.contents[0]!.id);
  const [priority, setPriority] = useState(c.priorities[0]!.id);
  const ind = industries.find((x) => x.id === industry)!;
  const con = c.contents.find((x) => x.id === content)!;
  const pri = c.priorities.find((x) => x.id === priority)!;
  const closures = con.closures.filter((id) => refs.closures[id]);
  const prints = pri.print.filter((id) => refs.techs[id]);
  const configure = `/${locale}${productPaths.tube}?shape=circular${closures[0] ? `&cap=${closures[0]}` : ""}${prints[0] ? `&pr=${prints[0]}` : ""}#configurator`;

  const ask = () => {
    dispatchEvent(new CustomEvent<AskDetail>(ASK_QUOTE, { detail: { industry, contents: content, priority } }));
    document.getElementById("quote")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };

  const group = <T extends { id: string }>(name: string, legend: L, options: T[], value: string, set: (v: string) => void, label: (o: T) => React.ReactNode) => (
    <fieldset className={styles.fGroup}>
      <legend className={styles.fLegend}>{t(legend, locale)}</legend>
      <div className={styles.fOptions}>
        {options.map((o) => (
          <label key={o.id} className={styles.fOption} data-on={o.id === value || undefined}>
            <input type="radio" name={name} value={o.id} checked={o.id === value} onChange={() => set(o.id)} />
            {label(o)}
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <div className={styles.finder}>
      <form className={styles.fForm} onSubmit={(e) => e.preventDefault()} aria-label={t(c.title, locale)}>
        {group("finder-industry", c.industry, industries, industry, (v) => (setIndustry(v as typeof industry), dispatchEvent(new CustomEvent(PICK_INDUSTRY, { detail: v }))), (o) => {
          const Icon = INDUSTRY_ICONS[o.id];
          return (
            <>
              <Icon className={styles.fIcon} />
              {t(o.name, locale)}
            </>
          );
        })}
        {group("finder-content", c.content, c.contents, content, setContent, (o) => t(o.label, locale))}
        {group("finder-priority", c.priority, c.priorities, priority, setPriority, (o) => t(o.label, locale))}
      </form>

      <section className={styles.fResult} aria-live="polite" aria-labelledby="finder-result" style={{ "--accent": ind.accent } as React.CSSProperties}>
        <p className={styles.fResultKicker}>{t(c.result, locale)}</p>
        <h3 id="finder-result" className={styles.fResultTitle}>
          {t(ind.name, locale)} · {t(con.label, locale)} · {t(pri.label, locale)}
        </h3>

        <dl className={styles.fFacts}>
          <div>
            <dt>{t(c.structureLabel, locale)}</dt>
            <dd>{t(pri.structure, locale)}</dd>
          </div>
          <div>
            <dt>{t(c.closuresLabel, locale)}</dt>
            <dd>
              <p>{t(con.note, locale)}</p>
              {closures.length > 0 && (
                <ul className={styles.fCaps}>
                  {closures.map((id) => (
                    <li key={id}>
                      <Image src={refs.closures[id]!.image} alt="" width={56} height={56} data-no-mirror />
                      <span>{t(refs.closures[id]!.name, locale)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {con.more && (
                <a href={`/${locale}${con.more.href}`} className={styles.textLink}>
                  {t(con.more.label, locale)}
                  <ArrowIcon className={styles.arrow} />
                </a>
              )}
            </dd>
          </div>
          <div>
            <dt>{t(c.printLabel, locale)}</dt>
            <dd>
              <ul className={styles.examples}>
                {prints.map((id) => (
                  <li key={id}>
                    <a href={`/${locale}${printingPath}#technologies`}>{t(refs.techs[id], locale)}</a>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
          <div>
            <dt>{t(c.sendLabel, locale)}</dt>
            <dd>
              <ul className={styles.fSend}>
                {c.send.map((s) => (
                  <li key={s.en}>
                    <CheckIcon className={styles.fCheck} />
                    {t(s, locale)}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>

        <div className={styles.ctas}>
          <button type="button" className="btn" onClick={ask}>
            <RollText text={t(c.ask, locale)} />
            <ArrowIcon className={styles.arrow} />
          </button>
          <a href={configure} className={`btn ${styles.ghost}`}>
            <RollText text={t(c.configure, locale)} />
          </a>
        </div>
        <p className={styles.fNote}>{t(c.disclaimer, locale)}</p>
      </section>
    </div>
  );
}
