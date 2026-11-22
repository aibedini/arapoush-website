import { atDevice, type Device, type Layer, type Slide, type Slider } from "@arapoush/schema";

/**
 * Editing helpers for the slider builder. Responsive objects keep desktop values at the top level
 * and overrides under `tablet` / `mobile`; an edit on a device writes only there.
 */
export type Obj = Record<string, unknown> & { tablet?: Record<string, unknown>; mobile?: Record<string, unknown> };

export const DEVICE_LABEL: Record<Device, string> = { desktop: "دسکتاپ", tablet: "تبلت", mobile: "موبایل" };
/** Size of the hero on a typical screen of each device (what the stage draws). */
export const DEVICE_SIZE: Record<Device, [number, number]> = { desktop: [1440, 768], tablet: [834, 1112], mobile: [390, 671] };

export const read = (o: unknown, device: Device, key: string): unknown => (atDevice(o as Obj, device) as Record<string, unknown>)[key];
export const overridden = (o: unknown, device: Device, key: string) => device !== "desktop" && (o as Obj | undefined)?.[device]?.[key] !== undefined;

const clean = <T extends Record<string, unknown>>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/** Writes `patch` on `device` (desktop: the base values). `undefined` removes a value (inherit again). */
export function write<T>(o: T | undefined, device: Device, patch: Record<string, unknown>): T {
  const base = { ...((o as Obj) ?? {}) };
  if (device === "desktop") return clean({ ...base, ...patch }) as T;
  const own = clean({ ...(base[device] ?? {}), ...patch });
  if (Object.keys(own).length) base[device] = own;
  else delete base[device];
  return base as T;
}

/** Removes an override on a device (back to the inherited value). */
export const reset = <T,>(o: T | undefined, device: Device, key: string): T => write(o, device, { [key]: undefined });

export const L = (v: unknown, locale: string) => (v && typeof v === "object" ? ((v as Record<string, string>)[locale] ?? (v as Record<string, string>).en ?? (v as Record<string, string>).fa ?? "") : "");

export type Target = { kind: "settings" } | { kind: "slide" } | { kind: "background" } | { kind: "copy" } | { kind: "product" } | { kind: "ctas" } | { kind: "mark" } | { kind: "layer"; key: string };

export function updateSlide(s: Slider, key: string, fn: (x: Slide) => Slide): Slider {
  return { ...s, slides: (s.slides ?? []).map((x) => (x.key === key ? fn(x) : x)) };
}
export function updateLayer(slide: Slide, key: string, fn: (l: Layer) => Layer | null): Slide {
  return { ...slide, layers: (slide.layers ?? []).flatMap((l) => (l.key === key ? [fn(l)].filter((x): x is Layer => !!x) : [l])) };
}

export const uniqueKey = (prefix: string, taken: string[]) => {
  for (let i = 1; ; i++) {
    const k = `${prefix}-${i}`;
    if (!taken.includes(k)) return k;
  }
};

/** Deep copy with fresh keys (duplicate a slide or a layer). */
export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
