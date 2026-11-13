import { t, type Applications } from "@/lib/applicationsText";
import { aboutPath } from "@/lib/site";
import { ArrowIcon, ShieldIcon } from "./AppIcons";
import styles from "./Applications.module.css";

/** How packaging is chosen and checked in sensitive industries: four steps, and the certificates. */
export default function Quality({ c, locale }: { c: Applications["quality"]; locale: string }) {
  const n = (i: number) => new Intl.NumberFormat(locale === "fa" ? "fa-IR" : locale).format(i);
  return (
    <section id="quality" className={styles.quality} aria-labelledby="quality-title">
      <div className={styles.inner}>
        <div className={styles.qualityGrid}>
          <header className={styles.qualityHead}>
            <p className={styles.kicker} lang={locale === "fa" ? "en" : undefined}>
              {t(c.eyebrow, locale)}
            </p>
            <h2 id="quality-title" className={styles.h2}>
              {t(c.title, locale)}
            </h2>
            <p className={styles.lead} data-reveal>
              {t(c.lead, locale)}
            </p>
            <a href={`/${locale}${aboutPath}#honours`} className={styles.textLink}>
              <ShieldIcon className={styles.arrow} />
              {t(c.certificates, locale)}
              <ArrowIcon className={styles.arrow} />
            </a>
          </header>
          <ol className={styles.steps} data-reveal-stagger>
            {c.steps.map((s, i) => (
              <li key={s.title.en} data-reveal-item>
                <span className={styles.stepNum} aria-hidden="true">
                  {n(i + 1)}
                </span>
                <h3>{t(s.title, locale)}</h3>
                <p>{t(s.text, locale)}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
