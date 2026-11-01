"use client";

import { useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Highlight, HighlightItem } from "@animate-ui/react/primitives/effects/highlight";
import { SlidingNumber } from "@animate-ui/react/primitives/texts/sliding-number";
import type { Dictionary } from "@/lib/i18n";
import { CalcIcon, Flask, ShapeGlyph } from "./art";
import styles from "./Product.module.css";

const DIAMETERS = [19, 25, 30, 35, 40, 50, 60];
const LENGTH = { min: 50, max: 300, step: 5 };
const SHAPES = ["circular", "oval", "eyeNozzle"] as const;
type Shape = (typeof SHAPES)[number];

const glide = { type: "spring" as const, stiffness: 420, damping: 36 };

/** Inner volume of a circular-section tube: π · (d/2)² · L, mm³ → ml. */
export const tubeVolumeMl = (d: number, l: number) => (Math.PI * (d / 2) ** 2 * l) / 1000;

type Props = { t: Dictionary["productTube"] };

export default function VolumeCalculator({ t }: Props) {
  const c = t.calculator;
  const [d, setD] = useState(30);
  const [l, setL] = useState(120);
  const [shape, setShape] = useState<Shape>("circular");
  const id = useId();
  const ml = Math.round(tubeVolumeMl(d, l) * 10) / 10;

  return (
    <section className={styles.calcSection} aria-labelledby={`${id}-title`}>
      {/* Phones and tablets pick the tube form here; desktop shows the variants panel instead. */}
      <div className={styles.shapeTabs} role="radiogroup" aria-label={t.shapesLabel} data-reveal>
        {SHAPES.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={shape === s} className={styles.shapeTab} onClick={() => setShape(s)}>
            <ShapeGlyph shape={s} className={styles.shapeGlyph} />
            <span>{t.shapes[s]}</span>
          </button>
        ))}
      </div>

      <div className={styles.calcCard} data-reveal>
        <div className={styles.calcControls}>
          <header className={styles.calcHead}>
            <span className={styles.iconBox}>
              <CalcIcon className={styles.icon20} />
            </span>
            <div>
              <h2 id={`${id}-title`} className={styles.calcTitle}>
                {c.title}
              </h2>
              <p className={styles.calcSub}>{c.subtitle}</p>
            </div>
          </header>

          <p className={styles.fieldLabel} id={`${id}-d`}>
            {c.diameter}
          </p>
          <div className={styles.chips} role="radiogroup" aria-labelledby={`${id}-d`}>
            {/* animate-ui Highlight: the selection pill glides between diameters */}
            <Highlight controlledItems value={String(d)} className={styles.chipPill} transition={glide}>
              {DIAMETERS.map((v) => (
                <HighlightItem key={v} value={String(v)}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={d === v}
                    className={`${styles.chip} ${d === v ? styles.chipOn : ""}`}
                    // capture phase: HighlightItem replaces the child's onClick with its own handler
                    onClickCapture={() => setD(v)}
                    onKeyDown={(e) => {
                      const i = DIAMETERS.indexOf(d);
                      const rtl = document.documentElement.dir === "rtl";
                      const fwd = e.key === "ArrowDown" || e.key === (rtl ? "ArrowLeft" : "ArrowRight");
                      const back = e.key === "ArrowUp" || e.key === (rtl ? "ArrowRight" : "ArrowLeft");
                      if (!fwd && !back) return;
                      e.preventDefault();
                      const next = DIAMETERS[(i + (fwd ? 1 : -1) + DIAMETERS.length) % DIAMETERS.length]!;
                      setD(next);
                      (e.currentTarget.parentElement?.parentElement?.querySelector(`[data-d="${next}"]`) as HTMLElement | null)?.focus();
                    }}
                    tabIndex={d === v ? 0 : -1}
                    data-d={v}
                  >
                    {v}
                  </button>
                </HighlightItem>
              ))}
            </Highlight>
          </div>

          <div className={styles.lengthRow}>
            <label className={styles.fieldLabel} htmlFor={`${id}-l`}>
              {c.length}: <span className="ltr">{l}</span> {c.mm}
            </label>
            <output className={styles.lengthValue} htmlFor={`${id}-l`}>
              {l}
            </output>
          </div>
          <input
            id={`${id}-l`}
            type="range"
            min={LENGTH.min}
            max={LENGTH.max}
            step={LENGTH.step}
            value={l}
            onChange={(e) => setL(Number(e.target.value))}
            className={styles.range}
            style={{ "--fill": `${((l - LENGTH.min) / (LENGTH.max - LENGTH.min)) * 100}%` } as React.CSSProperties}
          />
          <div className={styles.rangeEnds} aria-hidden="true">
            <span>
              {LENGTH.min} {c.mm}
            </span>
            <span>
              {LENGTH.max} {c.mm}
            </span>
          </div>
          <p className={styles.calcNote}>{c.note}</p>
        </div>

        <TubeDiagram d={d} l={l} shape={shape} label={c.diagram.replace("{d}", String(d)).replace("{l}", String(l))} />

        <div className={styles.result} aria-live="polite">
          <div className={styles.resultHead}>
            <span>{c.result}</span>
            <Flask className={styles.icon24} />
          </div>
          <p className={styles.resultValue}>
            <span className="ltr">
              <SlidingNumber number={ml} decimalPlaces={1} />
            </span>{" "}
            <span className={styles.resultUnit}>{c.ml}</span>
          </p>
          <svg className={styles.resultWave} viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 70 C80 30 160 110 250 70 S360 40 400 60 V120 H0 Z" fill="rgba(255,255,255,.08)" />
            <path d="M0 90 C90 60 170 120 260 92 S370 70 400 84 V120 H0 Z" fill="rgba(255,255,255,.1)" />
          </svg>
        </div>
      </div>
    </section>
  );
}

/** Upright tube drawn to the chosen size: width follows diameter, height follows length. */
function TubeDiagram({ d, l, shape, label }: { d: number; l: number; shape: Shape; label: string }) {
  const reduce = useReducedMotion();
  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 160, damping: 22 };
  const cx = 190;
  const bottom = 376;
  const w = (30 + ((d - 19) / (60 - 19)) * 80) * (shape === "oval" ? 1.22 : 1);
  const h = 110 + ((l - 50) / (300 - 50)) * 170;
  const capH = shape === "eyeNozzle" ? 34 : 24;
  const top = bottom - capH - h;
  const capW = w * 0.82;
  const clip = useId();

  return (
    <figure className={styles.diagram}>
      <svg viewBox="0 0 280 390" role="img" aria-label={label} direction="ltr">
        <defs>
          <linearGradient id={`${clip}-g`} x1="0" x2="1">
            <stop offset="0" stopColor="#dfe4ea" />
            <stop offset=".35" stopColor="#ffffff" />
            <stop offset="1" stopColor="#d3dae2" />
          </linearGradient>
          <clipPath id={clip}>
            <motion.rect initial={false} animate={{ x: cx - w / 2, y: top, width: w, height: h }} transition={spring} rx="4" />
          </clipPath>
        </defs>

        {/* diameter dimension */}
        <motion.g initial={false} animate={{ y: top - 26 }} transition={spring}>
          <motion.line initial={false} animate={{ x1: cx - w / 2, x2: cx + w / 2 }} transition={spring} y1="0" y2="0" className={styles.dim} />
          <motion.line initial={false} animate={{ x1: cx - w / 2, x2: cx - w / 2 }} transition={spring} y1="-5" y2="5" className={styles.dim} />
          <motion.line initial={false} animate={{ x1: cx + w / 2, x2: cx + w / 2 }} transition={spring} y1="-5" y2="5" className={styles.dim} />
          <text x={cx} y="-10" textAnchor="middle" className={styles.dimText}>
            Ø {d} mm
          </text>
        </motion.g>

        {/* length dimension */}
        <motion.line initial={false} animate={{ y1: top, y2: bottom - capH }} transition={spring} x1="96" x2="96" className={styles.dim} />
        <motion.line initial={false} animate={{ y1: top, y2: top }} transition={spring} x1="90" x2="102" className={styles.dim} />
        <line x1="90" x2="102" y1={bottom - capH} y2={bottom - capH} className={styles.dim} />
        <motion.text initial={false} animate={{ y: (top + bottom - capH) / 2 + 4 }} transition={spring} x="86" textAnchor="end" className={styles.dimText}>
          {l} mm
        </motion.text>

        {/* crimp, body with brand swoosh, cap */}
        <motion.rect initial={false} animate={{ x: cx - w / 2 - 3, y: top - 8, width: w + 6 }} transition={spring} height="10" rx="2" fill="#e4e8ed" stroke="#c9d1da" strokeWidth=".8" />
        <motion.rect initial={false} animate={{ x: cx - w / 2, y: top, width: w, height: h }} transition={spring} rx="4" fill={`url(#${clip}-g)`} stroke="#cbd3dc" strokeWidth=".8" />
        <g clipPath={`url(#${clip})`}>
          <motion.path
            initial={false}
            animate={{ d: `M${cx - w / 2} ${bottom - capH - h * 0.18} C${cx - w / 4} ${bottom - capH - h * 0.5} ${cx + w / 4} ${bottom - capH - h * 0.42} ${cx + w / 2} ${bottom - capH - h * 0.72} L${cx + w / 2} ${bottom - capH} L${cx - w / 2} ${bottom - capH} Z` }}
            transition={spring}
            fill="#2f5476"
            opacity=".88"
          />
        </g>
        <motion.text initial={false} animate={{ x: cx, y: top + Math.min(40, h * 0.25) }} transition={spring} textAnchor="middle" className={styles.tubeBrand}>
          ARAPOUSH
        </motion.text>
        {shape === "eyeNozzle" ? (
          <motion.path
            initial={false}
            animate={{ d: `M${cx - capW / 2} ${bottom - capH} H${cx + capW / 2} L${cx + 5} ${bottom} H${cx - 5} Z` }}
            transition={spring}
            fill="#eef1f5"
            stroke="#c9d1da"
            strokeWidth=".8"
          />
        ) : (
          <motion.rect initial={false} animate={{ x: cx - capW / 2, width: capW }} transition={spring} y={bottom - capH} height={capH} rx="4" fill="#eef1f5" stroke="#c9d1da" strokeWidth=".8" />
        )}
      </svg>
    </figure>
  );
}
