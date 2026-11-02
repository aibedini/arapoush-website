import tube from "@/content/products/multi-layer-tube.json";
import type { TubeProduct } from "@/lib/configurator/model";

/**
 * Product content managed in the admin panel. Today it is read from content/products/*.json at build
 * time; when the backend serves it, fetch the same shape here (and revalidate) — nothing else changes.
 */
export function getTubeProduct(): TubeProduct {
  return tube as unknown as TubeProduct;
}
