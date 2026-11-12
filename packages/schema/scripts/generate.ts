/**
 * Builds the OPEX content types and their seed data from the website's current sources:
 * the locale dictionaries, content/*.json and the images components use. Run after changing what
 * the site shows:  pnpm --filter @arapoush/schema generate
 *
 * Output (committed): src/generated/schemas.json, src/generated/seed.json
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import { asGroup, infer } from "../src/infer.ts";
import { mergeLocales } from "../src/localize.ts";
import { applyOverrides } from "../src/overrides.ts";
import type { ContentType, GroupField, ListField } from "../src/fields.ts";
import { BLOCK_KINDS, BLOCK_PROPS, SECTION_TYPES } from "../src/blocks.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "../../../apps/web");
const out = path.resolve(here, "../src/generated");

const { default: fa } = await import(pathToFileURL(path.join(web, "lib/i18n/dictionaries/fa.ts")).href);
const { default: en } = await import(pathToFileURL(path.join(web, "lib/i18n/dictionaries/en.ts")).href);
const { default: tr } = await import(pathToFileURL(path.join(web, "lib/i18n/dictionaries/tr.ts")).href);
const site = await import(pathToFileURL(path.join(web, "lib/site.ts")).href);
const json = (p: string) => {
  const j = JSON.parse(readFileSync(path.join(web, p), "utf8"));
  delete j.$comment;
  return j;
};

const dict = (...sections: string[]) => Object.fromEntries(sections.map((s) => [s, mergeLocales({ fa: fa[s], en: en[s], tr: tr[s] })]));

// Image values carry their real pixel size, read from public/.
const sizes = new Map<string, { width: number; height: number }>();
async function img(src: string, alt?: Record<string, string>) {
  if (!sizes.has(src)) {
    const m = await sharp(path.join(web, "public", src)).metadata();
    sizes.set(src, { width: m.width ?? 0, height: m.height ?? 0 });
  }
  return { src, ...sizes.get(src)!, ...(alt ? { alt } : {}) };
}
const perLocale = async (def: string, faSrc?: string) => ({ default: await img(def), ...(faSrc ? { fa: await img(faSrc) } : {}) });

type Def = { key: string; label: string; singleton?: boolean; data: Record<string, unknown> };

const defs: Def[] = [
  {
    key: "global.site",
    label: "Site: header, footer, contact, closing call to action",
    data: {
      ...dict("meta", "common", "nav", "search", "footer", "cta"),
      contact: { ...site.contact, address: [...site.contact.address] },
      social: { ...site.social },
      links: { brochure: site.links.brochure },
      images: {
        logo: await img("/images/logo.png"),
        logoWhite: await img("/images/logo-white.png"),
        og: await img("/images/og.jpg"),
        footerBg: await img("/images/footer-bg.webp"),
        ctaBg: await img("/images/cta-bg.webp"),
        ctaTube: await perLocale("/images/cta-tube.webp", "/images/fa/cta-tube.webp"),
      },
    },
  },
  { key: "page.home.layout", label: "Home: section order", data: json("content/home-layout.json") },
  {
    key: "page.home.hero",
    label: "Home: hero slideshow",
    data: {
      ...dict("hero"),
      images: {
        slides: [
          { id: "products", tone: "light", background: await img("/images/hero-bg.webp"), product: await img("/images/hero-products.webp") },
          {
            id: "packaging",
            tone: "light",
            background: await img("/images/hero-packaging-ltr.webp"),
            backgroundRtl: await img("/images/hero-packaging-rtl.webp"),
            backgroundMobile: await img("/images/hero-packaging-mobile.webp"),
          },
          { id: "tube", tone: "dark", background: await img("/images/cta-bg.webp"), product: await img("/images/cta-tube.webp") },
          { id: "partners", tone: "light", background: await img("/images/partners-bg.webp") },
        ],
      },
    },
  },
  {
    key: "page.home.products",
    label: "Home: our products",
    data: {
      ...dict("products"),
      images: {
        cards: [
          { id: "tube", image: await perLocale("/images/product-tube.webp", "/images/fa/product-tube.webp") },
          { id: "effervescent", image: await perLocale("/images/product-effervescent.webp", "/images/fa/product-effervescent.webp") },
        ],
        tablets: await img("/images/tablets.webp"),
      },
    },
  },
  {
    key: "page.home.applications",
    label: "Home: applications",
    data: {
      ...dict("applications"),
      images: { items: await Promise.all(["cosmetics", "pharma", "hygienic", "food"].map(async (id) => ({ id, image: await img(`/images/app-${id}.webp`) }))) },
    },
  },
  {
    key: "page.home.insights",
    label: "Home: insights and journal",
    data: { ...dict("insights"), images: { articles: await Promise.all([1, 2, 3].map(async (n) => ({ id: `journal-${n}`, image: await img(`/images/journal-${n}.webp`) }))) } },
  },
  {
    key: "page.home.partners",
    label: "Home: trusted partners",
    data: {
      ...dict("partners"),
      images: {
        background: await perLocale("/images/partners-bg.webp", "/images/fa/partners-bg.webp"),
        logos: await Promise.all(
          [
            ["hydroderm", "/images/logo-hydroderm.svg", "Hydroderm"],
            ["cerita", "/images/logo-cerita.png", "Cerita Hair Care"],
            ["jute", "/images/logo-jute.png", "Jute Cosmetics"],
            ["prime", "/images/logo-prime.png", "Prime"],
          ].map(async ([id, src, name]) => ({ id, name, image: await img(src!) })),
        ),
      },
    },
  },
  {
    key: "page.home.certifications",
    label: "Home: certifications",
    data: {
      ...dict("certifications"),
      images: {
        background: await img("/images/cert-bg.webp"),
        seals: await Promise.all(["gmp", "iso", "ifda", "inso"].map(async (id) => ({ id, image: await img(`/images/cert-${id}.webp`) }))),
      },
    },
  },
  {
    key: "product.tube.page",
    label: "Product: multi-layer tube (page copy)",
    data: { ...dict("productTube"), images: json("content/products/multi-layer-tube.json").images },
  },
  {
    key: "product.tube.catalogue",
    label: "Product: multi-layer tube (configurator catalogue)",
    data: (({ images: _images, ...rest }) => rest)(json("content/products/multi-layer-tube.json")),
  },
  {
    key: "product.effervescent.page",
    label: "Product: effervescent tube",
    data: { ...dict("productEff"), data: json("content/products/effervescent-tube.json") },
  },
  {
    key: "page.printing",
    label: "Printing technologies",
    data: {
      ...json("content/printing.json"),
      images: {
        bgLight: await img("/images/printing/bg-light.webp"),
        bgNavy: await img("/images/printing/bg-navy.webp"),
        tubeColour: await img("/images/printing/tube-colour.webp"),
        tubeGold: await img("/images/printing/tube-gold.webp"),
        layers: await img("/images/printing/layers.webp"),
        ctaTube: await img("/images/printing/cta-tube.webp"),
      },
    },
  },
  {
    key: "page.about",
    label: "About Arapoush",
    data: { ...json("content/about.json"), images: { poster: await img("/images/about/hero-poster.webp") } },
  },
];

/** Shapes inference cannot see in the seed data (P12: page-builder blocks in the home layout). */
function extend(key: string, g: GroupField): GroupField {
  if (key !== "page.home.layout") return g;
  const sections = g.fields.sections as ListField;
  const item = sections.of as GroupField;
  return {
    ...g,
    fields: {
      ...g.fields,
      sections: { ...sections, label: "Sections", of: { ...item, fields: { ...item.fields, type: { kind: "enum", values: [...SECTION_TYPES, ...BLOCK_KINDS], label: "Section type" }, props: BLOCK_PROPS } } },
    },
  };
}

const types: ContentType[] = defs.map((d) => ({
  key: d.key,
  label: d.label,
  singleton: d.singleton ?? true,
  version: 1,
  schema: applyOverrides(d.key, extend(d.key, asGroup(infer(d.data)))),
}));

mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "schemas.json"), JSON.stringify(types, null, 1) + "\n");
writeFileSync(path.join(out, "seed.json"), JSON.stringify(Object.fromEntries(defs.map((d) => [d.key, d.data])), null, 1) + "\n");
console.log(`${types.length} content types, ${sizes.size} images measured`);
