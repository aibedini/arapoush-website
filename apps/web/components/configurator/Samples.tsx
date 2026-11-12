"use client";

import { useId } from "react";
import Image from "next/image";
import type { Dictionary } from "@/lib/i18n";
import { closureOf, loc, printOf, rankSamples, shapeOf, type TubeConfig, type TubeProduct } from "@/lib/configurator/model";
import styles from "./Configurator.module.css";

type Props = {
  t: Dictionary["productTube"]["configurator"];
  locale: string;
  product: TubeProduct;
  cfg: TubeConfig;
  onApply: (patch: Partial<TubeConfig>) => void;
  /** `grid` (default) or `rail`: one scrolling row. */
  style?: "grid" | "rail";
};

const MAX = 6;

/** Product samples for the current shape, best match to closure and diameter first (admin-managed list). */
export default function Samples({ t, locale, product, cfg, onApply, style = "grid" }: Props) {
  const id = useId();
  const ranked = rankSamples(product, cfg).slice(0, MAX);

  return (
    <section id="samples" className={styles.samples} aria-labelledby={`${id}-title`}>
      <header className={styles.samplesHead}>
        <p className="eyebrow">{t.samplesEyebrow}</p>
        <h2 id={`${id}-title`} className={styles.title}>
          {t.samplesTitle}
        </h2>
        <p className={styles.lead}>{t.samplesLead}</p>
      </header>

      {ranked.length ? (
        <ul className={`${styles.sampleGrid} ${style === "rail" ? styles.sampleRail : ""}`} aria-live="polite">
          {ranked.map(({ sample: s, exact }) => {
            const tags = [loc(shapeOf(product, s.shape)?.name, locale), s.closure ? loc(closureOf(product, s.closure)?.name, locale) : "", s.d ? `Ø${s.d} mm` : "", s.print ? loc(printOf(product, s.print)?.name, locale) : ""].filter(Boolean);
            return (
              <li key={s.id} className={styles.sample}>
                <div className={styles.sampleImg}>
                  <Image src={s.image} alt={loc(s.title, locale)} fill sizes="(max-width: 767px) 92vw, (max-width: 1279px) 46vw, 30vw" data-no-mirror />
                  <span className={`${styles.sampleBadge} ${exact ? styles.sampleExact : ""}`}>{exact ? t.samplesMatch : t.samplesSimilar}</span>
                </div>
                <div className={styles.sampleBody}>
                  <h3>{loc(s.title, locale)}</h3>
                  <p className={styles.sampleTags}>
                    {tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </p>
                  {(s.closure !== cfg.closure && s.closure) || (s.d && s.d !== cfg.d) || (s.print && s.print !== cfg.print) ? (
                    <button type="button" className={styles.sampleApply} onClick={() => onApply({ shape: s.shape, ...(s.closure ? { closure: s.closure } : {}), ...(s.d ? { d: s.d } : {}), ...(s.print ? { print: s.print } : {}), ...(s.colour ? { colour: s.colour } : {}) })}>
                      {t.useSample}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.samplesEmpty}>{t.samplesEmpty}</p>
      )}
    </section>
  );
}
