"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { t, type Applications } from "@/lib/applicationsText";
import { ChevronIcon, CloseIcon } from "./AppIcons";
import styles from "./Applications.module.css";

/**
 * Sample projects, filtered by industry. A card opens a lightbox (native <dialog>: focus trap, Esc
 * and the backdrop for free) with the large image, the specs and the previous/next sample.
 */
export default function Projects({ c, industries, locale }: { c: Applications["projects"]; industries: Applications["industries"]["items"]; locale: string }) {
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const shown = c.items.filter((p) => filter === "all" || p.industry === filter);
  const used = industries.filter((x) => c.items.some((p) => p.industry === x.id));
  const nameOf = (id: string) => t(industries.find((x) => x.id === id)?.name, locale);
  const current = open === null ? null : shown[open];

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open !== null && !d.open) d.showModal();
    if (open === null && d.open) d.close();
  }, [open]);

  const step = (d: 1 | -1) => setOpen((i) => (i === null ? i : (i + d + shown.length) % shown.length));

  return (
    <section id="projects" className={styles.projects} aria-labelledby="projects-title">
      <div className={styles.inner}>
        <header className={styles.head}>
          <p className={styles.kicker} lang={locale === "fa" ? "en" : undefined}>
            {t(c.eyebrow, locale)}
          </p>
          <h2 id="projects-title" className={styles.h2} data-reveal>
            {t(c.title, locale)}
          </h2>
          <p className={styles.lead} data-reveal>
            {t(c.lead, locale)}
          </p>
        </header>

        <div className={styles.filters} role="group" aria-label={t(c.title, locale)}>
          {[{ id: "all", label: t(c.all, locale) }, ...used.map((x) => ({ id: x.id, label: t(x.name, locale) }))].map((f) => (
            <button key={f.id} type="button" className={styles.filter} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>

        <ul className={styles.projectGrid}>
          {shown.map((p, i) => (
            <li key={p.id}>
              <button type="button" className={styles.project} onClick={() => setOpen(i)} aria-haspopup="dialog">
                <span className={styles.projectImg} data-industry={p.industry}>
                  <Image src={p.image.src} alt="" fill sizes="(max-width: 767px) 80vw, (max-width: 1279px) 40vw, 26vw" data-no-mirror />
                </span>
                <span className={styles.projectBody}>
                  <span className={styles.projectTag}>{nameOf(p.industry)}</span>
                  <span className={styles.projectTitle}>{t(p.title, locale)}</span>
                  <span className={styles.projectText}>{t(p.text, locale)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className={styles.note}>{t(c.note, locale)}</p>
      </div>

      <dialog ref={dialog} className={styles.lightbox} onClose={() => setOpen(null)} aria-labelledby="lightbox-title" onClick={(e) => e.target === e.currentTarget && setOpen(null)}>
        {current && (
          <div className={styles.lbInner}>
            <div className={styles.lbImg} data-industry={current.industry}>
              <Image src={current.image.src} alt={t(current.title, locale)} fill sizes="(max-width: 1099px) 92vw, 56vw" data-no-mirror />
            </div>
            <div className={styles.lbCopy}>
              <span className={styles.projectTag}>{nameOf(current.industry)}</span>
              <h3 id="lightbox-title" className={styles.lbTitle}>
                {t(current.title, locale)}
              </h3>
              <p>{t(current.text, locale)}</p>
              <dl className={styles.lbSpecs}>
                {current.specs.map((s) => (
                  <div key={s.label.en}>
                    <dt>{t(s.label, locale)}</dt>
                    <dd>{t(s.value, locale)}</dd>
                  </div>
                ))}
              </dl>
              <div className={styles.lbNav}>
                <button type="button" className={styles.lbBtn} onClick={() => step(-1)} aria-label={t(c.prev, locale)} disabled={shown.length < 2}>
                  <ChevronIcon className={`${styles.arrow} ${styles.flip}`} />
                </button>
                <button type="button" className={styles.lbBtn} onClick={() => step(1)} aria-label={t(c.next, locale)} disabled={shown.length < 2}>
                  <ChevronIcon className={styles.arrow} />
                </button>
              </div>
            </div>
            <button type="button" className={styles.lbClose} onClick={() => setOpen(null)} aria-label={t(c.close, locale)}>
              <CloseIcon />
            </button>
          </div>
        )}
      </dialog>
    </section>
  );
}
