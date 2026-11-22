import type { Field, GroupField, ImageValue, Localized } from "./fields.ts";

/**
 * Slider builder (hero slideshow). A slide is a background (image, video or colour, each one per
 * device), the designed slots of the hero (copy, product, buttons, wordmark) and free layers
 * (text, image, button, shape) that sit anywhere with their own stacking order.
 *
 * Responsive values cascade like Slider Revolution: the top-level value is the desktop one, `tablet`
 * overrides it and `mobile` overrides the tablet result. Only changed values are stored.
 *
 * List items are keyed by `key`, not `id`: every `id` field is locked for non-super-admins
 * (overrides.ts), and operators must be able to add slides and layers.
 */

export const DEVICES = ["desktop", "tablet", "mobile"] as const;
export type Device = (typeof DEVICES)[number];
/** Widths the site switches at (Hero.module.css): tablet below 1100px, mobile below 768px. */
export const DEVICE_MEDIA: Record<Exclude<Device, "desktop">, string> = { tablet: "(max-width: 1099px)", mobile: "(max-width: 767px)" };

export const SLIDE_TRANSITIONS = ["wipe", "fade", "slide", "zoom", "circle", "curtain", "none"] as const;
export type SlideTransition = (typeof SLIDE_TRANSITIONS)[number];
export const LAYER_ANIMATIONS = ["none", "fade", "up", "down", "start", "end", "zoom", "mask"] as const;
export type LayerAnimation = (typeof LAYER_ANIMATIONS)[number];
export const ANCHORS = ["top-start", "top-center", "top-end", "center-start", "center", "center-end", "bottom-start", "bottom-center", "bottom-end"] as const;
export type Anchor = (typeof ANCHORS)[number];
export const LAYER_KINDS = ["text", "image", "button", "shape"] as const;
export type LayerKind = (typeof LAYER_KINDS)[number];

type L10n = Localized;
/** `T` with `tablet` and `mobile` overrides of its responsive part `R`. */
type Responsive<T, R> = T & R & { tablet?: Partial<R>; mobile?: Partial<R> };

export type BackgroundStyle = {
  image?: ImageValue;
  /** Right-to-left artwork (Persian lettering); desktop only, used instead of `image` in fa. */
  video?: string;
  /** Turns the video off on this device (the image shows). */
  noVideo?: boolean;
  /** Focal point in % (object-position): keeps the subject in frame when the crop changes. */
  focusX?: number;
  focusY?: number;
  /** A colour over the image (with alpha, e.g. #0a274780). */
  overlay?: string;
  /** The soft wash behind the copy on tablet and phone: by tone, or off. */
  wash?: "auto" | "light" | "dark" | "none";
};
export type Background = Responsive<{ imageRtl?: ImageValue; color?: string; mirrorRtl?: boolean; kenBurns?: boolean }, BackgroundStyle>;

/** Offsets are in % of the slider width (they scale with the screen). */
type SlotStyle = { hidden?: boolean; dx?: number; dy?: number; z?: number };
export type CopyStyle = SlotStyle & { color?: string; mutedColor?: string; leadColor?: string; align?: "start" | "center" | "end"; leadWidth?: number; font?: string };
export type Copy = Responsive<{ title?: L10n; lead?: L10n }, CopyStyle>;
export type ProductStyle = SlotStyle & { image?: ImageValue; scale?: number };
export type Product = Responsive<{ alt?: L10n }, ProductStyle>;
export type CtasStyle = SlotStyle & { secondary?: boolean; place?: "below" | "top" };
export type Ctas = Responsive<object, CtasStyle>;
export type Mark = Responsive<object, { hidden?: boolean }>;

export type LayerStyle = {
  hidden?: boolean;
  /** Position of the anchor point in % of the slide. */
  x?: number;
  y?: number;
  anchor?: Anchor;
  /** % of the slide width; 0 = as wide as the content. */
  width?: number;
  z?: number;
  rotate?: number;
  opacity?: number;
  color?: string;
  background?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeight?: number;
  align?: "start" | "center" | "end";
  radius?: number;
  padding?: number;
  font?: string;
  image?: ImageValue;
};
export type Layer = Responsive<
  {
    key: string;
    kind: LayerKind;
    name?: string;
    text?: L10n;
    tag?: "p" | "h2" | "h3" | "span";
    href?: string;
    alt?: L10n;
    animation?: { type?: LayerAnimation; delay?: number; duration?: number };
  },
  LayerStyle
>;

export type Slide = {
  key: string;
  name?: string;
  enabled?: boolean;
  tone?: "light" | "dark";
  /** Overrides the slider's transition for the change *to* this slide. */
  transition?: SlideTransition | "inherit";
  /** Seconds this slide stays (autoplay); 0 = the slider's interval. */
  interval?: number;
  background?: Background;
  copy?: Copy;
  product?: Product;
  ctas?: Ctas;
  mark?: Mark;
  layers?: Layer[];
};
export type SliderSettings = {
  transition?: SlideTransition;
  /** Seconds a transition takes. */
  duration?: number;
  autoplay?: boolean;
  /** Seconds per slide. */
  interval?: number;
  pauseOnHover?: boolean;
  arrows?: boolean;
  numbers?: boolean;
};
export type Slider = { settings?: SliderSettings; slides?: Slide[] };

export const SLIDER_DEFAULTS: Required<SliderSettings> = { transition: "wipe", duration: 1.25, autoplay: true, interval: 7, pauseOnHover: true, arrows: true, numbers: true };

// ── Schema (validated by the API like every other field) ─────────────────────────────────────

const t = (label: string, max = 200): Field => ({ kind: "text", localized: false, max, label });
const L = (label: string, multiline = false, max = 600): Field => ({ kind: "text", localized: true, multiline, max, label });
const n = (label: string, min: number, max: number, integer = false): Field => ({ kind: "number", min, max, integer, label });
const b = (label: string): Field => ({ kind: "boolean", label });
const e = (label: string, values: readonly string[]): Field => ({ kind: "enum", values: [...values], label });
const colour = (label: string): Field => t(label, 40);
const group = (label: string, fields: Record<string, Field>): GroupField => ({ kind: "group", label, fields });
/** The responsive fields again under `tablet` and `mobile`. */
const responsive = (label: string, fixed: Record<string, Field>, fields: Record<string, Field>): GroupField =>
  group(label, { ...fixed, ...fields, tablet: group("Tablet", fields), mobile: group("Mobile", fields) });

const slot = { hidden: b("Hidden"), dx: n("Move across (% of width)", -100, 100), dy: n("Move down (% of width)", -100, 100), z: n("Stacking order", 0, 100, true) };

const BACKGROUND = responsive(
  "Background",
  { imageRtl: { kind: "image", label: "Right-to-left image (Persian)" }, color: colour("Colour"), mirrorRtl: b("Mirror in right-to-left"), kenBurns: b("Slow zoom (Ken Burns)") },
  {
    image: { kind: "image", label: "Image" },
    video: { kind: "file", formats: ["mp4", "webm"], label: "Video (mp4/webm)" },
    noVideo: b("No video on this device"),
    focusX: n("Focus across (%)", 0, 100),
    focusY: n("Focus down (%)", 0, 100),
    overlay: colour("Overlay colour"),
    wash: e("Wash behind the copy", ["auto", "light", "dark", "none"]),
  },
);
const COPY = responsive(
  "Copy",
  { title: L("Title (a second line is muted)", true, 200), lead: L("Lead", true, 400) },
  { ...slot, color: colour("Title colour"), mutedColor: colour("Second line colour"), leadColor: colour("Lead colour"), align: e("Alignment", ["start", "center", "end"]), leadWidth: n("Lead width (%)", 10, 100), font: t("Font", 60) },
);
const PRODUCT = responsive("Product image", { alt: L("Description (alt)", false, 300) }, { ...slot, image: { kind: "image", label: "Image (transparent PNG or WebP)" }, scale: n("Size (×)", 0.2, 3) });
const CTAS = responsive("Buttons", {}, { ...slot, secondary: b("Show the second button"), place: e("Place", ["below", "top"]) });
const MARK = responsive("Wordmark", {}, { hidden: b("Hidden") });

const LAYER = responsive(
  "Layer",
  {
    key: { ...t("Key", 40), required: true },
    kind: { ...e("Kind", LAYER_KINDS), required: true },
    name: t("Name", 80),
    text: L("Text", true, 2000),
    tag: e("Tag", ["p", "h2", "h3", "span"]),
    href: { kind: "url", label: "Link" },
    alt: L("Description (alt)", false, 300),
    animation: group("Entrance", { type: e("Animation", LAYER_ANIMATIONS), delay: n("Delay (s)", 0, 10), duration: n("Duration (s)", 0.1, 5) }),
  },
  {
    hidden: b("Hidden"),
    x: n("Across (%)", -50, 150),
    y: n("Down (%)", -50, 150),
    anchor: e("Anchor", ANCHORS),
    width: n("Width (% of slide)", 0, 200),
    z: n("Stacking order", 0, 100, true),
    rotate: n("Rotate (°)", -180, 180),
    opacity: n("Opacity", 0, 1),
    color: colour("Text colour"),
    background: colour("Background colour"),
    fontSize: n("Text size (px)", 6, 400),
    fontWeight: n("Weight", 100, 900, true),
    lineHeight: n("Line height", 0.6, 3),
    align: e("Alignment", ["start", "center", "end"]),
    radius: n("Corner radius (px)", 0, 999),
    padding: n("Padding (px)", 0, 200),
    font: t("Font", 60),
    image: { kind: "image", label: "Image" },
  },
);

export const SLIDER_FIELD: GroupField = group("Slider", {
  settings: group("Settings", {
    transition: e("Transition", SLIDE_TRANSITIONS),
    duration: n("Transition time (s)", 0.2, 4),
    autoplay: b("Autoplay"),
    interval: n("Seconds per slide", 2, 60),
    pauseOnHover: b("Pause on hover"),
    arrows: b("Arrows"),
    numbers: b("Slide numbers"),
  }),
  slides: {
    kind: "list",
    key: "key",
    max: 20,
    label: "Slides",
    of: group("Slide", {
      key: { ...t("Key", 40), required: true },
      name: t("Name", 80),
      enabled: b("Shown"),
      tone: e("Tone", ["light", "dark"]),
      transition: e("Transition", ["inherit", ...SLIDE_TRANSITIONS]),
      interval: n("Seconds (0 = slider)", 0, 60),
      background: BACKGROUND,
      copy: COPY,
      product: PRODUCT,
      ctas: CTAS,
      mark: MARK,
      layers: { kind: "list", key: "key", max: 40, label: "Layers", of: LAYER },
    }),
  },
});

// ── Reading ─────────────────────────────────────────────────────────────────────────────────

/** The value of a responsive object on one device (desktop → tablet → mobile cascade). */
export function atDevice<T extends { tablet?: unknown; mobile?: unknown }>(v: T | undefined, device: Device): Omit<T, "tablet" | "mobile"> {
  if (!v) return {} as Omit<T, "tablet" | "mobile">;
  const { tablet, mobile, ...base } = v as T & Record<string, unknown>;
  const clean = (o: unknown) => Object.fromEntries(Object.entries((o as Record<string, unknown>) ?? {}).filter(([, x]) => x !== undefined && x !== null && x !== ""));
  if (device === "desktop") return base as Omit<T, "tablet" | "mobile">;
  const t = { ...base, ...clean(tablet) };
  return (device === "tablet" ? t : { ...t, ...clean(mobile) }) as Omit<T, "tablet" | "mobile">;
}

/** Only colours, so content can never smuggle CSS (`red; background:url(…)`). */
export function safeColour(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(s)) return s;
  if (/^(rgb|hsl)a?\(\s*[\d.]+%?\s*[, ]\s*[\d.]+%?\s*[, ]\s*[\d.]+%?\s*([,/]\s*[\d.]+%?\s*)?\)$/i.test(s)) return s;
  if (/^(transparent|currentcolor|white|black)$/i.test(s)) return s;
  return undefined;
}
/** Font ids are slugs (built-ins: sans, ui, mark; uploads: their key). */
export const safeFontId = (v: unknown): string | undefined => (typeof v === "string" && /^[a-z0-9][a-z0-9-]{0,39}$/i.test(v) ? v : undefined);

export const newKey = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

/** A new layer with starter content. */
export function newLayer(kind: LayerKind, key = newKey(kind)): Layer {
  const base = { key, kind, x: 50, y: 40, anchor: "center" as Anchor, z: 50, animation: { type: "up" as LayerAnimation, delay: 0.2, duration: 0.8 } };
  if (kind === "text") return { ...base, text: { fa: "متن تازه", en: "New text" }, tag: "p", fontSize: 48, fontWeight: 700, color: "#0e2b46", width: 40, tablet: { fontSize: 36 }, mobile: { fontSize: 26, width: 80 } };
  if (kind === "button") return { ...base, text: { fa: "بیشتر بدانید", en: "Learn more" }, href: "#contact", fontSize: 16, fontWeight: 600, color: "#ffffff", background: "#0e2b46", radius: 999, padding: 16 };
  if (kind === "shape") return { ...base, width: 20, background: "#92b6dd80", radius: 24, animation: { type: "fade", delay: 0, duration: 1 } };
  return { ...base, width: 30, animation: { type: "zoom", delay: 0.3, duration: 1 } };
}

export function newSlide(key = newKey("slide")): Slide {
  return { key, enabled: true, tone: "light", transition: "inherit", background: { color: "#efe7dd" }, copy: { title: { fa: "عنوان تازه\nخط دوم", en: "New title\nsecond line" }, lead: { fa: "متن کوتاه زیر عنوان.", en: "A short line under the title." } }, layers: [] };
}

type LegacyHero = {
  hero?: { slides?: { title?: L10n[]; lead?: L10n; productsAlt?: L10n }[] };
  images?: { slides?: { id: string; tone?: string; background?: ImageValue; backgroundRtl?: ImageValue; backgroundMobile?: ImageValue; product?: ImageValue }[] };
  slider?: Slider;
};

const joinLines = (lines: L10n[] | undefined): L10n | undefined => {
  if (!lines?.length) return undefined;
  const locales = [...new Set(lines.flatMap((l) => Object.keys(l)))] as (keyof L10n)[];
  return Object.fromEntries(locales.map((loc) => [loc, lines.map((l) => l[loc] ?? l.en ?? l.fa ?? "").join("\n")]));
};

/**
 * The slider of a `page.home.hero` entry. Entries made before the slider builder carry slides as
 * copy (`hero.slides`) plus images (`images.slides`); they are read into the same model, with the
 * settings each designed slide had in code, so the site looks the same until someone edits it.
 */
export function sliderOf(data: LegacyHero | undefined): Slider {
  if (data?.slider?.slides?.length) return data.slider;
  const copy = data?.hero?.slides ?? [];
  const slides = (data?.images?.slides ?? []).slice(0, copy.length || undefined).map((s, i): Slide => {
    const c = copy[i] ?? {};
    const packaging = s.id === "packaging";
    const dark = s.tone === "dark";
    return {
      key: s.id,
      enabled: true,
      tone: dark ? "dark" : "light",
      transition: "inherit",
      background: {
        ...(s.background ? { image: s.background } : {}),
        ...(s.backgroundRtl ? { imageRtl: s.backgroundRtl } : {}),
        mirrorRtl: !packaging,
        wash: packaging ? "none" : dark ? "dark" : "auto",
        ...(s.backgroundMobile ? { mobile: { image: s.backgroundMobile, ...(packaging ? { focusX: 50, focusY: 100 } : {}) } } : {}),
      },
      copy: { ...(c.title ? { title: joinLines(c.title) } : {}), ...(c.lead ? { lead: c.lead } : {}), ...(packaging ? { mobile: { leadWidth: 78 } } : {}) },
      product: { ...(s.product ? { image: s.product } : { hidden: true }), ...(c.productsAlt ? { alt: c.productsAlt } : {}) },
      ctas: packaging ? { mobile: { place: "top", secondary: false } } : {},
      mark: packaging ? { hidden: true } : {},
      layers: [],
    };
  });
  return { settings: { ...SLIDER_DEFAULTS }, slides };
}
