import RollText from "@/components/ui/RollText";
import p from "@/components/printing/Printing.module.css";
import { t, type Contact } from "@/lib/contactText";
import { ArrowIcon, PlusIcon } from "./ContactIcons";
import s from "./Contact.module.css";

/**
 * Frequently asked questions, grouped, as native disclosure widgets (no script). The answers are in
 * the HTML and in the page's FAQPage structured data.
 */
export default function Faq({ c, locale }: { c: Contact["faq"]; locale: string }) {
  return (
    <section id="faq" className={s.section} aria-labelledby="faq-title">
      <div className={p.inner}>
        <header className={s.head} data-reveal>
          <span className={p.kicker}>{t(c.kicker, locale)}</span>
          <h2 id="faq-title" className={p.h2}>
            {t(c.title, locale)}
          </h2>
          <p className={p.lead}>{t(c.lead, locale)}</p>
        </header>
        <div className={s.faqLayout}>
          <div className={s.faqGroups}>
            {c.groups.map((g) => (
              <div key={g.id} className={s.faqGroup} data-reveal>
                <h3 className={s.faqGroupTitle}>{t(g.title, locale)}</h3>
                {g.items.map((q) => (
                  <details key={t(q.q, "en")} className={s.qa}>
                    <summary>
                      <span>{t(q.q, locale)}</span>
                      <PlusIcon className={s.qaIcon} />
                    </summary>
                    <p>{t(q.a, locale)}</p>
                  </details>
                ))}
              </div>
            ))}
          </div>
          <aside className={s.faqAside} data-reveal>
            <h3 className={s.asideTitle}>{t(c.aside.title, locale)}</h3>
            <p className={s.asideText}>{t(c.aside.text, locale)}</p>
            <a href="#contact" className="btn btn--light">
              <RollText text={t(c.aside.cta, locale)} />
              <ArrowIcon className={p.arrow} />
            </a>
          </aside>
        </div>
      </div>
    </section>
  );
}
