"use client";

import RollText from "@/components/ui/RollText";
import { ArrowUp } from "@/components/ui/icons";

type Props = { label: string; className?: string; iconClassName?: string };

export default function BackToTop({ label, className, iconClassName }: Props) {
  const toTop = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    document.querySelector<HTMLElement>("[data-header] a")?.focus({ preventScroll: true });
  };
  return (
    <button type="button" className={className} onClick={toTop}>
      <RollText text={label} />
      <ArrowUp className={iconClassName} />
    </button>
  );
}
