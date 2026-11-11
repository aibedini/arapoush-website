import Image from "next/image";
import RollText from "@/components/ui/RollText";
import { quoteMailto } from "@/lib/configurator/quote";
import { contact as fileContact, siteUrl, type Contact } from "@/lib/site";
import { t, type Printing, type Tech } from "@/lib/printing";
import { ArrowIcon, DownloadIcon, EyeIcon, MailIcon, PhoneIcon } from "./PrintIcons";
import styles from "./Printing.module.css";
import type { Media } from "@/lib/content/media";

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");

function fileSize(bytes: number, locale: string) {
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return bytes >= 1048576 ? `${nf.format(bytes / 1048576)} MB` : `${nf.format(Math.max(1, Math.round(bytes / 1024)))} KB`;
}

/**
 * Printing resources. A card offers Download (and Preview for PDFs) only when its file exists on
 * disk; until then it says "coming soon" and the file can be requested by email.
 */
export function Downloads({ c, locale, images, contact = fileContact }: { c: Printing["downloads"]; locale: string; images: Media["printing"]; contact?: Contact }) {
  return (
    <section id="downloads" className={`${styles.downloads} ${styles.onDark}`} aria-labelledby="downloads-title">
      <div className={styles.navyBg} aria-hidden="true">
        <Image src={images.bgNavy.src} alt="" fill sizes="100vw" quality={70} data-no-mirror />
      </div>
      <div className={styles.inner}>
        <div className={styles.dlGrid}>
          <div className={styles.booklet} aria-hidden="true">
            <span className={styles.sheet} />
            <span className={styles.sheet} />
            <span className={styles.sheet}>
              <span className={`${styles.sheetBrand} ltr`} lang="en">
                ARAPOUSH
              </span>
              <span className={styles.sheetTitle}>{t(c.guideTitle, locale)}</span>
            </span>
          </div>
          <div className={styles.dlCopy} data-reveal>
            <p className={styles.kicker} lang={locale === "fa" ? "en" : undefined}>
              {t(c.eyebrow, locale)}
            </p>
            <h2 id="downloads-title" className={styles.h2}>
              {t(c.title, locale)}
            </h2>
            <p className={styles.lead}>{t(c.lead, locale)}</p>
            <ul className={styles.files}>
              {c.items.map((d) => {
                const name = t(d.name, locale);
                const request = `mailto:${contact.email}?subject=${encodeURIComponent(fill(t(c.requestSubject, locale), { name }))}`;
                return (
                  <li key={d.id} className={styles.file}>
                    <div className={styles.fileHead}>
                      <span className={styles.fileFormat} lang="en">
                        {d.format}
                      </span>
                      <span className={styles.fileName}>{name}</span>
                    </div>
                    <p className={styles.fileText}>{t(d.text, locale)}</p>
                    {d.file ? (
                      <>
                        <p className={`${styles.fileMeta} ltr`}>
                          {d.format}
                          {d.size ? ` · ${fileSize(d.size, locale)}` : ""}
                        </p>
                        <div className={styles.fileActions}>
                          <a href={d.file} download className={styles.fileBtn}>
                            <DownloadIcon />
                            {t(c.download, locale)}
                          </a>
                          {d.format === "PDF" && (
                            <a href={d.file} target="_blank" rel="noopener" className={`${styles.fileBtn} ${styles.ghostBtn}`}>
                              <EyeIcon />
                              {t(c.preview, locale)}
                            </a>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <span className={styles.soon}>{t(c.soon, locale)}</span>
                        <div className={styles.fileActions}>
                          <a href={request} className={`${styles.fileBtn} ${styles.ghostBtn}`}>
                            <MailIcon />
                            {t(c.request, locale)}
                          </a>
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Comparison: a table on wide screens, one card per method on phones. A dash means "not stated". */
export function Comparison({ c, techs, locale, contact = fileContact }: { c: Printing["compare"]; techs: Tech[]; locale: string; contact?: Contact }) {
  const cell = (id: Tech["id"], col: string) => {
    const v = c.rows[id]?.[col];
    return v ? t(v, locale) : null;
  };
  const mail = quoteMailto({ to: contact.email, subject: t(c.title, locale), spec: [], fields: [], link: `${siteUrl}/${locale}/printing#compare` });
  return (
    <section id="compare" className={styles.compare} aria-labelledby="compare-title">
      <div className={styles.inner}>
        <div className={styles.compareGrid}>
          <div className={styles.tableWrap} tabIndex={0} role="region" aria-labelledby="compare-title">
            <table className={styles.table}>
              <caption className="sr-only">{t(c.title, locale)}</caption>
              <thead>
                <tr>
                  <th scope="col">{t(c.method, locale)}</th>
                  {c.columns.map((col) => (
                    <th key={col.id} scope="col">
                      {t(col.label, locale)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {techs.map((tech) => (
                  <tr key={tech.id}>
                    <th scope="row">
                      <span className={styles.methodCell}>
                        <span className={styles.methodThumb} aria-hidden="true">
                          <Image src={tech.card.src} alt="" fill sizes="44px" data-no-mirror />
                        </span>
                        {t(tech.short, locale)}
                      </span>
                    </th>
                    {c.columns.map((col) => {
                      const v = cell(tech.id, col.id);
                      return <td key={col.id}>{v ?? <span className={styles.dash}>—</span>}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.compareCards}>
            {techs.map((tech) => (
              <article key={tech.id} className={styles.compareCard}>
                <h3>{t(tech.name, locale)}</h3>
                <dl>
                  {c.columns.map((col) => (
                    <div key={col.id} style={{ display: "contents" }}>
                      <dt>{t(col.label, locale)}</dt>
                      <dd>{cell(tech.id, col.id) ?? "—"}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
          <div className={styles.compareIntro} data-reveal>
            <p className={styles.kicker} lang={locale === "fa" ? "en" : undefined}>
              {t(c.eyebrow, locale)}
            </p>
            <h2 id="compare-title" className={styles.h2}>
              {t(c.title, locale)}
            </h2>
            <p className={styles.lead}>{t(c.lead, locale)}</p>
            <div>
              <a href={mail} className="btn">
                <RollText text={t(c.cta, locale)} />
                <ArrowIcon className={styles.arrow} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Closing consultation, right before the shared footer. Carries #contact for the header's quote button. */
export function PrintCta({ c, locale, images, contact = fileContact }: { c: Printing["cta"]; locale: string; images: Media["printing"]; contact?: Contact }) {
  const mail = quoteMailto({ to: contact.email, subject: t(c.subject, locale), spec: [t(c.title, locale)], fields: [], link: `${siteUrl}/${locale}/printing` });
  return (
    <section id="contact" className={styles.cta} aria-labelledby="print-cta-title">
      <div className={styles.heroBg} aria-hidden="true">
        <Image src={images.bgLight.src} alt="" fill sizes="100vw" quality={70} data-no-mirror />
      </div>
      <div className={styles.inner}>
        <div className={styles.ctaGrid}>
          <div className={styles.ctaArt} data-parallax="40">
            <Image src={images.ctaTube.src} alt={t(c.tubeAlt, locale)} width={images.ctaTube.width} height={images.ctaTube.height} sizes="(max-width: 1099px) 92vw, 46vw" data-no-mirror />
          </div>
          <div className={styles.ctaCopy} data-reveal>
            <h2 id="print-cta-title" className={styles.h2}>
              {t(c.title, locale)}
            </h2>
            <p className={styles.lead}>{t(c.lead, locale)}</p>
            <div className={styles.ctaActions}>
              <a href={mail} className="btn">
                <RollText text={t(c.consult, locale)} />
                <ArrowIcon className={styles.arrow} />
              </a>
              <a href={contact.phoneHref} className={`btn ${styles.ghost}`}>
                <PhoneIcon />
                <RollText text={t(c.call, locale)} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
