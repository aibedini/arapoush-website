"use client";

import { useState } from "react";
import Image from "next/image";
import type { Dictionary } from "@/lib/i18n";
import type { EffProduct } from "@/lib/products";
import styles from "./Effervescent.module.css";

type Props = { t: Dictionary["productEff"]["caps"]; caps: EffProduct["caps"]; locale: string };

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");

/** With / without spiral: exploded renders of each cap, cross-faded in place. */
export default function CapCompare({ t, caps, locale }: Props) {
  const [id, setId] = useState(caps.variants[0]!.id);
  const tallest = Math.max(...caps.variants.map((v) => v.image.height / v.image.width));

  return (
    <section className={styles.caps} aria-labelledby="caps-title">
      <header className={styles.head} data-reveal>
        <h2 id="caps-title" className="t-h2">
          {t.title}
        </h2>
        <p className="t-lead t-muted">{t.lead}</p>
      </header>

      <div className={styles.switch} role="group" aria-label={t.label}>
        {caps.variants.map((v) => (
          <button key={v.id} type="button" aria-pressed={v.id === id} onClick={() => setId(v.id)}>
            {v.name[locale] ?? v.name.en}
          </button>
        ))}
      </div>

      <div className={styles.capStage} data-reveal>
        <div className={styles.capPhoto} style={{ aspectRatio: `1 / ${tallest}` }}>
          {caps.variants.map((v) => (
            <Image
              key={v.id}
              src={v.image.src}
              alt={fill(t.alt, { variant: v.name[locale] ?? v.name.en! })}
              width={v.image.width}
              height={v.image.height}
              sizes="(max-width: 767px) 60vw, 300px"
              data-on={v.id === id || undefined}
              aria-hidden={v.id !== id || undefined}
              data-no-mirror
            />
          ))}
        </div>
      </div>

      <ul className={styles.facts} data-reveal-stagger>
        {t.facts.map((f) => (
          <li key={f} data-reveal-item>
            {f}
          </li>
        ))}
      </ul>
    </section>
  );
}
