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
  /**
   * `image`: transparent 3D render (also used for SEO). `photo`: the section's photograph. `parts`:
   * where each part sits in the photo, as fractions: y = its centre from the top, x = its outer edge
   * inset from the side the callouts are on.
   */
  caps: {
    variants: { id: "spiral" | "plain"; name: L; image: Img; photo: Img; parts: { id: CapPart; y: number; x: number }[] }[];
    background: Img;
  };
  /** `studio`: optional photographic backdrop behind the hero's live 3D. */
  images: { poster: Img; uses: Img; usesPhoto: Img; usesBg: Img; studio?: Img };
};

export type CapPart = "cap" | "structure" | "chamber" | "mouth";

/** Effervescent tube content (sizes, caps, figures, photos); same admin/backend contract as getTubeProduct. */
export function getEffervescentProduct(): EffProduct {
  return effervescent as unknown as EffProduct;
}
