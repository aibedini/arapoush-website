import Image from "next/image";
import type { Dictionary } from "@/lib/i18n";
import type { EffProduct, Img } from "@/lib/products";
import { ChocolateIcon, FizzIcon, PrintIcon } from "./CapIcons";
import styles from "./Effervescent.module.css";

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

const USE_ICONS = [FizzIcon, ChocolateIcon, PrintIcon];

/** Applications: printed tubes with a fizzing glass on the silk studio backdrop, beside the uses. */
export function Uses({ t, photo, bg, locale }: { t: Dictionary["productEff"]["uses"]; photo: Img; bg: Img; locale: string }) {
  return (
    <section className={styles.uses} aria-labelledby="uses-title">
      <div className={styles.usesBg} aria-hidden="true">
        <Image src={bg.src} alt="" fill sizes="100vw" quality={70} data-no-mirror />
      </div>
      <div className={styles.usesInner}>
        <div className={styles.usesCopy}>
          <p className={styles.usesEyebrow} lang={locale === "fa" ? "en" : undefined} data-reveal>
            {t.eyebrow}
          </p>
          <h2 id="uses-title" className={`t-h2 ${styles.usesTitle}`} data-reveal>
            {t.title}
          </h2>
          <p className={`t-lead ${styles.usesLead}`} data-reveal>
            {t.lead}
          </p>
          <ul className={styles.usesList} data-reveal-stagger>
            {t.items.map((it, i) => {
              const Icon = USE_ICONS[i % USE_ICONS.length]!;
              return (
                <li key={it.title} data-reveal-item>
                  <span className={styles.usesIcon}>
                    <Icon />
                  </span>
                  <span className={styles.usesItemText}>
                    <h3>{it.title}</h3>
                    <p>{it.text}</p>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className={styles.usesPhoto} data-reveal-media>
          <Image src={photo.src} alt={t.photoAlt} width={photo.width} height={photo.height} sizes="(max-width: 767px) 96vw, (max-width: 1099px) 80vw, 52vw" data-no-mirror />
        </div>
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
