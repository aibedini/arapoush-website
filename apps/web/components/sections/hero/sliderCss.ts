import { atDevice, DEVICE_MEDIA, DEVICES, fontStack, safeColour, safeFontId, type Anchor, type Device, type FontSettings, type Slide } from "@arapoush/schema";

/**
 * The per-slide CSS of the slider builder: what each slide changes on each device (colours,
 * offsets, visibility, stacking, layer geometry). Desktop rules come first, then the tablet and
 * phone media blocks, so each device inherits the one above unless it overrides a value.
 *
 * Every value is checked (numbers clamped, colours and font ids whitelisted): content never
 * reaches the stylesheet as free text.
 */

const n = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined);
const decls = (o: Record<string, string | number | undefined>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
const rule = (sel: string, o: Record<string, string | number | undefined>) => {
  const d = decls(o);
  return d ? `${sel}{${d}}` : "";
};

/** Anchor → the share of its own box an element is pulled back by (x follows the writing direction). */
const ANCHOR: Record<Anchor, [number, number]> = {
  "top-start": [0, 0],
  "top-center": [-50, 0],
  "top-end": [-100, 0],
  "center-start": [0, -50],
  center: [-50, -50],
  "center-end": [-100, -50],
  "bottom-start": [0, -100],
  "bottom-center": [-50, -100],
  "bottom-end": [-100, -100],
};
const ALIGN: Record<string, string> = { start: "flex-start", center: "center", end: "flex-end" };

const WASH = {
  light: "linear-gradient(180deg, rgba(246, 240, 233, 0) 0%, rgba(246, 240, 233, 0.72) 45%, rgba(246, 240, 233, 0.86) 100%)",
  dark: "linear-gradient(180deg, rgba(10, 39, 71, 0) 0%, rgba(10, 39, 71, 0.6) 45%, rgba(10, 39, 71, 0.85) 100%)",
  none: "none",
};

const shift = (dx: unknown, dy: unknown) => {
  const x = n(dx, -100, 100);
  const y = n(dy, -100, 100);
  return x || y ? `calc(${x ?? 0} * 1cqw * var(--flip, 1)) calc(${y ?? 0} * 1cqw)` : "0 0";
};

/** Unique video sources of a slide's background per device ("" = none). */
export function slideVideos(s: Slide): Record<Device, string> {
  const out = {} as Record<Device, string>;
  for (const d of DEVICES) {
    const b = atDevice(s.background, d);
    out[d] = b.noVideo || typeof b.video !== "string" || !/^\/(media|files)\/[\w\-./]+\.(mp4|webm)$/.test(b.video) ? "" : b.video;
  }
  return out;
}

export function sliderCss(slides: Slide[], fonts: FontSettings | undefined, hero: string): string {
  const H = `.${hero}`;
  const out: Record<Device, string[]> = { desktop: [], tablet: [], mobile: [] };
  const font = (id: unknown) => fontStack(safeFontId(id), fonts);

  slides.forEach((s, i) => {
    const bgSel = `${H} [data-slide-bg][data-index="${i}"]`;
    const copySel = `${H} [data-slide-copy][data-index="${i}"]`;
    const prodSel = `${H} [data-slide-product][data-index="${i}"]`;
    const active = `${H}[data-active="${i}"]`;
    const videos = slideVideos(s);
    const tone = s.tone === "dark" ? "dark" : "light";
    if (safeColour(s.background?.color)) out.desktop.push(rule(bgSel, { "background-color": safeColour(s.background?.color) }));

    for (const d of DEVICES) {
      const o = out[d];
      const changed = d === "desktop" || (d === "mobile" && atDevice(s.mark, d).hidden) || s.background?.[d] || s.copy?.[d] || s.product?.[d] || s.ctas?.[d] || s.mark?.[d] || s.layers?.some((l) => l[d]);
      if (!changed) continue;

      // Background
      const b = atDevice(s.background, d);
      const fx = n(b.focusX, 0, 100);
      const fy = n(b.focusY, 0, 100);
      if (fx !== undefined || fy !== undefined) o.push(rule(`${bgSel} :is(img,video)`, { "object-position": `${fx ?? 50}% ${fy ?? 50}%` }));
      const wash = b.wash && b.wash !== "auto" ? b.wash : tone;
      o.push(rule(bgSel, { "--ov": safeColour(b.overlay) ?? "transparent", "--wash": WASH[wash as keyof typeof WASH] ?? WASH.light }));
      if (videos.desktop || videos.tablet || videos.mobile) {
        o.push(rule(`${bgSel} video`, { display: "none" }));
        if (videos[d]) o.push(rule(`${bgSel} video[data-src="${videos[d]}"]`, { display: "block" }));
      }

      // Copy slot
      const c = atDevice(s.copy, d);
      o.push(
        rule(copySel, {
          display: c.hidden ? "none" : "flex",
          "--hero-ink": safeColour(c.color),
          "--hero-muted": safeColour(c.mutedColor),
          "--hero-lead": safeColour(c.leadColor),
          "text-align": c.align,
          "align-items": c.align ? ALIGN[c.align] : undefined,
          translate: shift(c.dx, c.dy),
        }),
      );
      const leadW = n(c.leadWidth, 10, 100);
      if (leadW) o.push(rule(`${copySel} [data-fade]`, { "max-width": `${leadW}%` }));
      if (font(c.font)) o.push(rule(`${copySel} :is(h1,h2,p)`, { "font-family": font(c.font) }));
      if (n(c.z, 0, 100) !== undefined) o.push(rule(`${active} [data-content-scroll]`, { "z-index": n(c.z, 0, 100) }));

      // Product slot
      const p = atDevice(s.product, d);
      const scale = n(p.scale, 0.2, 3);
      o.push(rule(prodSel, { display: p.hidden ? "none" : "block" }));
      o.push(rule(`${prodSel} [data-product-inner]`, { translate: shift(p.dx, p.dy), scale: scale && scale !== 1 ? scale : 1 }));
      if (n(p.z, 0, 100) !== undefined) o.push(rule(`${active} [data-products-scroll]`, { "z-index": n(p.z, 0, 100) }));

      // Buttons (shared by every slide: set while this slide is the active one)
      const k = atDevice(s.ctas, d);
      o.push(rule(`${active} [data-ctas]`, { display: k.hidden ? "none" : "flex", translate: shift(k.dx, k.dy), ...(k.place === "top" ? { position: "absolute", top: "clamp(180px, 50vw, 195px)", "inset-inline-start": "var(--gutter)" } : { position: "static" }) }));
      if (k.place === "top") o.push(rule(`:lang(fa) ${active} [data-ctas]`, { top: "clamp(165px, 47vw, 185px)" }));
      o.push(rule(`${active} [data-story]`, { display: k.secondary === false ? "none" : "inline-flex" }));

      // Wordmark: faded on wide layouts; on phones it leaves the flow (the copy moves up).
      const m = atDevice(s.mark, d);
      o.push(rule(`${active} [data-mark-scroll]`, d === "mobile" ? { display: m.hidden ? "none" : "block", opacity: m.hidden ? 0 : 1 } : { opacity: m.hidden ? 0 : 1 }));

      // Free layers
      (s.layers ?? []).forEach((layer, j) => {
        const l = atDevice(layer, d);
        const sel = `${H} [data-layer="${i}-${j}"]`;
        const [ax, ay] = ANCHOR[(l.anchor ?? "top-start") as Anchor] ?? [0, 0];
        const w = n(l.width, 0, 200);
        o.push(
          rule(sel, {
            display: l.hidden ? "none" : "block",
            "inset-inline-start": `${n(l.x, -50, 150) ?? 0}%`,
            top: `${n(l.y, -50, 150) ?? 0}%`,
            width: w ? `${w}%` : "max-content",
            "max-width": w ? undefined : "100%",
            translate: `calc(${ax}% * var(--flip, 1)) ${ay}%`,
            "z-index": n(l.z, 0, 100) ?? 50,
            rotate: n(l.rotate, -180, 180) ? `${n(l.rotate, -180, 180)}deg` : undefined,
            opacity: n(l.opacity, 0, 1),
          }),
        );
        const pad = n(l.padding, 0, 200);
        o.push(
          rule(`${sel} [data-lc]`, {
            color: safeColour(l.color),
            "background-color": safeColour(l.background),
            "font-size": n(l.fontSize, 6, 400) ? `${n(l.fontSize, 6, 400)}px` : undefined,
            "font-weight": n(l.fontWeight, 100, 900),
            "line-height": n(l.lineHeight, 0.6, 3),
            "text-align": l.align,
            "justify-content": l.align ? ALIGN[l.align] : undefined,
            "border-radius": n(l.radius, 0, 999) !== undefined ? `${n(l.radius, 0, 999)}px` : undefined,
            padding: pad !== undefined ? (layer.kind === "button" ? `${Math.round(pad * 0.6)}px ${pad * 1.6}px` : `${pad}px`) : undefined,
            "font-family": font(l.font),
          }),
        );
      });
    }
  });

  return [out.desktop.join(""), `@media ${DEVICE_MEDIA.tablet}{${out.tablet.join("")}}`, `@media ${DEVICE_MEDIA.mobile}{${out.mobile.join("")}}`].join("");
}

/** Fonts the slider uses (their @font-face goes into the page). */
export function sliderFonts(slides: Slide[]): string[] {
  const ids = new Set<string>();
  const add = (v: unknown) => {
    const id = safeFontId(v);
    if (id) ids.add(id);
  };
  for (const s of slides) {
    for (const d of DEVICES) add(atDevice(s.copy, d).font);
    for (const l of s.layers ?? []) for (const d of DEVICES) add(atDevice(l, d).font);
  }
  return [...ids];
}
