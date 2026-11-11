"use client";

import { useRef, type ReactNode } from "react";
import { Highlight, HighlightItem } from "@animate-ui/react/primitives/effects/highlight";
import styles from "@/components/product/Product.module.css";

const glide = { type: "spring" as const, stiffness: 420, damping: 36 };

export type ChipItem = { key: string; content: ReactNode; label?: string };

/** Single-choice chip row: animate-ui Highlight glides the pill, arrow keys rove (RTL-aware). */
export default function ChipGroup({
  items,
  value,
  onChange,
  labelledBy,
  className = styles.chips,
  chipClass,
  pillClass = styles.chipPill,
}: {
  items: ChipItem[];
  value: string;
  onChange: (key: string) => void;
  labelledBy: string;
  className?: string;
  chipClass?: string;
  pillClass?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const keys = items.map((i) => i.key);
  return (
    <div ref={ref} className={className} role="radiogroup" aria-labelledby={labelledBy}>
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
