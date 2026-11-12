"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Dictionary } from "@/lib/i18n";
import { DEFAULT_CONFIG, capacity, closureOf, colourOf, fromSearch, loc, normalize, printOf, shapeOf, structureOf, toSearch, type TubeConfig, type TubeProduct } from "@/lib/configurator/model";

type Ctx = {
  cat: TubeProduct;
  /** The configurator's copy (sent once for every section that needs it). */
  c: Dictionary["productTube"]["configurator"];
  locale: string;
  cfg: TubeConfig;
  setCfg: (c: TubeConfig) => void;
  /** Human-readable lines for the spec card, the quote and the share text. */
  spec: string[];
  subjectSpec: string;
  search: string;
};
const TubeCtx = createContext<Ctx | null>(null);

export function useTube() {
  const v = useContext(TubeCtx);
  if (!v) throw new Error("useTube outside <TubeState>");
  return v;
}

/**
 * The tube configuration shared by the page's sections (T4): the configurator, related samples and
 * the quote form read and change the same selection, wherever the layout puts them. The URL keeps
 * it, so a shared link restores it.
 */
export default function TubeState({ product: cat, c, locale, children }: { product: TubeProduct; c: Dictionary["productTube"]["configurator"]; locale: string; children: React.ReactNode }) {
  const [cfg, setCfg] = useState<TubeConfig>(() => normalize(cat, DEFAULT_CONFIG));
  const urlReady = useRef(false);

  // A shared link restores its configuration; anything invalid is normalised before it is shown.
  useEffect(() => {
    if (new URLSearchParams(location.search).has("shape")) setCfg(fromSearch(cat, location.search));
  }, [cat]);
  useEffect(() => {
    if (!urlReady.current) {
      urlReady.current = true;
      return;
    }
    const url = new URL(location.href);
    if (url.search === `?${toSearch(cfg)}`) return;
    url.search = toSearch(cfg);
    history.replaceState(history.state, "", url);
  }, [cfg]);

  const value = useMemo<Ctx>(() => {
    const shapeName = loc(shapeOf(cat, cfg.shape)?.name, locale);
    const closureName = loc(closureOf(cat, cfg.closure)?.name, locale);
    const structureName = loc(structureOf(cat, cfg.structure)?.name, locale);
    const family = colourOf(cat, cfg.colour);
    const capColour = family ? `${loc(family.name, locale)}${family.kind === "custom" && cfg.capHex ? ` (${cfg.capHex.toUpperCase()})` : ""}` : "";
    const body = loc(cat.bodyColours?.find((b) => b.hex === cfg.body)?.name, locale) || (cfg.body ?? "").toUpperCase();
    const print = printOf(cat, cfg.print);
    const cap = capacity(cat, cfg);
    const size = `Ø${cfg.d} × ${cfg.l} mm`;
    return {
      cat,
      c,
      locale,
      cfg,
      setCfg,
      spec: [
        `${shapeName} · ${size}`,
        closureName,
        ...(capColour ? [`${c.specColour}: ${capColour}`] : []),
        `${c.specBody}: ${body}`,
        `${c.specPrint}: ${print ? loc(print.name, locale) : c.noPrint}`,
        ...(structureName ? [structureName] : []),
        cap ? `${cap.ml} ml (${cap.status === "chart" ? c.statusChart : c.statusEstimate})` : c.noVolume,
      ],
      subjectSpec: `${shapeName} ${size}, ${closureName}`,
      search: toSearch(cfg),
    };
  }, [cat, cfg, c, locale]);

  return <TubeCtx.Provider value={value}>{children}</TubeCtx.Provider>;
}
