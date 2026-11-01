"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Highlight, HighlightItem } from "@animate-ui/react/primitives/effects/highlight";
import { SlidingNumber } from "@animate-ui/react/primitives/texts/sliding-number";
import type { Dictionary } from "@/lib/i18n";
import { DIAMETERS, LENGTH_RANGE, VOLUMES, nearestByVolume, sizesFor, sizesWithVolume, type TubeSize } from "@/lib/tubeSizes";
import { CalcIcon, Flask, ShapeGlyph } from "./art";
import styles from "./Product.module.css";

const SHAPES = ["circular", "oval", "eyeNozzle"] as const;
type Shape = (typeof SHAPES)[number];
type Mode = "size" | "volume";

const glide = { type: "spring" as const, stiffness: 420, damping: 36 };
const sizeKey = (s: TubeSize) => `${s.d}x${s.l}`;

type Props = { t: Dictionary["productTube"] };

export default function VolumeCalculator({ t }: Props) {
  const c = t.calculator;
  const [mode, setMode] = useState<Mode>("size");
  const [size, setSize] = useState<TubeSize>(sizesFor(30)[3]!);
  const [shape, setShape] = useState<Shape>("circular");
  const id = useId();
  const lengths = sizesFor(size.d);
  const twins = sizesWithVolume(size.ml);
  const others = twins.filter((s) => s.d !== size.d);
  const vi = VOLUMES.indexOf(size.ml);

  // Switching diameter keeps the volume as close as that diameter allows.
  const pickDiameter = (d: number) => setSize(nearestByVolume(sizesFor(d), size.ml));
  // Switching volume keeps the diameter when it comes in that volume.
  const pickVolume = (ml: number) => {
    const list = sizesWithVolume(ml);
    setSize(list.find((s) => s.d === size.d) ?? list[0]!);
  };

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

          <ChipGroup
            label={c.modeLabel}
            className={styles.modes}
            chipClass={styles.mode}
            value={mode}
            onChange={(m) => setMode(m as Mode)}
            items={[
              { key: "size", content: c.bySize },
              { key: "volume", content: c.byVolume },
            ]}
          />

          {mode === "size" ? (
            <>
              <p className={styles.fieldLabel} id={`${id}-d`}>
                {c.diameter}
              </p>
              <ChipGroup
                labelledBy={`${id}-d`}
                value={String(size.d)}
                onChange={(v) => pickDiameter(Number(v))}
                items={DIAMETERS.map((d) => ({ key: String(d), content: d }))}
              />
              <p className={styles.fieldLabel} id={`${id}-l`}>
                {c.lengths}
              </p>
              <ChipGroup
                labelledBy={`${id}-l`}
                className={`${styles.chips} ${styles.lenChips}`}
                chipClass={styles.lenChip}
                pillClass={styles.lenPill}
                value={sizeKey(size)}
                onChange={(k) => setSize(lengths.find((s) => sizeKey(s) === k)!)}
                items={lengths.map((s) => ({
                  key: sizeKey(s),
                  label: `${s.l} ${c.mm}, ${s.ml} ${c.ml}`,
                  content: (
                    <>
                      <span className={styles.lenMm}>{s.l}</span>
                      <span className={styles.lenMl}>
                        {s.ml} {c.ml}
                      </span>
                    </>
                  ),
                }))}
              />
            </>
          ) : (
            <>
              <div className={styles.lengthRow}>
                <label className={styles.fieldLabel} htmlFor={`${id}-v`}>
                  {c.volume}
                </label>
                <output className={styles.lengthValue} htmlFor={`${id}-v`}>
                  <span className="ltr">{size.ml}</span> {c.ml}
                </output>
              </div>
              <input
                id={`${id}-v`}
                type="range"
                min={0}
                max={VOLUMES.length - 1}
                step={1}
                value={vi}
                aria-valuetext={`${size.ml} ${c.ml}`}
                onChange={(e) => pickVolume(VOLUMES[Number(e.target.value)]!)}
                className={styles.range}
                style={{ "--fill": `${(vi / (VOLUMES.length - 1)) * 100}%` } as React.CSSProperties}
              />
              <div className={styles.rangeEnds} aria-hidden="true">
                <span>
                  {VOLUMES[0]} {c.ml}
                </span>
                <span>
                  {VOLUMES.at(-1)} {c.ml}
                </span>
              </div>
              <p className={`${styles.fieldLabel} ${styles.matchLabel}`} id={`${id}-m`}>
                {c.matches}
              </p>
              <ChipGroup
                labelledBy={`${id}-m`}
                chipClass={styles.sizeChip}
                value={sizeKey(size)}
                onChange={(k) => setSize(twins.find((s) => sizeKey(s) === k)!)}
                items={twins.map((s) => ({ key: sizeKey(s), label: `${s.d} × ${s.l} ${c.mm}`, content: <Dims s={s} /> }))}
              />
            </>
          )}
          <p className={styles.calcNote}>{c.note}</p>
        </div>

        <TubeDiagram d={size.d} l={size.l} shape={shape} label={c.diagram.replace("{d}", String(size.d)).replace("{l}", String(size.l))} />

        <div className={styles.result} aria-live="polite">
          <div className={styles.resultHead}>
            <span>{c.result}</span>
            <Flask className={styles.icon24} />
          </div>
          <div>
            <p className={styles.resultValue}>
              <span className="ltr">
                <SlidingNumber number={size.ml} />
              </span>{" "}
              <span className={styles.resultUnit}>{c.ml}</span>
            </p>
            <p className={styles.resultSpec}>
              <span className="ltr">
                Ø{size.d} × {size.l} mm
              </span>
            </p>
          </div>
          {others.length > 0 && (
            <div className={styles.twins}>
              <span>{c.alsoAs}</span>
              <div>
                {others.map((s) => (
                  <button key={sizeKey(s)} type="button" className={styles.twin} onClick={() => setSize(s)} aria-label={`${s.d} × ${s.l} ${c.mm}`}>
                    <Dims s={s} />
                  </button>
                ))}
              </div>
            </div>
          )}
          <svg className={styles.resultWave} viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 70 C80 30 160 110 250 70 S360 40 400 60 V120 H0 Z" fill="rgba(255,255,255,.08)" />
            <path d="M0 90 C90 60 170 120 260 92 S370 70 400 84 V120 H0 Z" fill="rgba(255,255,255,.1)" />
          </svg>
        </div>
      </div>
    </section>
  );
}

const Dims = ({ s }: { s: TubeSize }) => (
  <span className="ltr">
    Ø{s.d} × {s.l}
  </span>
);

type ChipItem = { key: string; content: ReactNode; label?: string };

/** Single-choice chip row: animate-ui Highlight glides the pill, arrow keys rove (RTL-aware). */
function ChipGroup({
  items,
  value,
  onChange,
  label,
  labelledBy,
  className = styles.chips,
  chipClass,
  pillClass = styles.chipPill,
}: {
  items: ChipItem[];
  value: string;
  onChange: (key: string) => void;
  label?: string;
  labelledBy?: string;
  className?: string;
  chipClass?: string;
  pillClass?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const keys = items.map((i) => i.key);
  return (
    <div ref={ref} className={className} role="radiogroup" aria-label={label} aria-labelledby={labelledBy}>
      <Highlight controlledItems value={value} className={pillClass} transition={glide}>
        {items.map((item) => (
          <HighlightItem key={item.key} value={item.key}>
            <button
              type="button"
              role="radio"
              aria-checked={value === item.key}
              aria-label={item.label}
              className={`${styles.chip} ${chipClass ?? ""} ${value === item.key ? styles.chipOn : ""}`}
              // capture phase: HighlightItem replaces the child's onClick with its own handler
              onClickCapture={() => onChange(item.key)}
              onKeyDown={(e) => {
                const rtl = document.documentElement.dir === "rtl";
                const fwd = e.key === "ArrowDown" || e.key === (rtl ? "ArrowLeft" : "ArrowRight");
                const back = e.key === "ArrowUp" || e.key === (rtl ? "ArrowRight" : "ArrowLeft");
                if (!fwd && !back) return;
                e.preventDefault();
                const next = keys[(keys.indexOf(value) + (fwd ? 1 : -1) + keys.length) % keys.length]!;
                onChange(next);
                ref.current?.querySelector<HTMLElement>(`[data-key="${next}"]`)?.focus();
              }}
              tabIndex={value === item.key ? 0 : -1}
              data-key={item.key}
            >
              {item.content}
            </button>
          </HighlightItem>
        ))}
      </Highlight>
    </div>
  );
}

/** Upright tube drawn to the chosen size: width follows diameter, height follows length. */
function TubeDiagram({ d, l, shape, label }: { d: number; l: number; shape: Shape; label: string }) {
  const reduce = useReducedMotion();
  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 160, damping: 22 };
  const cx = 190;
  const bottom = 376;
  const w = (30 + ((d - 19) / (60 - 19)) * 80) * (shape === "oval" ? 1.22 : 1);
  const h = 110 + ((l - LENGTH_RANGE.min) / (LENGTH_RANGE.max - LENGTH_RANGE.min)) * 170;
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
