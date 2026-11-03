import Image from "next/image";
import RollText from "@/components/ui/RollText";
import { t, type Printing } from "@/lib/printing";
import { ArrowIcon, FileIcon, LayersIcon, PaletteIcon, ShoulderIcon } from "./PrintIcons";
import styles from "./Printing.module.css";

const ICONS = { layers: LayersIcon, palette: PaletteIcon, shoulder: ShoulderIcon, file: FileIcon } as const;

/** Hero: two printed tubes on the pearl and ice-blue backdrop, the page title and the service strip. */
export default function PrintHero({ c, locale }: { c: Printing["hero"]; locale: string }) {
  return (
    <section className={styles.hero} aria-labelledby="print-title">
      <div className={styles.heroBg} aria-hidden="true">
        <Image src="/images/printing/bg-light.webp" alt="" fill sizes="100vw" quality={60} fetchPriority="low" loading="eager" data-no-mirror />
      </div>
      <div className={styles.inner}>
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker} lang={locale === "fa" ? "en" : undefined}>
              {t(c.eyebrow, locale)}
            </p>
            <h1 id="print-title" className={styles.h1}>
              {t(c.title, locale)}
            </h1>
            <p className={styles.lead}>{t(c.lead, locale)}</p>
            <div className={styles.heroCtas}>
              <a href="#technologies" className="btn">
                <RollText text={t(c.explore, locale)} />
                <ArrowIcon className={styles.arrow} />
              </a>
              <a href="#downloads" className={`btn ${styles.ghost}`}>
                <RollText text={t(c.resources, locale)} />
              </a>
            </div>
          </div>
          <div className={styles.heroArt} role="img" aria-label={t(c.tubesAlt, locale)}>
            <div data-parallax="30">
              <Image
                src="/images/printing/tube-colour.webp"
                alt=""
                width={1086}
                height={1448}
                priority
                fetchPriority="high"
                sizes="(max-width: 1099px) 52vw, 26vw"
                className={`${styles.heroTube} ${styles.heroTubeColour}`}
                data-no-mirror
              />
            </div>
            <div data-parallax="60">
              <Image
                src="/images/printing/tube-gold.webp"
                alt=""
                width={1086}
                height={1448}
                priority
                sizes="(max-width: 1099px) 58vw, 29vw"
                className={`${styles.heroTube} ${styles.heroTubeGold}`}
                data-no-mirror
              />
            </div>
          </div>
        </div>
        <ul className={styles.features} data-reveal>
          {c.features.map((f) => {
            const Icon = ICONS[f.icon as keyof typeof ICONS] ?? LayersIcon;
            return (
              <li key={f.icon}>
                <Icon className={styles.featureIcon} />
                {t(f.text, locale)}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
