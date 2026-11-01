import Image from "next/image";
import { links } from "@/lib/site";
import type { SectionProps } from "@/lib/sections";
import MaybeLink from "@/components/ui/MaybeLink";
import { ArrowRight, ChevronRightBold, Layers, Leaf, ShieldCheck } from "@/components/ui/icons";
import styles from "./Certifications.module.css";

const certs = [
  { code: "GMP", img: "/images/cert-gmp.webp" },
  { code: "ISO 9001", img: "/images/cert-iso.webp" },
  { code: "IFDA", img: "/images/cert-ifda.webp" },
  { code: "INSO", img: "/images/cert-inso.webp" },
];

const featureIcons = [
  { Icon: ShieldCheck, wide: false },
  { Icon: Leaf, wide: false },
  { Icon: Layers, wide: true },
];

export default function Certifications({ t }: SectionProps) {
  const c = t.certifications;
  return (
    <section id="certifications" className={styles.section} aria-labelledby="cert-title">
      <div className="canvas" style={{ "--h": 1228 } as React.CSSProperties}>
        <div className={`at ${styles.ribbon}`} style={{ "--x": 0, "--y": 122, "--w": 1430 } as React.CSSProperties} aria-hidden="true">
          <div data-parallax="30">
            <Image src="/images/cert-bg.webp" alt="" width={1430} height={1045} sizes="75vw" />
          </div>
        </div>

        <div className={`at ${styles.intro}`} style={{ "--x": 48, "--y": 279, "--w": 439 } as React.CSSProperties}>
          <p className="eyebrow" data-reveal>
            {c.eyebrow}
          </p>
          <h2 id="cert-title" className="t-h2" data-reveal-lines>
            {c.title.map((line, i) => (
              <span key={line} className="line-mask">
                <span className={i > 0 ? styles.muted : undefined}>{line}</span>
              </span>
            ))}
          </h2>
          <p className="t-lead" data-reveal>
            {c.lead}
          </p>
        </div>

        {/* Every card rests in the plain state; hover/focus grows it into the Figma "featured" card. */}
        <ul className={`at ${styles.cards}`} style={{ "--x": 701, "--y": 192, "--w": 1036 } as React.CSSProperties} data-reveal-stagger>
          {certs.map((cert, i) => {
            const item = c.items[i];
            if (!item) return null;
            return (
              <li key={cert.code} className={styles.slot} data-reveal-item>
                <article className={styles.card} tabIndex={links.certificates ? undefined : 0} aria-label={`${cert.code} — ${item.name}`}>
                  <div className={styles.badge}>
                    <Image src={cert.img} alt={`${cert.code} ${c.seal}`} data-no-mirror fill sizes="(max-width: 767px) 24vw, 13vw" />
                  </div>
                  <div className={styles.copy}>
                    <h3 className={`${styles.code} ltr`}>{cert.code}</h3>
                    <p className={styles.name}>{item.name}</p>
                    <p className={styles.text}>{item.text}</p>
                    <div className={styles.actions}>
                      <MaybeLink href={links.certificates} className={styles.more}>
                        {c.learnMore}
                        <ArrowRight className={styles.moreIcon} />
                      </MaybeLink>
                      <span className={styles.round} aria-hidden="true">
                        <ChevronRightBold />
                      </span>
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>

        <span className={`at ${styles.rule}`} style={{ "--x": 701, "--y": 731, "--w": 1123 } as React.CSSProperties} aria-hidden="true" data-reveal />

        <ul className={`at ${styles.features}`} style={{ "--x": 701, "--y": 779, "--w": 1100 } as React.CSSProperties} data-reveal-stagger>
          {featureIcons.map(({ Icon, wide }, i) => {
            const f = c.features[i];
            if (!f) return null;
            return (
              <li key={f.title} className={styles.feature} data-reveal-item>
                <Icon className={wide ? styles.iconWide : styles.icon} />
                <div>
                  <h3 className={styles.fTitle}>{f.title}</h3>
                  <p className={styles.fText}>{f.text}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
