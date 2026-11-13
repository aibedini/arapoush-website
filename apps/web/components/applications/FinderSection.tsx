import { t, type Applications } from "@/lib/applicationsText";
import SolutionFinder, { type FinderRefs } from "./SolutionFinder";
import styles from "./Applications.module.css";

/** The solution finder with its heading (server); the finder itself is the interactive island. */
export default function FinderSection({ c, industries, refs, locale }: { c: Applications["finder"]; industries: Applications["industries"]["items"]; refs: FinderRefs; locale: string }) {
  return (
    <section id="finder" className={styles.finderSection} aria-labelledby="finder-title">
      <div className={styles.inner}>
        <header className={styles.head}>
          <p className={styles.kicker} lang={locale === "fa" ? "en" : undefined}>
            {t(c.eyebrow, locale)}
          </p>
          <h2 id="finder-title" className={styles.h2} data-reveal>
            {t(c.title, locale)}
          </h2>
          <p className={styles.lead} data-reveal>
            {t(c.lead, locale)}
          </p>
        </header>
        <SolutionFinder c={c} industries={industries} refs={refs} locale={locale} />
      </div>
    </section>
  );
}
