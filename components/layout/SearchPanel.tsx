"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@animate-ui/react/primitives/radix-ui";
import type { Dictionary } from "@/lib/i18n";
import { Search, ArrowRight } from "@/components/ui/icons";
import styles from "./SearchDialog.module.css";

type Entry = { group: keyof Dictionary["search"]["groups"]; title: string; text?: string; href: string };

const CERT_CODES = ["GMP", "ISO 9001", "IFDA", "INSO"];

function buildIndex(t: Dictionary): Entry[] {
  return [
    { group: "section", title: t.products.eyebrow, text: t.products.lead, href: "#products" },
    { group: "section", title: t.applications.eyebrow, text: t.applications.lead, href: "#applications" },
    { group: "section", title: t.insights.eyebrow, text: t.insights.lead, href: "#insights" },
    { group: "section", title: t.partners.eyebrow, text: t.partners.lead.join(" "), href: "#partners" },
    { group: "section", title: t.certifications.eyebrow, text: t.certifications.lead, href: "#certifications" },
    { group: "section", title: t.cta.contact, text: t.cta.lead, href: "#contact" },
    ...t.products.cards.map((c) => ({ group: "product" as const, title: c.title.join(" "), text: c.text, href: "#products" })),
    ...t.applications.items.map((a) => ({ group: "application" as const, title: a.title, text: a.text, href: "#applications" })),
    ...t.insights.articles.map((a) => ({ group: "article" as const, title: a.title, text: a.text, href: "#insights" })),
    ...t.certifications.items.map((c, i) => ({ group: "certificate" as const, title: `${CERT_CODES[i]} — ${c.name}`, text: c.text, href: "#certifications" })),
  ];
}

// Folds Arabic/Persian letter variants and ZWNJ so "كيفيت" finds "کیفیت".
const fold = (s: string) =>
  s.toLocaleLowerCase().replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/‌/g, " ").normalize("NFKD").replace(/[̀-ͯ]/g, "");

type Props = { t: Dictionary; open: boolean; onOpenChange: (open: boolean) => void; returnFocus: () => void };

/** Site search panel: animate-ui's Radix dialog (focus trap, Escape) over a client-side index.
 *  Loaded on first intent by SearchDialog, so Radix stays out of the startup bundle. */
export default function SearchPanel({ t, open, onOpenChange, returnFocus }: Props) {
  const setOpen = onOpenChange;
  const [q, setQ] = useState("");
  const index = useMemo(() => buildIndex(t), [t]);
  const results = useMemo(() => {
    const needle = fold(q.trim());
    if (!needle) return [];
    return index.filter((e) => fold(`${e.title} ${e.text ?? ""}`).includes(needle)).slice(0, 8);
  }, [q, index]);

  const go = (href: string) => {
    setOpen(false);
    // Let the dialog release scroll lock before jumping.
    window.setTimeout(() => {
      document.querySelector(href)?.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", href);
    }, 220);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setQ("");
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.content}
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            // No Radix Trigger here (the button lives in SearchDialog), so hand focus back ourselves.
            e.preventDefault();
            returnFocus();
          }}
        >
          <Dialog.Title className="sr-only">{t.search.title}</Dialog.Title>
          <form
            className={styles.field}
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              if (results[0]) go(results[0].href);
            }}
          >
            <Search className={styles.fieldIcon} />
            <input
              autoFocus
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.search.placeholder}
              aria-label={t.search.title}
              className={styles.input}
            />
            <Dialog.Close className={styles.close} aria-label={t.search.close}>
              <span aria-hidden="true">Esc</span>
            </Dialog.Close>
          </form>

          <div className={styles.body} aria-live="polite">
            {!q.trim() && <p className={styles.hint}>{t.search.hint}</p>}
            {q.trim() && results.length === 0 && <p className={styles.hint}>{t.search.empty}</p>}
            {results.length > 0 && (
              <ul className={styles.list}>
                {results.map((r) => (
                  <li key={`${r.group}-${r.title}`}>
                    <a
                      href={r.href}
                      className={styles.result}
                      onClick={(e) => {
                        e.preventDefault();
                        go(r.href);
                      }}
                    >
                      <span className={styles.group}>{t.search.groups[r.group]}</span>
                      <span className={styles.rTitle}>{r.title}</span>
                      <ArrowRight className={styles.rIcon} color="currentColor" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
