import Image from "next/image";
import RollText from "@/components/ui/RollText";
import { links } from "@/lib/site";
import type { SectionProps } from "@/lib/sections";
import { CircleArrow } from "@/components/ui/icons";
import Glow from "@/components/ui/Glow";
import styles from "./Applications.module.css";

const visuals = [
  { img: "/images/app-cosmetics.webp", h: 505, x: 117 },
  { img: "/images/app-pharma.webp", h: 465, x: 578 },
  { img: "/images/app-hygienic.webp", h: 455, x: 1039 },
  { img: "/images/app-food.webp", h: 465, x: 1500 },
];

export default function Applications({ t }: SectionProps) {
  const a = t.applications;
  return (
    <section id="applications" className={styles.section} aria-labelledby="applications-title">
      <div className="canvas" style={{ "--h": 1015 } as React.CSSProperties}>
        <Glow x={1388} y={0} color="#cdad90" opacity={0.18} />
        <Glow x={130} y={204} color="#cdad90" opacity={0.18} />

        <div className={`at ${styles.head}`} style={{ "--x": 48, "--y": 0, "--w": 1032 } as React.CSSProperties}>
          <p className="eyebrow" data-reveal>
            {a.eyebrow}
          </p>
          <div className={styles.row}>
            <h2 id="applications-title" className={`t-h2 ${styles.title}`} data-reveal-lines>
              {a.title.map((line, i) => (
                <span key={line} className="line-mask">
                  <span className={i > 0 ? "t-muted" : undefined}>{line}</span>
                </span>
              ))}
            </h2>
            <span className={styles.divider} aria-hidden="true" />
            <p className={`t-lead ${styles.lead}`} data-reveal>
              {a.lead}
            </p>
          </div>
        </div>

        <ul className={styles.grid} data-reveal-stagger>
          {visuals.map((v, i) => {
            const item = a.items[i];
            if (!item) return null;
            return (
              <li key={v.img} className={`at ${styles.slot}`} style={{ "--x": v.x, "--y": 259, "--w": 356 } as React.CSSProperties} data-reveal-item>
                <a href={links.applications} className={styles.card} aria-label={`${item.title} — ${item.text}`}>
                  <div className={styles.media} style={{ "--ih": v.h } as React.CSSProperties} data-reveal-media>
                    <div className={styles.mediaInner}>
                      <Image src={v.img} alt="" fill sizes="(max-width: 767px) 46vw, (max-width: 1099px) 46vw, 19vw" />
                    </div>
                  </div>
                  <span className={styles.fade} aria-hidden="true" />
                  <div className={styles.content}>
                    <h3 className={styles.cardTitle}>{item.title}</h3>
                    <p className={styles.text}>{item.text}</p>
                    <span className={styles.explore} aria-hidden="true">
                      <RollText text={a.explore} />
                      <span className={`circle-link ${styles.circle}`}>
                        <CircleArrow color="#302B28" weight={2.6} />
                      </span>
                    </span>
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
