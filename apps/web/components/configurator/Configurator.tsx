"use client";

import { useId, useMemo, useState } from "react";
import { getImageProps } from "next/image";
import { SlidingNumber } from "@animate-ui/react/primitives/texts/sliding-number";
import {
  capacity,
  closureOf,
  closureStatus,
  closuresForShape,
  diametersFor,
  lengthsFor,
  loc,
  normalize,
  sameVolume,
  sceneLook,
  sceneModels,
  coloursFor,
  colourOf,
  printOf,
  printsFor,
  shapeOf,
  structureOf,
  structuresFor,
  toSearch,
  withDiameter,
  withShape,
} from "@/lib/configurator/model";
import ChipGroup from "./ChipGroup";
import Viewer from "./Viewer";
import { useTube } from "./TubeState";
import chip from "@/components/product/Product.module.css";
import styles from "./Configurator.module.css";

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

/** `viewerStart`: the 3D viewer leads (default); `viewerEnd`: the options lead, the viewer follows. */
export type ConfiguratorStyle = "viewerStart" | "viewerEnd";
type Props = { style?: ConfiguratorStyle };

/**
 * Every option below comes from the product content (admin panel); nothing here lists shapes,
 * closures or sizes. The selection lives in <TubeState>, shared with samples and the quote.
 */
export default function Configurator({ style = "viewerStart" }: Props) {
  const id = useId();
  const { cat, cfg, setCfg, spec, c, locale } = useTube();
  const [shared, setShared] = useState(false);

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
  const families = coloursFor(cat, cfg.closure, cfg.shape, cfg.d);
  const family = colourOf(cat, cfg.colour);
  const capColourName = family ? `${loc(family.name, locale)}${family.kind === "custom" && cfg.capHex ? ` (${cfg.capHex.toUpperCase()})` : ""}` : "";
  const bodyName = loc(cat.bodyColours?.find((b) => b.hex === cfg.body)?.name, locale) || (cfg.body ?? "").toUpperCase();
  const prints = printsFor(cat, cfg.shape, cfg.d);
  const print = printOf(cat, cfg.print);
  const printName = print ? loc(print.name, locale) : c.noPrint;

  const models = sceneModels(cat, cfg);
  const shapeKey = JSON.stringify([models.closureShape ?? null, models.closureModel ?? null]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- shapeKey stands for closureShape and closureModel by value
  const scene = useMemo(() => ({ d: cfg.d, l: cfg.l, shape: models.shape, closure: models.closure, closureShape: models.closureShape, closureModel: models.closureModel }), [cfg.d, cfg.l, models.shape, models.closure, shapeKey]);
  const look = sceneLook(cat, cfg);
  const lookKey = JSON.stringify(look);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- lookKey stands for look by value
  const sceneCfg = useMemo(() => ({ ...scene, look }), [scene, lookKey]);
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

        <div className={`${styles.grid} ${style === "viewerEnd" ? styles.viewerEnd : ""}`}>
          <Viewer
            cfg={sceneCfg}
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


            {families.length > 0 && (
              <Field id={`${id}-cc`} title={c.capColour}>
                <ChipGroup
                  plain
                  labelledBy={`${id}-cc`}
                  value={cfg.colour ?? ""}
                  onChange={(v) => setCfg(normalize(cat, { ...cfg, colour: v }))}
                  items={families.map((f) => ({
                    key: f.id,
                    content: (
                      <>
                        <span className={styles.swatch} data-kind={f.kind} style={{ background: f.kind === "custom" ? (cfg.capHex || f.palette?.[0] || f.swatch) : f.swatch }} aria-hidden="true" />
                        {loc(f.name, locale)}
                      </>
                    ),
                  }))}
                />
                {family?.kind === "custom" && (
                  <ColourPick
                    id={`${id}-cap-hex`}
                    palette={family.palette ?? []}
                    value={cfg.capHex || family.palette?.[0] || family.swatch}
                    paletteLabel={c.paletteLabel}
                    customLabel={c.customColour}
                    onChange={(hex) => setCfg(normalize(cat, { ...cfg, capHex: hex }))}
                  />
                )}
              </Field>
            )}

            <Field id={`${id}-bc`} title={c.bodyColour}>
              <ColourPick
                id={`${id}-body-hex`}
                palette={(cat.bodyColours ?? []).map((b) => b.hex)}
                names={Object.fromEntries((cat.bodyColours ?? []).map((b) => [b.hex, loc(b.name, locale)]))}
                value={cfg.body ?? "#fbfcfd"}
                paletteLabel={c.bodyColour}
                customLabel={c.customColour}
                onChange={(hex) => setCfg(normalize(cat, { ...cfg, body: hex }))}
              />
            </Field>

            {prints.length > 0 && (
              <Field id={`${id}-pr`} title={c.printMethod}>
                <ChipGroup
                  plain
                  labelledBy={`${id}-pr`}
                  value={cfg.print ?? ""}
                  onChange={(v) => setCfg(normalize(cat, { ...cfg, print: v }))}
                  items={[{ key: "", content: c.noPrint }, ...prints.map((pm) => ({ key: pm.id, content: loc(pm.name, locale) }))]}
                />
                {print && (
                  <p className={styles.notice}>
                    {loc(print.note, locale)} {c.printSample}{" "}
                    <a className="u-link" href={`/${locale}/printing#technologies`}>
                      {c.printMore}
                    </a>
                  </p>
                )}
              </Field>
            )}

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
              {capColourName && (
                <div>
                  <dt>{c.specColour}</dt>
                  <dd>{capColourName}</dd>
                </div>
              )}
              <div>
                <dt>{c.specBody}</dt>
                <dd>{bodyName}</dd>
              </div>
              <div>
                <dt>{c.specPrint}</dt>
                <dd>{printName}</dd>
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

    </>
  );
}

/**
 * Swatches plus a native colour input (any colour). The swatches are a radio group; the input is
 * labelled and always reachable by keyboard.
 */
function ColourPick({ id, palette, names, value, paletteLabel, customLabel, onChange }: { id: string; palette: string[]; names?: Record<string, string>; value: string; paletteLabel: string; customLabel: string; onChange: (hex: string) => void }) {
  const lower = value.toLowerCase();
  return (
    <div className={styles.palette}>
      <div role="radiogroup" aria-label={paletteLabel} className={styles.swatches}>
        {palette.map((hex) => (
          <button
            key={hex}
            type="button"
            role="radio"
            aria-checked={lower === hex.toLowerCase()}
            aria-label={names?.[hex] ?? hex.toUpperCase()}
            title={names?.[hex] ?? hex.toUpperCase()}
            className={styles.swatchBtn}
            style={{ background: hex }}
            onClick={() => onChange(hex.toLowerCase())}
          />
        ))}
      </div>
      <label className={styles.custom} htmlFor={id}>
        <input id={id} type="color" value={lower} onChange={(e) => onChange(e.target.value.toLowerCase())} />
        <span>{customLabel}</span>
      </label>
    </div>
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
