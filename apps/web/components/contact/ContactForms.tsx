import OpexForm from "@/components/forms/LazyOpexForm";
import p from "@/components/printing/Printing.module.css";
import type { Dictionary } from "@/lib/i18n";
import type { PublicForm } from "@/lib/forms";
import { t, telHref, type Contact } from "@/lib/contactText";
import { pickL } from "@arapoush/schema";
import { CheckIcon } from "@/components/printing/PrintIcons";
import { PhoneIcon } from "./ContactIcons";
import FeedbackTabs from "./FeedbackTabs";
import s from "./Contact.module.css";

type FormProps = { locale: string; page: string; forms: Dictionary["forms"] };

/** The request form for every department (`#contact`, which the header's quote button targets). */
export function RequestSection({ c, form, phone, phoneLabel, ...f }: FormProps & { c: Contact["request"]; form?: PublicForm; phone: string; phoneLabel: string }) {
  if (!form) return null;
  return (
    <section id="contact" className={s.section} aria-labelledby="request-title">
      <div className={`${p.inner} ${s.formLayout}`}>
        <aside className={s.formAside} data-reveal>
          <span className={`${p.kicker} ${p.light}`}>{t(c.kicker, f.locale)}</span>
          <h2 id="request-title" className={s.asideTitle}>
            {t(c.title, f.locale)}
          </h2>
          <p className={s.asideText}>{t(c.lead, f.locale)}</p>
          <ul className={s.points}>
            {c.points.map((pt) => (
              <li key={t(pt, "fa")}>
                <CheckIcon />
                {t(pt, f.locale)}
              </li>
            ))}
          </ul>
          <a href={telHref(phone)} className={s.asidePhone}>
            <PhoneIcon className={s.factIcon} />
            <span>{phoneLabel}</span>
            <span dir="ltr">{phone}</span>
          </a>
        </aside>
        <div className={s.formCard} data-reveal>
          <OpexForm form={form} t={f.forms} locale={f.locale} page={f.page} />
        </div>
      </div>
    </section>
  );
}

/** Open positions and the application form. */
export function Careers({ c, form, ...f }: FormProps & { c: Contact["careers"]; form?: PublicForm }) {
  return (
    <section id="careers" className={s.section} aria-labelledby="careers-title">
      <div className={p.inner}>
        <header className={s.head} data-reveal>
          <span className={p.kicker}>{t(c.kicker, f.locale)}</span>
          <h2 id="careers-title" className={p.h2}>
            {t(c.title, f.locale)}
          </h2>
          <p className={p.lead}>{t(c.lead, f.locale)}</p>
        </header>
        <div className={s.careers}>
          <div className={s.openings} data-reveal>
            <h3 className={s.h3}>{t(c.openingsTitle, f.locale)}</h3>
            {c.openings.length ? (
              <ul className={s.openingList}>
                {c.openings.map((o) => (
                  <li key={o.id} className={s.opening}>
                    <div className={s.openingHead}>
                      <span className={s.openingTitle}>{t(o.title, f.locale)}</span>
                      <span className={s.tags}>
                        <span className={s.tag}>{t(o.location, f.locale)}</span>
                        <span className={s.tag}>{t(o.type, f.locale)}</span>
                      </span>
                    </div>
                    <p className={s.text}>{t(o.text, f.locale)}</p>
                    <a href="#apply" className={`u-link ${s.applyLink}`}>
                      {t(c.applyFor, f.locale)}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={s.text}>{t(c.empty, f.locale)}</p>
            )}
          </div>
          {form && (
            <div id="apply" className={s.formCard} data-reveal>
              <h3 className={s.formTitle}>{pickL(form.title, f.locale)}</h3>
              {pickL(form.intro, f.locale) && <p className={s.text}>{pickL(form.intro, f.locale)}</p>}
              <OpexForm form={form} t={f.forms} locale={f.locale} page={f.page} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** Suggestions and complaints: one card, two forms. */
export function Feedback({ c, list, ...f }: FormProps & { c: Contact["feedback"]; list: PublicForm[] }) {
  if (!list.length) return null;
  return (
    <section id="feedback" className={s.section} aria-labelledby="feedback-title">
      <div className={p.inner}>
        <header className={`${s.head} ${s.headCenter}`} data-reveal>
          <span className={p.kicker}>{t(c.kicker, f.locale)}</span>
          <h2 id="feedback-title" className={p.h2}>
            {t(c.title, f.locale)}
          </h2>
          <p className={p.lead}>{t(c.lead, f.locale)}</p>
        </header>
        <FeedbackTabs
          tabs={list.map((form) => ({ form, label: t(c.tabs.find((x) => x.form === form.slug)?.label, f.locale) || pickL(form.title, f.locale) }))}
          locale={f.locale}
          page={f.page}
          t={f.forms}
        />
      </div>
    </section>
  );
}
