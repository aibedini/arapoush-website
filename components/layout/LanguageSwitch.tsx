"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { localeMeta, type Locale } from "@/lib/i18n/config";
import { ChevronDown, Globe } from "@/components/ui/icons";
import styles from "./LanguageMenu.module.css";

const loadMenu = () => import("./LanguageMenu");
const LanguageMenu = dynamic(loadMenu, { ssr: false });

type Props = { locale: Locale; label: string; className?: string };

/** Renders the language button statically and upgrades to the Radix menu on hover, focus or tap,
 *  so the dropdown code never sits on the critical path. */
export default function LanguageSwitch({ locale, label, className }: Props) {
  const [live, setLive] = useState<false | "hover" | "focus">(false);
  const [open, setOpen] = useState(false);

  if (live) return <LanguageMenu locale={locale} label={label} className={className} open={open} onOpenChange={setOpen} autoFocus={live === "focus"} />;

  const upgrade = (how: "hover" | "focus") => () => void loadMenu().then(() => setLive(how));
  return (
    <button
      type="button"
      className={`${styles.trigger} ${className ?? ""}`}
      aria-label={`${label}: ${localeMeta[locale].label}`}
      aria-haspopup="menu"
      aria-expanded={false}
      onPointerEnter={upgrade("hover")}
      onFocus={upgrade("focus")}
      onClick={() => {
        setOpen(true);
        setLive("focus");
      }}
    >
      <Globe className={styles.icon} />
      <span className={styles.short}>{localeMeta[locale].short}</span>
      <ChevronDown className={`${styles.icon} ${styles.chev}`} />
    </button>
  );
}
