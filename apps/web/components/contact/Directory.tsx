"use client";

import { useRef, useState } from "react";
import p from "@/components/printing/Printing.module.css";
import { t, telHref, type Contact, type Department } from "@/lib/contactText";
import { ClockIcon, DeptGlyph, HashIcon, MailIcon, MobileIcon, PhoneIcon, UserIcon } from "./ContactIcons";
import s from "./Contact.module.css";

type Labels = Contact["directory"]["labels"];

/**
 * Department directory: direct lines, extensions and each specialist's mobile.
 * `tabs` shows one department at a time (every panel stays in the HTML for search engines);
 * `grid` lists them all as cards.
 */
export default function Directory({ c, locale }: { c: Contact["directory"]; locale: string }) {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const list = c.departments;

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const rtl = document.documentElement.dir === "rtl";
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[e.key];
    const next = step ? (i + step + list.length) % list.length : e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <section id="departments" className={s.section} aria-labelledby="departments-title">
      <div className={p.inner}>
        <header className={s.head} data-reveal>
          <span className={p.kicker}>{t(c.kicker, locale)}</span>
          <h2 id="departments-title" className={p.h2}>
            {t(c.title, locale)}
          </h2>
          <p className={p.lead}>{t(c.lead, locale)}</p>
        </header>

        {c.style === "grid" ? (
          <div className={s.deptGrid}>
            {list.map((d) => (
              <article key={d.id} className={s.deptCard} data-reveal aria-labelledby={`dept-${d.id}`}>
                <DeptBody d={d} l={c.labels} locale={locale} />
              </article>
            ))}
          </div>
        ) : (
          <>
            <div className={s.tabs} role="tablist" aria-label={t(c.title, locale)} data-reveal>
              {list.map((d, i) => (
                <button
                  key={d.id}
                  ref={(el) => {
                    tabs.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`tab-${d.id}`}
                  aria-selected={i === active}
                  aria-controls={`panel-${d.id}`}
                  tabIndex={i === active ? 0 : -1}
                  className={s.tab}
                  onClick={() => setActive(i)}
                  onKeyDown={(e) => onKey(e, i)}
                >
                  <DeptGlyph icon={d.icon} className={s.tabIcon} />
                  <span>{t(d.name, locale)}</span>
                </button>
              ))}
            </div>
            {list.map((d, i) => (
              <div key={d.id} id={`panel-${d.id}`} role="tabpanel" aria-labelledby={`tab-${d.id}`} hidden={i !== active} className={s.panel}>
                <DeptBody d={d} l={c.labels} locale={locale} />
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  );
}

function DeptBody({ d, l, locale }: { d: Department; l: Labels; locale: string }) {
  const hours = d.hours.map((h) => t(h, locale)).filter(Boolean);
  return (
    <div className={s.dept}>
      <div className={s.deptInfo}>
        <div className={s.deptHead}>
          <span className={s.deptBadge}>
            <DeptGlyph icon={d.icon} />
          </span>
          <h3 id={`dept-${d.id}`} className={s.h3}>
            {t(d.name, locale)}
          </h3>
        </div>
        <p className={s.text}>{t(d.summary, locale)}</p>
        <dl className={s.facts}>
          {d.phones.length > 0 && (
            <div className={s.fact}>
              <dt>
                <PhoneIcon className={s.factIcon} />
                {t(l.phones, locale)}
              </dt>
              <dd className={s.chips}>
                {d.phones.map((n) => (
                  <a key={n} href={telHref(n)} className={s.chip} dir="ltr">
                    {n}
                  </a>
                ))}
              </dd>
            </div>
          )}
          {d.email && (
            <div className={s.fact}>
              <dt>
                <MailIcon className={s.factIcon} />
                {t(l.email, locale)}
              </dt>
              <dd>
                <a href={`mailto:${d.email}`} className={`u-link ${s.ltr}`} dir="ltr">
                  {d.email}
                </a>
              </dd>
            </div>
          )}
          {hours.length > 0 && (
            <div className={s.fact}>
              <dt>
                <ClockIcon className={s.factIcon} />
                {t(l.hours, locale)}
              </dt>
              <dd>
                {hours.map((h) => (
                  <span key={h} className={s.line}>
                    {h}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {d.people.length > 0 && (
        <div className={s.people}>
          <h4 className={s.peopleTitle}>{t(l.team, locale)}</h4>
          <ul className={s.personList}>
            {d.people.map((m) => (
              <li key={t(m.name, "fa")} className={s.person}>
                <span className={s.avatar}>
                  <UserIcon />
                </span>
                <div className={s.personMain}>
                  <span className={s.personName}>{t(m.name, locale)}</span>
                  <span className={s.personRole}>{t(m.role, locale)}</span>
                </div>
                <div className={s.personLinks}>
                  {m.exts.length > 0 && (
                    <span className={s.ext} title={t(l.extHint, locale)}>
                      <HashIcon className={s.factIcon} />
                      <span className={s.srOnly}>{t(l.ext, locale)}</span>
                      <span dir="ltr">{m.exts.join(" · ")}</span>
                    </span>
                  )}
                  {(m.mobiles ?? []).map((n) => (
                    <a key={n} href={telHref(n)} className={s.mobile} aria-label={`${t(l.mobile, locale)} ${t(m.name, locale)}: ${n}`}>
                      <MobileIcon className={s.factIcon} />
                      <span dir="ltr">{n}</span>
                    </a>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <p className={s.hint}>{t(l.extHint, locale)}</p>
        </div>
      )}
    </div>
  );
}
