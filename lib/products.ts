import tube from "@/content/products/multi-layer-tube.json";
import effervescent from "@/content/products/effervescent-tube.json";
import type { TubeProduct } from "@/lib/configurator/model";

/**
 * Product content managed in the admin panel. Today it is read from content/products/*.json at build
 * time; when the backend serves it, fetch the same shape here (and revalidate) — nothing else changes.
 */
export function getTubeProduct(): TubeProduct {
  return tube as unknown as TubeProduct;
}


export type Img = { src: string; width: number; height: number };
type L = Record<string, string>;
export type EffSizeDef = { id: string; d: number; h: number; render: Img & { base: number; mouth: number; left: number; right: number } };
export type EffProduct = {
  defaultSize: string;
  renderPxPerMm: number;
  dailyCapacity: number;
  since: L;
  sizes: EffSizeDef[];
  caps: { variants: { id: "spiral" | "plain"; name: L; image: Img }[] };
  images: { poster: Img; uses: Img };
};

/** Effervescent tube content (sizes, caps, figures, photos); same admin/backend contract as getTubeProduct. */
export function getEffervescentProduct(): EffProduct {
  return effervescent as unknown as EffProduct;
}
