import fallback from "@/content/products/tube-layout.json";
import { entry } from "@/lib/content";
import { normalizeTubeLayout } from "@/lib/configurator/layout";

export type { TubeSection } from "@/lib/configurator/layout";

/** The tube page's sections: OPEX `product.tube.page` → layout, or content/products/tube-layout.json. */
const layoutOf = () => entry<{ layout?: { sections?: unknown[]; quote?: { form?: string; department?: string } } }>("product.tube.page")?.layout ?? fallback;

/** Which OPEX form the quote uses and which contact-page department follows it up. */
export const getTubeQuote = () => ({ form: layoutOf().quote?.form || "tube-quote", department: layoutOf().quote?.department || "sales" });

export const getTubeLayout = () => normalizeTubeLayout((entry<{ layout?: { sections?: unknown[] } }>("product.tube.page")?.layout ?? fallback).sections ?? []);
