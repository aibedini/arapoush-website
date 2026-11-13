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
  const spot = c.spots.find((s) => s.id === id)!;
  return (
    <section id="engineering" className={`${styles.engineering} ${styles.onDark}`} aria-labelledby="eng-title">
      <div className={styles.inner}>
        <div className={styles.engGrid}>
          <div className={styles.engCopy}>
            <p className={styles.kicker} lang={locale === "fa" ? "en" : undefined}>
              {t(c.eyebrow, locale)}
            </p>
            <h2 id="eng-title" className={styles.h2} data-reveal>
              {t(c.title, locale)}
            </h2>
            <p className={styles.lead} data-reveal>
              {t(c.lead, locale)}
            </p>
            <ul className={styles.engList}>
              {c.spots.map((s, i) => (
                <li key={s.id}>
                  <button type="button" className={styles.engItem} aria-pressed={s.id === id} aria-controls="eng-detail" onClick={() => setId(s.id)}>
                    <span className={styles.engNum} aria-hidden="true">
                      {new Intl.NumberFormat(locale === "fa" ? "fa-IR" : locale).format(i + 1)}
                    </span>
                    {t(s.title, locale)}
                  </button>
                </li>
              ))}
            </ul>
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
            <div id="eng-detail" className={styles.engDetail} aria-live="polite">
              <h3 key={spot.id} className={styles.engDetailTitle}>
                {t(spot.title, locale)}
              </h3>
              <p>{t(spot.text, locale)}</p>
              {spot.link && (
                <a href={`/${locale}${spot.link.href}`} className={styles.engLink}>
                  {t(spot.link.label, locale)}
                  <ArrowIcon className={styles.arrow} />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
