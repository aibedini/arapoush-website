"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { getImageProps } from "next/image";
import { SlidingNumber } from "@animate-ui/react/primitives/texts/sliding-number";
import type { Dictionary } from "@/lib/i18n";
import {
  DEFAULT_CONFIG,
  capacity,
  closureOf,
  closureStatus,
  closuresForShape,
  diametersFor,
  fromSearch,
  lengthsFor,
  loc,
  normalize,
  sameVolume,
  sceneModels,
  shapeOf,
  structureOf,
  structuresFor,
  toSearch,
  withDiameter,
  withShape,
  type TubeConfig,
  type TubeProduct,
} from "@/lib/configurator/model";
import { contact as fileContact, type Contact } from "@/lib/site";
import ChipGroup from "./ChipGroup";
import Viewer from "./Viewer";
import Samples from "./Samples";
import QuoteForm from "./QuoteForm";
import chip from "@/components/product/Product.module.css";
import styles from "./Configurator.module.css";

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

type Props = { t: Dictionary["productTube"]; locale: string; product: TubeProduct; contact?: Contact; direct?: boolean };

/** Every option below comes from the product content (admin panel); nothing here lists shapes, closures or sizes. */
export default function Configurator({ t, locale, product: cat, contact = fileContact, direct }: Props) {
  const c = t.configurator;
  const id = useId();
  const [cfg, setCfg] = useState<TubeConfig>(() => normalize(cat, DEFAULT_CONFIG));
  const [shared, setShared] = useState(false);
  const urlReady = useRef(false);

  // A shared link restores its configuration; anything invalid is normalised before it is shown.
  useEffect(() => {
    if (new URLSearchParams(location.search).has("shape")) setCfg(fromSearch(cat, location.search));
  }, [cat]);
  useEffect(() => {
    // First run is the default config: leave a clean URL until something is chosen.
    if (!urlReady.current) {
      urlReady.current = true;
      return;
    }
    const url = new URL(location.href);
    if (url.search === `?${toSearch(cfg)}`) return;
    url.search = toSearch(cfg);
    history.replaceState(history.state, "", url);
  }, [cfg]);

  const shape = shapeOf(cat, cfg.shape)!;
  const closure = closureOf(cat, cfg.closure)!;
  const structure = structureOf(cat, cfg.structure);
  const structures = structuresFor(cat, cfg.shape, cfg.d, cfg.closure);
  const cap = capacity(cat, cfg);
  const shapeName = loc(shape.name, locale);
  const closureName = loc(closure.name, locale);
  const structureName = loc(structure?.name, locale);
  const status = closureStatus(cat, cfg.closure, cfg.shape, cfg.d);
  const twins = sameVolume(cat, cfg);
  const size = `Ø${cfg.d} × ${cfg.l} mm`;
  const spec = [
    `${shapeName} · ${size}`,
    closureName,
    ...(structureName ? [structureName] : []),
    cap ? `${cap.ml} ml (${cap.status === "chart" ? c.statusChart : c.statusEstimate})` : c.noVolume,
  ];

  const models = sceneModels(cat, cfg);
  const scene = useMemo(() => ({ d: cfg.d, l: cfg.l, shape: models.shape, closure: models.closure }), [cfg.d, cfg.l, models.shape, models.closure]);
  const labels = useMemo(
    () => ({
      layers: (structure?.layers ?? []).map((l) => ({ name: loc(l.name, locale), color: l.color })),
      closure: closureName,
      notToScale: c.notToScale,
    }),
    [structure, locale, closureName, c.notToScale],
  );

  const shareLink = async () => {
    const url = `${location.origin}${location.pathname}?${toSearch(cfg)}`;
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) await navigator.share({ title: document.title, text: spec.join(" — "), url });
      else {
        await navigator.clipboard.writeText(url);
        setShared(true);
        setTimeout(() => setShared(false), 2200);
      }
    } catch {
      /* share sheet dismissed */
    }
  };

  return (
    <>
      <section id="configurator" className={styles.section} aria-labelledby={`${id}-title`}>
        <header className={styles.head} data-reveal>
          <p className="eyebrow">{c.eyebrow}</p>
          <h2 id={`${id}-title`} className={styles.title}>
            {c.title}
          </h2>
          <p className={styles.lead}>{c.lead}</p>
        </header>

        <div className={styles.grid}>
          <Viewer
            cfg={scene}
            label={fill(c.viewerLabel, { shape: shapeName, d: cfg.d, l: cfg.l, closure: closureName })}
            labels={labels}
            caption={`ARAPOUSH · ${shapeName} ${size} · ${closureName}`}
            fileName={`arapoush-${cfg.shape}-${cfg.d}x${cfg.l}-${cfg.closure}.png`}
            t={c}
          />

          <div className={styles.controls}>
            <Field id={`${id}-d`} title={c.diameter} unit={c.mm}>
              <ChipGroup
                labelledBy={`${id}-d`}
                className={`${chip.chips} ${styles.diameters}`}
                value={String(cfg.d)}
                onChange={(v) => setCfg(withDiameter(cat, cfg, Number(v)))}
                items={diametersFor(cat, cfg.shape).map((d) => ({ key: String(d), content: d }))}
              />
            </Field>

            <Field id={`${id}-l`} title={c.length} unit={c.mm}>
              <ChipGroup
                labelledBy={`${id}-l`}
                className={`${chip.chips} ${chip.lenChips} ${styles.lengths}`}
                chipClass={chip.lenChip}
                pillClass={chip.lenPill}
                value={String(cfg.l)}
                onChange={(v) => setCfg(normalize(cat, { ...cfg, l: Number(v) }))}
                items={lengthsFor(cat, cfg.shape, cfg.d).map((l) => {
                  const v = capacity(cat, { ...cfg, l });
                  return {
                    key: String(l),
                    label: v ? `${l} ${c.mm}, ${v.ml} ${c.ml}` : `${l} ${c.mm}`,
                    content: (
                      <>
                        <span className={chip.lenMm}>{l}</span>
                        <span className={chip.lenMl}>{v ? `${v.ml} ${c.ml}` : "—"}</span>
                      </>
                    ),
                  };
                })}
              />
            </Field>

            <Field id={`${id}-s`} title={c.shape}>
              <div className={`${styles.cards} ${styles.cards3}`} role="group" aria-labelledby={`${id}-s`}>
                {cat.shapes.map((s) => (
                  <Card key={s.id} checked={cfg.shape === s.id} onSelect={() => setCfg(withShape(cat, cfg, s.id))} img={s.image} name={loc(s.name, locale)} />
                ))}
              </div>
            </Field>

            <Field id={`${id}-c`} title={c.closure}>
              <div className={`${styles.cards} ${styles.cards4}`} role="group" aria-labelledby={`${id}-c`}>
                {closuresForShape(cat, cfg.shape).map((k) => {
                  const st = closureStatus(cat, k.id, cfg.shape, cfg.d);
                  return (
                    <Card
                      key={k.id}
                      checked={cfg.closure === k.id}
                      disabled={!st}
                      onSelect={() => setCfg(normalize(cat, { ...cfg, closure: k.id }))}
                      img={k.image}
                      name={loc(k.name, locale)}
                      note={!st ? fill(c.notOffered, { d: cfg.d }) : st === "confirm" ? c.toConfirm : undefined}
                    />
                  );
                })}
              </div>
              {status === "confirm" && <p className={styles.notice}>{fill(c.confirmNote, { closure: closureName })}</p>}
            </Field>

            {structures.length > 1 && (
              <Field id={`${id}-w`} title={c.specStructure}>
                <ChipGroup
                  labelledBy={`${id}-w`}
                  value={cfg.structure}
                  onChange={(v) => setCfg(normalize(cat, { ...cfg, structure: v }))}
                  items={structures.map((s) => ({ key: s.id, content: loc(s.name, locale) }))}
                />
              </Field>
            )}
          </div>

          <aside className={styles.result} aria-label={c.volume}>
            <div className={styles.resultTop} aria-live="polite">
              <p className={styles.resultLabel}>{c.volume}</p>
              {cap ? (
                <p className={styles.resultValue}>
                  <span className="ltr">
                    <SlidingNumber number={cap.ml} />
                  </span>
                  <span className={styles.resultUnit}>{c.ml}</span>
                </p>
              ) : (
                <p className={styles.noVolume}>{c.noVolume}</p>
              )}
              <p className={styles.resultSize}>
                <span className="ltr">{size}</span>
              </p>
              {cap && <p className={`${styles.badge} ${cap.status === "estimate" ? styles.badgeWarn : ""}`}>{cap.status === "chart" ? c.statusChart : c.statusEstimate}</p>}
              <svg className={styles.wave} viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
                <path d="M0 70 C80 30 160 110 250 70 S360 40 400 60 V120 H0 Z" fill="rgba(255,255,255,.07)" />
                <path d="M0 96 C110 52 190 112 280 84 S370 58 400 66" fill="none" stroke="#e8893a" strokeOpacity=".7" strokeWidth="1.5" />
              </svg>
            </div>

            <dl className={styles.specs}>
              <div>
                <dt>{c.specShape}</dt>
                <dd>{shapeName}</dd>
              </div>
              <div>
                <dt>{c.specSize}</dt>
                <dd>
                  <span className="ltr">{size}</span>
                </dd>
              </div>
              <div>
                <dt>{c.specClosure}</dt>
                <dd>{closureName}</dd>
              </div>
              {structure && (
                <div>
                  <dt>{c.specStructure}</dt>
                  <dd>{structureName}</dd>
                </div>
              )}
            </dl>

            {twins.length > 0 && (
              <div className={styles.twins}>
                <span>{c.sameVolume}</span>
                <div>
                  {twins.map((s) => (
                    <button key={`${s.d}x${s.l}`} type="button" className={styles.twin} onClick={() => setCfg(normalize(cat, { ...cfg, d: s.d, l: s.l }))}>
                      <span className="ltr">
                        Ø{s.d} × {s.l}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.actions}>
              <a href="#quote" className="btn">
                <span>{c.quoteCta}</span>
              </a>
              <button type="button" className={styles.share} onClick={shareLink}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
                </svg>
                <span aria-live="polite">{shared ? c.copied : c.share}</span>
              </button>
            </div>
            <p className={styles.disclaimer}>{c.disclaimer}</p>
          </aside>
        </div>
      </section>

      <Samples t={c} locale={locale} product={cat} cfg={cfg} onApply={(patch) => setCfg(normalize(cat, { ...cfg, ...patch }))} />

      <QuoteForm t={c} spec={spec} subjectSpec={`${shapeName} ${size}, ${closureName}`} search={toSearch(cfg)} email={contact.email} locale={locale} direct={direct} />
    </>
  );
}

function Field({ id, title, unit, children }: { id: string; title: string; unit?: string; children: React.ReactNode }) {
  return (
    <div className={styles.field}>
      <p className={styles.fieldTitle} id={id}>
        {title}
        {unit && <span> ({unit})</span>}
      </p>
      {children}
    </div>
  );
}

function Card({ checked, disabled, onSelect, img, name, note }: { checked: boolean; disabled?: boolean; onSelect: () => void; img: string; name: string; note?: string }) {
  return (
    <button type="button" aria-pressed={checked} disabled={disabled} className={styles.card} onClick={onSelect}>
      {/* getImageProps: the optimizer's srcset without an Image component to hydrate per card (12+ closures). */}
      {/* eslint-disable-next-line jsx-a11y/alt-text, @next/next/no-img-element */}
      <img {...getImageProps({ src: img, alt: "", width: 640, height: 640, sizes: "96px" }).props} className={styles.cardImg} data-no-mirror />
      <span className={styles.cardName}>{name}</span>
      {note && <span className={styles.cardNote}>{note}</span>}
    </button>
  );
}
