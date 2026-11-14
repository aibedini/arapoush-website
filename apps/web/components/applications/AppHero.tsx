import Image from "next/image";
import RollText from "@/components/ui/RollText";
import { t, type Applications } from "@/lib/applicationsText";
import { ArrowIcon, INDUSTRY_ICONS } from "./AppIcons";
import styles from "./Applications.module.css";

/**
 * Hero: the title and lead on one side, the five industries as a staggered masonry grid on the other.
 * Cards and the chip row link to the industry's panel (#cosmetics…), which the showcase opens.
 */
export default function AppHero({ c, industries, locale }: { c: Applications["hero"]; industries: Applications["industries"]["items"]; locale: string }) {
  return (
    <section className={styles.hero} aria-labelledby="apps-title">
      <div className={styles.inner}>
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker} lang={locale === "fa" ? "en" : undefined}>
              {t(c.eyebrow, locale)}
            </p>
            <h1 id="apps-title" className={styles.h1}>
              {t(c.title, locale)}
            </h1>
            <p className={styles.lead}>{t(c.lead, locale)}</p>
            <div className={styles.ctas}>
              <a href="#industries" className="btn">
                <RollText text={t(c.explore, locale)} />
                <ArrowIcon className={styles.arrow} />
              </a>
              <a href="#finder" className={`btn ${styles.ghost}`}>
                <RollText text={t(c.finder, locale)} />
              </a>
            </div>
          </div>

          <ul className={styles.fan} aria-hidden="true">
            {industries.map((x, i) => (
              <li key={x.id} className={styles.fanItem} style={{ "--i": i, "--n": industries.length, "--accent": x.accent } as React.CSSProperties}>
                <a href={`#${x.id}`} className={styles.fanCard} data-industry={x.id} tabIndex={-1}>
                  <Image
                    src={x.image.src}
                    alt=""
                    fill
                    sizes="(max-width: 767px) 48vw, (max-width: 1099px) 32vw, 17vw"
                    priority={i === 1}
                    fetchPriority={i === 1 ? "high" : "low"}
                    loading={i === 1 ? undefined : "eager"}
                    data-no-mirror
                  />
                  <span className={styles.fanName}>
                    {t(x.name, locale)}
                    <span className={styles.fanArrow}>
                      <ArrowIcon />
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        <ul className={styles.chips} aria-label={t(c.industriesLabel, locale)} data-reveal-stagger>
          {industries.map((x) => {
            const Icon = INDUSTRY_ICONS[x.id];
            return (
              <li key={x.id} data-reveal-item>
                <a href={`#${x.id}`} className={styles.chip} data-industry={x.id} style={{ "--accent": x.accent } as React.CSSProperties}>
                  <Icon className={styles.chipIcon} />
                  <span>{t(x.name, locale)}</span>
                  <ArrowIcon className={`${styles.arrow} ${styles.chipArrow}`} />
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
