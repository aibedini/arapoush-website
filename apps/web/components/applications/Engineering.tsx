"use client";

import { useState } from "react";
import Image from "next/image";
import { t, type Applications } from "@/lib/applicationsText";
import { ArrowIcon, PlusIcon } from "./AppIcons";
import styles from "./Applications.module.css";

/**
 * The tube opened up, with five hotspots (layers, barrier, closures, sizes, print). The list beside
 * the image is the control; the dots on the image mirror it for pointer users.
 */
export default function Engineering({ c, locale }: { c: Applications["engineering"]; locale: string }) {
  const [id, setId] = useState(c.spots[0]!.id);
  return (
    <section id="engineering" className={`${styles.engineering} ${styles.onDark}`} aria-labelledby="eng-title">
      <div className={styles.inner}>
        <div className={styles.engGrid}>
          <div className={styles.engCopy}>
            <p className={styles.kicker} lang={locale === "fa" ? "en" : undefined}>
              {t(c.eyebrow, locale)}
            </p>
            <h2 id="eng-title" className={styles.h2}>
              {t(c.title, locale)}
            </h2>
            <p className={styles.lead} data-reveal>
              {t(c.lead, locale)}
            </p>
            <ul className={styles.engList}>
              {c.spots.map((s, i) => (
                <li key={s.id}>
                  <button type="button" className={styles.engItem} aria-pressed={s.id === id} aria-controls={`eng-${s.id}`} onClick={() => setId(s.id)}>
                    <span className={styles.engNum} aria-hidden="true">
                      {new Intl.NumberFormat(locale === "fa" ? "fa-IR" : locale).format(i + 1)}
                    </span>
                    {t(s.title, locale)}
                  </button>
                </li>
              ))}
            </ul>
            {/* Every detail is in the HTML (search engines read all five); one shows. */}
            {c.spots.map((s) => (
              <div key={s.id} id={`eng-${s.id}`} className={styles.engDetail} hidden={s.id !== id}>
                <h3 className={styles.engDetailTitle}>{t(s.title, locale)}</h3>
                <p>{t(s.text, locale)}</p>
                {s.link && (
                  <a href={`/${locale}${s.link.href}`} className={styles.engLink}>
                    {t(s.link.label, locale)}
                    <ArrowIcon className={styles.arrow} />
                  </a>
                )}
              </div>
            ))}
          </div>

          <div className={styles.engStage}>
            <div className={styles.engArt}>
              <Image src={c.image.src} alt={t(c.imageAlt, locale)} fill sizes="(max-width: 1099px) 92vw, 50vw" data-no-mirror />
              {c.spots.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  className={styles.engDot}
                  data-on={s.id === id || undefined}
                  style={{ left: `${s.x}%`, top: `${s.y}%` }}
                  onClick={() => setId(s.id)}
                >
                  <PlusIcon />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
