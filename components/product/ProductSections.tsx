import Image from "next/image";
import type { Dictionary } from "@/lib/i18n";
import RollText from "@/components/ui/RollText";
import MaybeLink from "@/components/ui/MaybeLink";
import { ArrowRightCircle, Layers, Leaf, PlayCircle, ShieldCheck } from "@/components/ui/icons";
import { Recycle } from "./art";
import styles from "./Product.module.css";

type T = { t: Dictionary["productTube"] };

const featureIcons = [Layers, ShieldCheck, Leaf, Recycle];

export function ProductHero({ t, video }: T & { video: string | null }) {
  return (
    <section id="top" className={styles.hero} aria-labelledby="product-title">
      <div className={styles.heroArt}>
        <div data-parallax="40">
          <Image src="/images/product-tube.webp" alt={t.imageAlt} width={1095} height={1436} priority sizes="(max-width: 767px) 70vw, 52vw" className={styles.heroImg} />
        </div>
      </div>

      <div className={styles.heroCopy}>
        <p className="eyebrow" data-reveal>
          {t.eyebrow}
        </p>
        <h1 id="product-title" className={styles.heroTitle} data-reveal-lines>
          {t.title.map((line, i) => (
            <span key={line} className="line-mask">
              <span className={i === t.title.length - 1 ? styles.muted : undefined}>{line}</span>
            </span>
          ))}
        </h1>
        <p className={styles.heroLead} data-reveal>
          {t.lead}
        </p>
        <div className={styles.heroCtas} data-reveal>
          <a href="#quote" className="btn">
            <RollText text={t.quote} />
            <span className="icon">
              <ArrowRightCircle color="#A9ACAF" />
            </span>
          </a>
          {/* No product film yet: renders as a quiet label until links.productVideo is set. */}
          <MaybeLink href={video} className={styles.videoLink}>
            <span className={styles.playRing}>
              <PlayCircle color="currentColor" />
            </span>
            <span className={styles.videoText}>{t.video}</span>
          </MaybeLink>
        </div>

        <ul className={styles.features} data-reveal-stagger>
          {t.features.map((f, i) => {
            const Icon = featureIcons[i] ?? Layers;
            return (
              <li key={f} className={styles.feature} data-reveal-item>
                <Icon className={styles.featureIcon} />
                <span>{f}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

const layerColors = ["#2b2f36", "#e8893a", "#8fa7bf", "#e8893a", "#c3c9d1"];

export function LayerStructure({ t }: T) {
  const s = t.layers;
  return (
    <section className={`${styles.panel} ${styles.layers}`} aria-labelledby="layers-title" data-reveal>
      <div className={styles.layersCopy}>
        <h2 id="layers-title" className={styles.panelTitle}>
          {s.title}
        </h2>
        <p className={styles.panelLead}>{s.lead}</p>
        <ol className={styles.layerList}>
          {s.items.map((item, i) => (
            <li key={`${item.name}-${i}`} style={{ "--dot": layerColors[i] } as React.CSSProperties}>
              <strong>{item.name}</strong>
              <span>{item.text}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className={styles.layersArt} data-drift-host="12">
        <div data-drift>
          <Image src="/images/cta-tube.webp" alt={s.imageAlt} width={941} height={706} sizes="(max-width: 1099px) 80vw, 30vw" />
        </div>
      </div>
    </section>
  );
}
