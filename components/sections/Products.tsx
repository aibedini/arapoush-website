import Image from "next/image";
import { links } from "@/lib/site";
import type { SectionProps } from "@/lib/sections";
import { CircleArrow } from "@/components/ui/icons";
import Glow from "@/components/ui/Glow";
import styles from "./Products.module.css";

const visuals = [
  { n: "01", img: "/images/product-tube.webp", href: links.products.tube, tone: "light", x: 634 },
  { n: "02", img: "/images/product-effervescent.webp", href: links.products.effervescent, tone: "dark", x: 1243 },
] as const;

type CardProps = { n: string; img: string; href: string; dark: boolean; title: string[]; text: string; label: string };

function ProductCard({ n, img, href, dark, title, text, label }: CardProps) {
  return (
    <article className={`${styles.card} ${dark ? styles.dark : ""}`} data-drift-host="10">
      <div className={styles.media} data-reveal-media>
        <div className={styles.mediaInner}>
          <div className={styles.drift} data-drift>
            <Image src={img} alt="" fill sizes="(max-width: 767px) 92vw, (max-width: 1099px) 46vw, 29vw" />
          </div>
        </div>
      </div>
      <div className={styles.content}>
        <span className={styles.num}>{n}</span>
        <h3 className={styles.title}>
          {title.map((line) => (
            <span key={line}>{line} </span>
          ))}
        </h3>
        <p className={styles.text}>{text}</p>
        <a href={href} className={`circle-link ${styles.arrow}`} aria-label={label}>
          <CircleArrow color={dark ? "#F9FAFC" : "#222222"} />
        </a>
      </div>
    </article>
  );
}

export default function Products({ t }: SectionProps) {
  const p = t.products;
  return (
    <section id="products" className={styles.section} aria-labelledby="products-title">
      <div className="canvas" style={{ "--h": 1091 } as React.CSSProperties}>
        <Glow x={1437} y={24} color="#608db5" opacity={0.35} />
        <Glow x={1202} y={444} color="#b2c7de" opacity={0.55} />
        <Glow x={592} y={331} color="#cdad90" opacity={0.4} />

        <div className={`at ${styles.intro}`} style={{ "--x": 48, "--y": 256, "--w": 481 } as React.CSSProperties}>
          <p className="eyebrow" data-reveal>
            {p.eyebrow}
          </p>
          <h2 id="products-title" className="t-h2" data-reveal-lines>
            {p.title.map((line, i) => (
              <span key={line} className="line-mask">
                <span className={i > 0 ? "t-muted" : undefined}>{line}</span>
              </span>
            ))}
          </h2>
          <p className="t-lead" data-reveal>
            {p.lead}
          </p>
        </div>

        <div className={styles.cards} data-reveal-stagger>
          {visuals.map((v, i) => {
            const card = p.cards[i];
            if (!card) return null;
            return (
              <div key={v.n} className={`at ${styles.slot}`} style={{ "--x": v.x, "--y": 160, "--w": 549 } as React.CSSProperties} data-reveal-item>
                <ProductCard
                  n={v.n}
                  img={v.img}
                  href={v.href}
                  dark={v.tone === "dark"}
                  title={card.title}
                  text={card.text}
                  label={`${p.enquire} ${card.title.join(" ")}`}
                />
              </div>
            );
          })}
        </div>

        <div className={`at ${styles.tablets}`} style={{ "--x": 1701, "--y": 84, "--w": 243 } as React.CSSProperties} aria-hidden="true">
          <div data-parallax="70">
            <Image src="/images/tablets.webp" alt="" width={243} height={303} sizes="13vw" style={{ width: "100%", height: "auto" }} />
          </div>
        </div>
      </div>
    </section>
  );
}
