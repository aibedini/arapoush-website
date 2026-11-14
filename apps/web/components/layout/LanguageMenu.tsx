"use client";

import Link from "next/link";
import { DropdownMenu } from "@animate-ui/react/primitives/radix-ui";
import { locales, localeMeta, type Locale } from "@/lib/i18n/config";
import { ChevronDown, Globe } from "@/components/ui/icons";
import styles from "./LanguageMenu.module.css";

type Props = { locale: Locale; label: string; className?: string; path?: string; paths?: Partial<Record<Locale, string>>; open: boolean; onOpenChange: (open: boolean) => void; autoFocus?: boolean };

/** Language switcher: animate-ui's Radix dropdown (keyboard, typeahead, focus return built in).
 *  LanguageSwitch swaps it in for an identical static button on first intent. */
export default function LanguageMenu({ locale, label, className, path = "", paths, open, onOpenChange, autoFocus }: Props) {
  return (
    <DropdownMenu.Root modal={false} dir={localeMeta[locale].dir} open={open} onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger className={`${styles.trigger} ${className ?? ""}`} aria-label={`${label}: ${localeMeta[locale].label}, ${localeMeta[locale].short}`} autoFocus={autoFocus}>
        <Globe className={styles.icon} />
        <span className={styles.short}>{localeMeta[locale].short}</span>
        <ChevronDown className={`${styles.icon} ${styles.chev}`} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.content} sideOffset={10} align="end">
          {locales.map((l) => (
            <DropdownMenu.Item key={l} asChild className={styles.item}>
              <Link href={`/${l}${paths?.[l] ?? path}`} hrefLang={l} lang={l} aria-current={l === locale ? "true" : undefined}>
                <span>{localeMeta[l].label}</span>
                <span className={styles.code}>{localeMeta[l].short}</span>
              </Link>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
