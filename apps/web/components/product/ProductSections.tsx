import Image from "next/image";
import type { Dictionary } from "@/lib/i18n";
import RollText from "@/components/ui/RollText";
import MaybeLink from "@/components/ui/MaybeLink";
import { ArrowRightCircle, Layers, Leaf, PlayCircle, ShieldCheck } from "@/components/ui/icons";
import { loc, type ProductImage, type StructureDef } from "@/lib/configurator/model";
import { Recycle } from "./art";
import styles from "./Product.module.css";

type T = { t: Dictionary["productTube"] };
/** Art direction per writing direction: the photo's empty side sits under the copy, so it is never mirrored. */
type Art = { image: ProductImage; locale: string; dir: "ltr" | "rtl" };

const featureIcons = [Layers, ShieldCheck, Leaf, Recycle];

/** `media` (default): full-bleed photo; `compact`: a shorter hero for pages that lead with the configurator. */
export function ProductHero({ t, video, image, locale, dir, style = "media" }: T & Art & { video: string | null; style?: string }) {
  return (
    <section id="top" className={`${styles.hero} ${style === "compact" ? styles.heroCompact : ""}`} aria-labelledby="product-title">
      <div className={styles.heroArt}>
        <div data-parallax="40">
          <Image src={image[dir]} alt={loc(image.alt, locale)} width={image.width} height={image.height} priority sizes="(max-width: 767px) 80vw, (max-width: 1099px) 70vw, 100vw" className={styles.heroImg} data-no-mirror />
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

/** `split` (default): copy beside the cut-away; `stacked`: copy above it. */
export function LayerStructure({ t, structure, image, locale, dir, style = "split" }: T & Art & { structure: StructureDef | undefined; style?: string }) {
  const s = t.layers;
  return (
    <section className={`${styles.panel} ${styles.layers} ${style === "stacked" ? styles.layersStacked : ""}`} aria-labelledby="layers-title" data-reveal>
      <div className={styles.layersCopy}>
        <h2 id="layers-title" className={styles.panelTitle}>
          {s.title}
        </h2>
        <p className={styles.panelLead}>{s.lead}</p>
        <ol className={styles.layerList}>
          {(structure?.layers ?? []).map((layer) => (
            <li key={layer.id} style={{ "--dot": layer.color } as React.CSSProperties}>
              <strong>{loc(layer.name, locale)}</strong>
              <span>{loc(layer.text, locale)}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className={styles.layersArt}>
        <Image src={image[dir]} alt={loc(image.alt, locale)} width={image.width} height={image.height} sizes="(max-width: 767px) 100vw, 96vw" data-no-mirror />
      </div>
    </section>
  );
}
