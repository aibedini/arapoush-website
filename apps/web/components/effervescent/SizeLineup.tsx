"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import RollText from "@/components/ui/RollText";
import type { Dictionary } from "@/lib/i18n";
import type { EffProduct } from "@/lib/products";
import { contact as fileContact, type Contact } from "@/lib/site";
import QuoteSheet from "./QuoteSheet";
import styles from "./Effervescent.module.css";

type Props = { t: Dictionary["productEff"]["sizes"]; product: EffProduct; locale: string; contact?: Contact; direct?: boolean };

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

/**
 * The five standard sizes side by side at true relative scale (renders from the parametric model,
 * one shared px-per-mm), with the selected size's dimensions and a quote form that unfolds in place.
 */
export default function SizeLineup({ t, product, locale, contact = fileContact, direct }: Props) {
  const [id, setId] = useState(product.defaultSize);
  const [sheet, setSheet] = useState<{ x: number; y: number } | null>(null);
  const group = useRef<HTMLDivElement>(null);
  const cta = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLElement>(null);
  const nf = new Intl.NumberFormat(locale);
  const sel = product.sizes.find((s) => s.id === id) ?? product.sizes[0]!;
  const label = (d: number, h: number) => `Ø${nf.format(d)} × ${nf.format(h)}`;
  const k = product.renderPxPerMm;

  useEffect(() => {
    const media = matchMedia("(max-width: 767px)");
    const centerSelected = () => {
      if (!media.matches || !group.current) return;
      const track = group.current;
      const selected = track.querySelector<HTMLElement>(`[data-id="${id}"]`);
      if (!selected) return;
      const trackBox = track.getBoundingClientRect();
      const selectedBox = selected.getBoundingClientRect();
      track.scrollLeft += selectedBox.left + selectedBox.width / 2 - trackBox.left - trackBox.width / 2;
    };
    centerSelected();
    media.addEventListener("change", centerSelected);
    return () => media.removeEventListener("change", centerSelected);
  }, [id]);

  // Radio-group keyboard pattern: arrows move the selection (and focus) along the line-up.
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const n = product.sizes.length;
    const next = product.sizes[(i + step + n) % n]!;
    setId(next.id);
    group.current?.querySelector<HTMLElement>(`[data-id="${next.id}"]`)?.focus();
  };

  const close = useCallback(() => {
    setSheet(null);
    cta.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section id="sizes" className={styles.sizes} aria-labelledby="sizes-title">
      <header className={styles.head} data-reveal>
        <h2 id="sizes-title" className="t-h2">
          {t.title}
        </h2>
        <p className="t-lead t-muted">{t.lead}</p>
      </header>

      <div className={styles.sizesGrid}>
        <div ref={group} className={styles.lineup} role="radiogroup" aria-label={t.label}>
          {product.sizes.map((s, i) => {
            const r = s.render;
            const on = s.id === id;
            const style = {
              "--w": r.width / k,
              "--hgt": r.height / k,
              "--base": r.base / r.height,
              "--mouth": r.mouth / r.height,
              "--l": r.left / r.width,
              "--r": r.right / r.width,
            } as CSSProperties;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                data-id={s.id}
                className={styles.size}
                onClick={() => setId(s.id)}
                onKeyDown={(e) => onKey(e, i)}
              >
                <span className={styles.figure} style={style}>
                  <Image src={r.src} alt="" width={r.width} height={r.height} sizes="(max-width: 767px) 30vw, 160px" data-no-mirror />
                  <span className={styles.dimH} aria-hidden="true">
                    <span className="ltr">{nf.format(s.h)}</span>
                  </span>
                  <span className={styles.dimD} aria-hidden="true">
                    <span className="ltr">Ø{nf.format(s.d)}</span>
                  </span>
                </span>
                <span className={styles.sizeLabel}>
                  <span className="ltr">{label(s.d, s.h)}</span>
                  <span className="sr-only"> {t.mm}</span>
                </span>
              </button>
            );
          })}
        </div>

        <aside ref={card} className={styles.detail} data-sheet={sheet ? "" : undefined}>
          <div className={styles.detailFace} aria-hidden={sheet ? true : undefined} inert={sheet ? true : undefined}>
            <dl className={styles.detailDims} aria-live="polite">
              <div>
                <dt>{t.diameter}</dt>
                <dd>
                  <span className="ltr">{nf.format(sel.d)}</span>
                  <small>{t.mm}</small>
                </dd>
              </div>
              <div>
                <dt>{t.height}</dt>
                <dd>
                  <span className="ltr">{nf.format(sel.h)}</span>
                  <small>{t.mm}</small>
                </dd>
              </div>
            </dl>
            <p className={styles.detailNote}>{t.toScale}</p>
            <button
              ref={cta}
              type="button"
              className="btn"
              aria-expanded={!!sheet}
              onClick={(e) => {
                const box = card.current!.getBoundingClientRect();
                const b = e.currentTarget.getBoundingClientRect();
                setSheet({ x: b.left + b.width / 2 - box.left, y: b.top + b.height / 2 - box.top });
              }}
            >
              <RollText text={fill(t.quote, { size: label(sel.d, sel.h) })} />
            </button>
          </div>
          <QuoteSheet t={t.form} size={label(sel.d, sel.h)} unit={t.mm} email={contact.email} open={!!sheet} origin={sheet} onClose={close} locale={locale} direct={direct} />
        </aside>
      </div>
    </section>
  );
}
