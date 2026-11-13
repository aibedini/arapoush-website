import Image from "next/image";
import RollText from "@/components/ui/RollText";
import { t, type Applications } from "@/lib/applicationsText";
import { productPaths } from "@/lib/site";
import IndustryTabs from "./IndustryTabs";
import { ArrowIcon, CheckIcon } from "./AppIcons";
import styles from "./Applications.module.css";

const num = (n: number, locale: string) => new Intl.NumberFormat(locale === "fa" ? "fa-IR" : locale).format(n).padStart(2, locale === "fa" ? "۰" : "0");

/**
 * One panel per industry: photo, what it needs, how Arapoush answers it, typical products, and the
 * way to configure a tube or ask for a quote. Every panel is rendered here; IndustryTabs shows one.
 */
export default function IndustryShowcase({ c, locale }: { c: Applications["industries"]; locale: string }) {
  return (
    <section id="industries" className={styles.industries} aria-labelledby="industries-title">
      <div className={styles.inner}>
        <header className={styles.head}>
          <p className={styles.kicker} lang={locale === "fa" ? "en" : undefined}>
            {t(c.eyebrow, locale)}
          </p>
          <h2 id="industries-title" className={styles.h2}>
            {t(c.title, locale)}
          </h2>
          <p className={styles.lead} data-reveal>
            {t(c.lead, locale)}
          </p>
        </header>

        <IndustryTabs items={c.items.map((x) => ({ id: x.id, name: t(x.name, locale), accent: x.accent }))} label={t(c.tabsLabel, locale)}>
          {c.items.map((x) => (
            <div key={x.id} id={x.id} role="tabpanel" aria-labelledby={`tab-${x.id}`} tabIndex={0} className={styles.panel} data-panel={x.id} style={{ "--accent": x.accent } as React.CSSProperties}>
              <div className={styles.panelMedia}>
                <Image src={x.image.src} alt="" fill sizes="(max-width: 1099px) 92vw, 40vw" className={x.id === "industrial" ? styles.contain : undefined} data-no-mirror />
                <span className={styles.panelLabel} lang={locale === "fa" ? "en" : undefined}>
                  {t(x.label, locale)}
                </span>
              </div>
              <div className={styles.panelCopy}>
                <h3 className={styles.panelTitle}>
                  <span className={styles.panelName}>{t(x.name, locale)}</span>
                  {t(x.title, locale)}
                </h3>
                <p className={styles.panelLead}>{t(x.lead, locale)}</p>

                <h4 className={styles.label}>{t(c.needsLabel, locale)}</h4>
                <ol className={styles.needs}>
                  {x.needs.map((n, i) => (
                    <li key={n.title.en}>
                      <span className={styles.needNum} aria-hidden="true">
                        {num(i + 1, locale)}
                      </span>
                      <strong>{t(n.title, locale)}</strong>
                      <span>{t(n.text, locale)}</span>
                    </li>
                  ))}
                </ol>

                <h4 className={styles.label}>{t(c.solutionsLabel, locale)}</h4>
                <ul className={styles.solutions}>
                  {x.solutions.map((s) => (
                    <li key={s.title.en}>
                      <CheckIcon className={styles.check} />
                      <span>
                        <strong>{t(s.title, locale)}</strong> {t(s.text, locale)}
                      </span>
                    </li>
                  ))}
                </ul>

                <h4 className={styles.label}>{t(c.examplesLabel, locale)}</h4>
                <ul className={styles.examples}>
                  {x.examples.map((e) => (
                    <li key={e.en}>{t(e, locale)}</li>
                  ))}
                </ul>

                <div className={styles.ctas}>
                  <a href={`/${locale}${productPaths.tube}?${x.configure}#configurator`} className="btn">
                    <RollText text={t(c.configure, locale)} />
                    <ArrowIcon className={styles.arrow} />
                  </a>
                  <a href="#quote" className={`btn ${styles.ghost}`} data-ask-industry={x.id}>
                    <RollText text={t(c.quote, locale)} />
                  </a>
                  {x.more && (
                    <a href={`/${locale}${x.more.href}`} className={styles.textLink}>
                      {t(x.more.label, locale)}
                      <ArrowIcon className={styles.arrow} />
                    </a>
                  )}
                </div>
              </div>
              <details className={styles.more}>
                <summary>{t(c.readMore, locale)}</summary>
                <p>{t(x.body, locale)}</p>
              </details>
            </div>
          ))}
        </IndustryTabs>
      </div>
    </section>
  );
}
