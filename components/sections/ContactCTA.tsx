import Image from "next/image";
import RollText from "@/components/ui/RollText";
import { Magnetic } from "@animate-ui/react/primitives/effects/magnetic";
import { Shine } from "@animate-ui/react/primitives/effects/shine";
import type { SectionProps } from "@/lib/sections";
import Footer from "@/components/layout/Footer";
import { ArrowRightCircle } from "@/components/ui/icons";
import styles from "./ContactCTA.module.css";

/** Closing composition: CTA and footer share one blue material backdrop (Figma y 6313–7166). */
export default function ContactCTA({ t, locale }: SectionProps) {
  const c = t.cta;
  return (
    <div className={styles.closing}>
      <div className={styles.bg} aria-hidden="true">
        <div className={styles.bgTop} data-parallax="24">
          <Image src="/images/cta-bg.webp" alt="" fill sizes="100vw" />
        </div>
        <div className={styles.bgBottom}>
          <Image src="/images/footer-bg.webp" alt="" fill sizes="100vw" />
        </div>
      </div>

      <section id="contact" className={styles.cta} aria-labelledby="cta-title">
        <div className={styles.tube} aria-hidden="true">
          <div data-parallax="50">
            <Image src="/images/cta-tube.webp" alt="" width={941} height={706} sizes="(max-width: 767px) 62vw, (max-width: 1099px) 70vw, 49vw" />
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
            <Magnetic strength={0.22} range={110} className={styles.magnet}>
              <Shine asChild enableOnHover color="#0e2b46" opacity={0.12}>
                <a href="mailto:sales@arapoush.com?subject=Quote%20request" className="btn btn--light">
                  <RollText text={c.quote} />
                  <span className="icon">
                    <ArrowRightCircle color="#0E2B46" />
                  </span>
                </a>
              </Shine>
            </Magnetic>
          </div>
          <div data-reveal-item>
            <Magnetic strength={0.22} range={110} className={styles.magnet}>
              <a href="tel:+982126421602" className="btn btn--outline-light">
                <RollText text={c.contact} />
                <span className="icon">
                  <ArrowRightCircle color="#F5F4F4" />
                </span>
              </a>
            </Magnetic>
          </div>
        </div>
      </section>

      <Footer t={t} locale={locale} />
    </div>
  );
}
