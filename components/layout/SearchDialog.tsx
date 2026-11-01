"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import type { Dictionary } from "@/lib/i18n";
import { Search } from "@/components/ui/icons";

const loadPanel = () => import("./SearchPanel");
const SearchPanel = dynamic(loadPanel, { ssr: false });

type Props = { t: Dictionary; triggerClassName?: string; iconClassName?: string };

/** Search button. The dialog code is fetched on hover/focus and mounted on first open. */
export default function SearchDialog({ t, triggerClassName, iconClassName }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const warm = () => void loadPanel();

  return (
    <>
      <button
        ref={button}
        type="button"
        className={triggerClassName}
        aria-label={t.nav.search}
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerEnter={warm}
        onFocus={warm}
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
      >
        <Search className={iconClassName} />
      </button>
      {mounted && <SearchPanel t={t} open={open} onOpenChange={setOpen} returnFocus={() => button.current?.focus()} />}
    </>
  );
}
