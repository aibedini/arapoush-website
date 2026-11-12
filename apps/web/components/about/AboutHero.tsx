import RollText from "@/components/ui/RollText";
import { ArrowIcon } from "@/components/printing/PrintIcons";
import ps from "@/components/printing/Printing.module.css";
import { t, type AboutHero as Hero } from "@/lib/aboutText";
import type { Img } from "@/lib/content/pick";
import HeroVideo from "./HeroVideo";
import styles from "./About.module.css";

/**
 * About hero. `cinema`: the factory film fills the screen with the copy over a navy fade.
 * `split`: the printing page's light hero, with the film framed beside the copy.
 */
export default function AboutHero({ c, locale, poster }: { c: Hero; locale: string; poster: Img }) {
  const cinema = c.style !== "split";
  const latinKicker = locale === "fa" && /^[\x00-\x7F]*$/.test(t(c.eyebrow, locale)) ? "en" : undefined;
  return (
    <section className={`${styles.hero} ${cinema ? styles.cinema : styles.split}`} aria-labelledby="about-title">
      <div className={styles.heroMedia}>
        <HeroVideo
          poster={poster}
          mp4={c.video.mp4}
          webm={c.video.webm}
          alt={t(c.videoAlt, locale)}
          play={t(c.play, locale)}
          pause={t(c.pause, locale)}
          sizes={cinema ? "100vw" : "(max-width: 1099px) 100vw, 50vw"}
        />
      </div>
      <div className={`${ps.inner} ${styles.heroInner}`}>
        <div className={styles.heroCopy}>
          <p className={`${ps.kicker} ${cinema ? ps.light : ""}`} lang={latinKicker}>
            {t(c.eyebrow, locale)}
          </p>
          <h1 id="about-title" className={styles.heroTitle}>
            {t(c.title, locale)}
          </h1>
          <p className={styles.heroLead}>{t(c.lead, locale)}</p>
          <p className={styles.slogan}>
            <span aria-hidden="true">{locale === "fa" ? "«" : "“"}</span>
            {t(c.slogan, locale)}
            <span aria-hidden="true">{locale === "fa" ? "»" : "”"}</span>
          </p>
          <div className={ps.heroCtas}>
            <a href="#story" className={`btn ${cinema ? "btn--light" : ""}`}>
              <RollText text={t(c.story, locale)} />
              <ArrowIcon className={ps.arrow} />
            </a>
            <a href="#honours" className={`btn ${cinema ? styles.glass : ps.ghost}`}>
              <RollText text={t(c.honours, locale)} />
            </a>
          </div>
        </div>
        <dl className={styles.stats}>
          {c.stats.map((s) => (
            <div key={s.id} className={styles.stat}>
              <dt>{t(s.label, locale)}</dt>
              <dd>{t(s.value, locale)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
