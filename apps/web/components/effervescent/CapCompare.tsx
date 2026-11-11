"use client";

import { useState, type CSSProperties } from "react";
import Image from "next/image";
import type { Dictionary } from "@/lib/i18n";
import type { CapPart, EffProduct } from "@/lib/products";
import { AirIcon, CapIcon, ClockIcon, CoilIcon, DryIcon, LayersIcon, MouthIcon, ShieldIcon } from "./CapIcons";
import styles from "./Effervescent.module.css";

type Props = { t: Dictionary["productEff"]["caps"]; caps: EffProduct["caps"]; locale: string };

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");

const PART_ICON: Record<CapPart, typeof CapIcon> = { cap: CapIcon, structure: CoilIcon, chamber: DryIcon, mouth: MouthIcon };
const POINT_ICONS = [ShieldIcon, AirIcon, LayersIcon];
const BENEFIT_ICONS = [ShieldIcon, AirIcon, ClockIcon, LayersIcon];

/**
 * The cap system: a toggle between the two caps, the exploded photograph with labelled parts
 * (leader lines on wide screens, numbered markers on phones), the chosen cap's summary, and the
 * benefits both caps share.
 */
export default function CapCompare({ t, caps, locale }: Props) {
  const [id, setId] = useState(caps.variants[0]!.id);
  const active = caps.variants.find((v) => v.id === id)!;
  const copy = t.variants[id];
  const part = (p: CapPart) => (p === "structure" ? t.parts[id] : t.parts[p]);

  return (
    <section className={styles.caps} aria-labelledby="caps-title">
      <div className={styles.capsBg} aria-hidden="true">
        <Image src={caps.background.src} alt="" fill sizes="100vw" quality={70} data-no-mirror />
      </div>

      <header className={styles.capsHead} data-reveal>
        <h2 id="caps-title" className="t-h2">
          {t.title}
        </h2>
        <span className={styles.capsRule} aria-hidden="true" />
        <p className="t-lead t-muted">{t.lead}</p>
      </header>

      <div className={styles.switch} role="group" aria-label={t.label} data-reveal>
        {caps.variants.map((v) => {
          const Icon = v.id === "spiral" ? CoilIcon : CapIcon;
          return (
            <button key={v.id} type="button" aria-pressed={v.id === id} onClick={() => setId(v.id)}>
              <Icon className={styles.switchIcon} />
              {v.name[locale] ?? v.name.en}
            </button>
          );
        })}
      </div>

      <div className={styles.capsPanel} data-reveal>
        <div className={styles.capsInfo} aria-live="polite">
          <h3 className={styles.capsInfoTitle}>{copy.heading}</h3>
          <p className={styles.capsInfoText}>{copy.text}</p>
          <ul className={styles.capsPoints}>
            {copy.points.map((pt, i) => {
              const Icon = POINT_ICONS[i % POINT_ICONS.length]!;
              return (
                <li key={pt}>
                  <span>{pt}</span>
                  <Icon className={styles.capsPointIcon} />
                </li>
              );
            })}
          </ul>
        </div>

        <div className={styles.capsVisual}>
          <div className={styles.capsFigure} style={{ aspectRatio: `${active.photo.width} / ${active.photo.height}` }}>
            {caps.variants.map((v) => (
              <Image
                key={v.id}
                src={v.photo.src}
                alt={fill(t.alt, { variant: v.name[locale] ?? v.name.en! })}
                width={v.photo.width}
                height={v.photo.height}
                sizes="(max-width: 767px) 80vw, (max-width: 1099px) 40vw, 26vw"
                data-on={v.id === id || undefined}
                aria-hidden={v.id !== id || undefined}
                data-no-mirror
              />
            ))}
            {active.parts.map((p, i) => (
              <span key={p.id} className={styles.capsMarker} style={{ "--y": p.y, "--x": p.x } as CSSProperties} aria-hidden="true">
                {i + 1}
              </span>
            ))}
          </div>

          <ol className={styles.callouts} aria-label={t.partsLabel}>
            {active.parts.map((p, i) => {
              const Icon = PART_ICON[p.id];
              const c = part(p.id);
              return (
                <li key={p.id} className={styles.callout} style={{ "--y": p.y, "--x": p.x } as CSSProperties}>
                  <span className={styles.leader} aria-hidden="true" />
                  <span className={styles.calloutNum} aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className={styles.calloutText}>
                    <strong>{c.title}</strong>
                    <span>{c.text}</span>
                  </span>
                  <Icon className={styles.calloutIcon} />
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <ul className={styles.benefits} data-reveal-stagger>
        {t.benefits.map((b, i) => {
          const Icon = BENEFIT_ICONS[i]!;
          return (
            <li key={b.title} data-reveal-item>
              <span className={styles.benefitIcon}>
                <Icon />
              </span>
              <strong>{b.title}</strong>
              <span>{b.text}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
