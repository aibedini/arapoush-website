import fallback from "@/content/products/tube-layout.json";
import { entry } from "@/lib/content";
import { normalizeTubeLayout } from "@/lib/configurator/layout";

export type { TubeSection } from "@/lib/configurator/layout";

/** The tube page's sections: OPEX `product.tube.page` → layout, or content/products/tube-layout.json. */
export const getTubeLayout = () => normalizeTubeLayout((entry<{ layout?: { sections?: unknown[] } }>("product.tube.page")?.layout ?? fallback).sections ?? []);
