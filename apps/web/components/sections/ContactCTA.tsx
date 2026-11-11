import Image from "next/image";
import RollText from "@/components/ui/RollText";
import type { SectionProps } from "@/lib/sections";
import Footer from "@/components/layout/Footer";
import { ArrowRightCircle } from "@/components/ui/icons";
import styles from "./ContactCTA.module.css";

/** Closing composition: CTA and footer share one blue material backdrop (Figma y 6313–7166). */
/**
 * `blend="navy"`: the page above ends on navy, so the band's light top is washed navy to match.
 * `footerOnly`: the page has its own closing call to action; render just the shared footer on its
 * navy wave.
 */
export default function ContactCTA({ t, locale, blend, footerOnly }: SectionProps & { blend?: "navy"; footerOnly?: boolean }) {
  const c = t.cta;
  if (footerOnly)
    return (
      <div className={`${styles.closing} ${styles.footerOnly}`}>
        <div className={styles.bg} aria-hidden="true">
          <div className={styles.bgFooter}>
            <Image src={t.media.site.footerBg.src} alt="" fill sizes="100vw" />
          </div>
        </div>
        <Footer t={t} locale={locale} />
      </div>
    );
  return (
    <div className={styles.closing} data-blend={blend}>
      <div className={styles.bg} aria-hidden="true">
        <div className={styles.bgTop} data-parallax="24">
          <Image src={t.media.site.ctaBg.src} alt="" fill sizes="100vw" />
        </div>
        <div className={styles.bgBottom}>
          <Image src={t.media.site.footerBg.src} alt="" fill sizes="100vw" />
        </div>
      </div>

      <section id="contact" className={styles.cta} aria-labelledby="cta-title">
        <div className={styles.tube} aria-hidden="true">
          <div data-parallax="50">
            <Image src={t.media.site.ctaTube.src} alt="" width={t.media.site.ctaTube.width} height={t.media.site.ctaTube.height} sizes="(max-width: 767px) 62vw, (max-width: 1099px) 70vw, 49vw" data-no-mirror />
          </div>
        </div>

        <div className={styles.copy}>
          <h2 id="cta-title" className={`t-h2 ${styles.title}`} data-reveal-lines>
            <span className="line-mask">
              <span>{c.title[0]}</span>
            </span>
            <span className="line-mask">
              <span className={styles.accent}>{c.title[1]}</span>
            </span>
          </h2>
          <p className={`t-lead ${styles.lead}`} data-reveal>
            {c.lead}
          </p>
        </div>

        <div className={styles.actions} data-reveal-stagger>
          <div data-reveal-item>
            <a href="mailto:sales@arapoush.com?subject=Quote%20request" className="btn btn--light">
              <RollText text={c.quote} />
              <span className="icon">
                <ArrowRightCircle color="#0E2B46" />
              </span>
            </a>
          </div>
          <div data-reveal-item>
            <a href="tel:+982126421602" className="btn btn--outline-light">
              <RollText text={c.contact} />
              <span className="icon">
                <ArrowRightCircle color="#F5F4F4" />
              </span>
            </a>
          </div>
        </div>
      </section>

      <Footer t={t} locale={locale} />
    </div>
  );
}
