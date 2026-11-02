import Image from "next/image";
import type { Dictionary } from "@/lib/i18n";
import type { EffProduct } from "@/lib/products";
import styles from "./Effervescent.module.css";

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

/** Applications: a render of the tube with its tablets poured out, beside the documented uses. */
export function Uses({ t, image }: { t: Dictionary["productEff"]["uses"]; image: EffProduct["images"]["uses"] }) {
  return (
    <section className={styles.uses} aria-labelledby="uses-title">
      <div className={styles.usesPhoto} data-reveal-media>
        <Image src={image.src} alt={t.alt} width={image.width} height={image.height} sizes="(max-width: 1099px) 92vw, 56vw" data-no-mirror />
      </div>
      <div className={styles.usesCopy}>
        <h2 id="uses-title" className="t-h2" data-reveal>
          {t.title}
        </h2>
        <p className="t-lead t-muted" data-reveal>
          {t.lead}
        </p>
        <ul className={styles.usesList} data-reveal-stagger>
          {t.items.map((it) => (
            <li key={it.title} data-reveal-item>
              <h3>{it.title}</h3>
              <p>{it.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const SEALS = ["/images/cert-inso.webp", "/images/cert-gmp.webp", "/images/cert-ifda.webp"];

/** Manufacturing: the published figures (first domestic line, daily capacity, imports) and standards. */
export function Making({ t, product, locale }: { t: Dictionary["productEff"]["make"]; product: EffProduct; locale: string }) {
  const nf = new Intl.NumberFormat(locale);
  const since = product.since[locale] ?? product.since.en!;
  const stats = [
    { value: nf.format(product.dailyCapacity), label: t.perDay },
    { value: since, label: t.since },
    { value: nf.format(0) + (locale === "fa" ? "٪" : "%"), label: t.imports },
  ];
  return (
    <section className={styles.make} aria-labelledby="make-title">
      <div className={styles.makeInner}>
        <h2 id="make-title" className={`t-h2 ${styles.makeTitle}`} data-reveal>
          {t.title}
        </h2>
        <p className={`t-lead ${styles.makeLead}`} data-reveal>
          {fill(t.lead, { since })}
        </p>
        <dl className={styles.stats} data-reveal-stagger>
          {stats.map((s) => (
            <div key={s.label} data-reveal-item>
              <dt>{s.label}</dt>
              <dd>
                <span className="ltr">{s.value}</span>
              </dd>
            </div>
          ))}
        </dl>
        <div className={styles.standards} data-reveal>
          <ul>
            {SEALS.map((src, i) => (
              <li key={src}>
                <Image src={src} alt={t.seals[i] ?? ""} width={480} height={480} sizes="72px" data-no-mirror />
              </li>
            ))}
          </ul>
          <p>{t.standards}</p>
        </div>
      </div>
    </section>
  );
}
