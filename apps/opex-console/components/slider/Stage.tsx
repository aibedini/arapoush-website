"use client";

import { useEffect, useRef, useState } from "react";
import { atDevice, safeColour, type Anchor, type Device, type ImageValue, type Layer, type Slide, type SlideTransition } from "@arapoush/schema";
import { previewSrc } from "@/lib/api";
import { DEVICE_SIZE, L, write, type Target } from "./model";

/** Where the designed slots sit on each device, in % of the slide (from Hero.module.css). */
const SLOTS: Record<Device, { mark: { start: number; top: number; size: number; center?: boolean }; product: { start: number; top: number; w: number; h: number }; copy: { start: number; top?: number; bottom?: number; w: number; title: number; lead: number } }> = {
  desktop: { mark: { start: 0.4, top: 5.8, size: 23.4 }, product: { start: 47, top: 29.3, w: 55.7, h: 69.6 }, copy: { start: 2.5, bottom: 19, w: 39.6, title: 4.6, lead: 1.25 } },
  tablet: { mark: { start: 5.75, top: 9, size: 23.5, center: true }, product: { start: 16, top: 27, w: 84, h: 42 }, copy: { start: 5.75, top: 58, w: 76, title: 7.2, lead: 2.2 } },
  mobile: { mark: { start: 5.75, top: 12, size: 23, center: true }, product: { start: 4, top: 46, w: 112, h: 45 }, copy: { start: 5.75, top: 21, w: 88, title: 9.5, lead: 3.6 } },
};
const TONE = { light: { ink: "#000000", muted: "#6b7480", lead: "#1b1b1b" }, dark: { ink: "#f5f6f9", muted: "#b2c7de", lead: "#c9d4df" } };
const ANCHOR: Record<Anchor, [number, number]> = { "top-start": [0, 0], "top-center": [-50, 0], "top-end": [-100, 0], "center-start": [0, -50], center: [-50, -50], "center-end": [-100, -50], "bottom-start": [0, -100], "bottom-center": [-50, -100], "bottom-end": [-100, -100] };
const n = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const img = (v: ImageValue | undefined) => (v?.src ? previewSrc(v.src) : undefined);
const fam = (id: unknown, fonts: Record<string, string>) => (typeof id === "string" && id ? (fonts[id] ?? undefined) : undefined);

/** Background drawing of one slide on a device (shared by the stage and the transition preview). */
function Bg({ slide, device, rtl }: { slide: Slide; device: Device; rtl: boolean }) {
  const b = atDevice(slide.background, device);
  const desktop = slide.background ?? {};
  const src = img((device === "desktop" && rtl && desktop.imageRtl) || b.image);
  const mirror = rtl && desktop.mirrorRtl !== false;
  return (
    <div className="ss-bg" style={{ background: safeColour(desktop.color) ?? "#efe7dd" }}>
      {src && <img src={src} alt="" style={{ objectPosition: `${n(b.focusX, 50)}% ${n(b.focusY, 50)}%`, scale: mirror ? "-1 1" : undefined }} />}
      {b.video && !b.noVideo && <span className="ss-video-badge">ویدیو</span>}
      <span className="ss-overlay" style={{ background: safeColour(b.overlay) }} />
    </div>
  );
}

const KEYFRAMES: Record<SlideTransition, Keyframe[]> = {
  wipe: [{ clipPath: "inset(0% 0% 0% 100%)" }, { clipPath: "inset(0% 0% 0% 0%)" }],
  fade: [{ opacity: 0 }, { opacity: 1 }],
  slide: [{ transform: "translateX(100%)" }, { transform: "translateX(0)" }],
  zoom: [{ opacity: 0, transform: "scale(1.3)" }, { opacity: 1, transform: "scale(1)" }],
  circle: [{ clipPath: "circle(0% at 50% 50%)" }, { clipPath: "circle(75% at 50% 50%)" }],
  curtain: [{ clipPath: "inset(0% 50% 0% 50%)" }, { clipPath: "inset(0% 0% 0% 0%)" }],
  none: [{ opacity: 1 }, { opacity: 1 }],
};

type Drag = { kind: "layer" | "copy" | "product" | "ctas"; key?: string; x0: number; y0: number; a: number; b: number };

export function Stage({
  slide,
  prev,
  device,
  locale,
  target,
  onSelect,
  onChange,
  onStart,
  fonts,
  play,
  transition,
  duration,
  canEdit,
}: {
  slide: Slide;
  prev?: Slide;
  device: Device;
  locale: "fa" | "en" | "tr";
  target: Target;
  onSelect: (t: Target) => void;
  /** `merge`: part of a drag (one undo step for the whole gesture). */
  onChange: (s: Slide, merge?: boolean) => void;
  onStart: () => void;
  fonts: Record<string, string>;
  play: number;
  transition: SlideTransition;
  duration: number;
  canEdit: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [playing, setPlaying] = useState(false);
  const drag = useRef<Drag | null>(null);
  const [W, H] = DEVICE_SIZE[device];
  const rtl = locale === "fa";
  const flip = rtl ? -1 : 1;
  const slot = SLOTS[device];

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, (el.clientWidth - 22) / W, (window.innerHeight * 0.72) / H)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H]);

  // Transition preview: the previous slide underneath, this one coming in.
  useEffect(() => {
    if (!play || !bgRef.current) return;
    setPlaying(true);
    const k = transition === "slide" && rtl ? KEYFRAMES.slide.map((f) => ({ transform: String(f.transform).replace("100%", "-100%") })) : KEYFRAMES[transition];
    const a = bgRef.current.animate(k, { duration: duration * 1000, easing: "cubic-bezier(0.7, 0, 0.2, 1)" });
    a.onfinish = () => setPlaying(false);
    return () => a.cancel();
  }, [play]); // eslint-disable-line react-hooks/exhaustive-deps

  const tone = TONE[slide.tone === "dark" ? "dark" : "light"];
  const copy = atDevice(slide.copy, device);
  const product = atDevice(slide.product, device);
  const ctas = atDevice(slide.ctas, device);
  const mark = atDevice(slide.mark, device);
  const shift = (dx: unknown, dy: unknown) => `translate(${(n(dx) * W * flip) / 100}px, ${(n(dy) * W) / 100}px)`;
  const sel = (t: Target) => JSON.stringify(t) === JSON.stringify(target);

  const down = (e: React.PointerEvent, t: Target, d: Omit<Drag, "x0" | "y0">) => {
    e.stopPropagation();
    onSelect(t);
    if (!canEdit) return;
    onStart();
    drag.current = { ...d, x0: e.clientX, y0: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const px = (e.clientX - d.x0) / scale;
    const py = (e.clientY - d.y0) / scale;
    const round = (v: number) => Math.round(v * 10) / 10;
    const snap = (v: number) => (Math.abs(v - 50) < 1 ? 50 : v);
    if (d.kind === "layer") {
      const x = snap(round(d.a + ((px / W) * 100) * flip));
      const y = snap(round(d.b + (py / H) * 100));
      onChange({ ...slide, layers: (slide.layers ?? []).map((l) => (l.key === d.key ? write(l, device, { x, y }) : l)) }, true);
    } else {
      const dx = round(d.a + ((px / W) * 100) * flip);
      const dy = round(d.b + (py / W) * 100);
      onChange({ ...slide, [d.kind]: write(slide[d.kind], device, { dx, dy }) }, true);
    }
  };
  const up = () => void (drag.current = null);

  // Background selected: a click sets the focal point (what stays in frame when the crop changes).
  const stageDown = (e: React.PointerEvent) => {
    if (target.kind !== "background" || !canEdit) return onSelect({ kind: "background" });
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onStart();
    onChange({ ...slide, background: write(slide.background, device, { focusX: Math.round(((e.clientX - r.left) / r.width) * 100), focusY: Math.round(((e.clientY - r.top) / r.height) * 100) }) });
  };

  const [first, ...rest] = L(slide.copy?.title, locale).split("\n");
  const layers = slide.layers ?? [];

  return (
    <div ref={box} className="ss-stage-box">
      <div className="ss-stage-clip" style={{ width: W * scale, height: H * scale }}>
        <div className="ss-stage" dir={rtl ? "rtl" : "ltr"} lang={locale} style={{ width: W, height: H, transform: `scale(${scale})` }} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerDown={stageDown} data-tone={slide.tone}>
          {playing && prev && (
            <div className="ss-layer-abs">
              <Bg slide={prev} device={device} rtl={rtl} />
            </div>
          )}
          <div ref={bgRef} className="ss-layer-abs" data-selected={sel({ kind: "background" }) || undefined}>
            <Bg slide={slide} device={device} rtl={rtl} />
            {target.kind === "background" && <span className="ss-focus" style={{ insetInlineStart: undefined, left: `${n(atDevice(slide.background, device).focusX, 50)}%`, top: `${n(atDevice(slide.background, device).focusY, 50)}%` }} aria-hidden="true" />}
          </div>

          {!mark.hidden && (
            <div className="ss-mark" style={slot.mark.center ? { left: `${slot.mark.start}%`, right: `${slot.mark.start}%`, top: `${slot.mark.top}%`, fontSize: (slot.mark.size * W) / 100, textAlign: "center" } : { left: `${slot.mark.start}%`, top: `${slot.mark.top}%`, fontSize: (slot.mark.size * W) / 100 }} onPointerDown={(e) => (e.stopPropagation(), onSelect({ kind: "mark" }))} data-selected={sel({ kind: "mark" }) || undefined}>
              ARAPOUSH
            </div>
          )}

          {!product.hidden && product.image && (
            <div
              className="ss-slot"
              style={{ insetInlineStart: `${slot.product.start}%`, top: `${slot.product.top}%`, width: `${slot.product.w}%`, height: `${slot.product.h}%`, zIndex: n(product.z, 20), transform: `${shift(product.dx, product.dy)} scale(${n(product.scale, 1)})` }}
              data-selected={sel({ kind: "product" }) || undefined}
              onPointerDown={(e) => down(e, { kind: "product" }, { kind: "product", a: n(product.dx), b: n(product.dy) })}
            >
              <img src={img(product.image)} alt="" draggable={false} />
            </div>
          )}

          {layers.map((layer) => {
            const l = atDevice(layer, device);
            if (l.hidden) return null;
            const [ax, ay] = ANCHOR[(l.anchor ?? "top-start") as Anchor] ?? [0, 0];
            const t: Target = { kind: "layer", key: layer.key };
            const content =
              layer.kind === "image" ? (
                l.image?.src ? <img src={img(l.image)} alt="" draggable={false} style={{ width: "100%", display: "block" }} /> : <div className="ss-empty-img">تصویر</div>
              ) : layer.kind === "shape" ? (
                <div style={{ width: "100%", aspectRatio: "1" }} />
              ) : (
                L(layer.text, locale)
              );
            const pad = n(l.padding, layer.kind === "button" ? 16 : 0);
            return (
              <div
                key={layer.key}
                className="ss-free"
                data-kind={layer.kind}
                data-selected={sel(t) || undefined}
                style={{
                  insetInlineStart: `${n(l.x)}%`,
                  top: `${n(l.y)}%`,
                  width: n(l.width) ? `${n(l.width)}%` : "max-content",
                  maxWidth: n(l.width) ? undefined : "100%",
                  transform: `translate(${ax * flip}%, ${ay}%) rotate(${n(l.rotate)}deg)`,
                  zIndex: n(l.z, 50),
                  opacity: typeof l.opacity === "number" ? l.opacity : undefined,
                }}
                onPointerDown={(e) => down(e, t, { kind: "layer", key: layer.key, a: n(l.x), b: n(l.y) })}
              >
                <div
                  style={{
                    color: safeColour(l.color),
                    background: safeColour(l.background),
                    fontSize: n(l.fontSize) || undefined,
                    fontWeight: n(l.fontWeight) || undefined,
                    lineHeight: n(l.lineHeight) || undefined,
                    textAlign: l.align,
                    borderRadius: n(l.radius) || undefined,
                    padding: layer.kind === "button" ? `${Math.round(pad * 0.6)}px ${pad * 1.6}px` : pad || undefined,
                    fontFamily: fam(l.font, fonts),
                    whiteSpace: "pre-line",
                    display: layer.kind === "button" ? "inline-flex" : "block",
                    overflow: "hidden",
                  }}
                >
                  {content}
                </div>
              </div>
            );
          })}

          {!copy.hidden && (
            <div
              className="ss-slot ss-copy"
              style={{
                insetInlineStart: `${slot.copy.start}%`,
                ...(slot.copy.bottom !== undefined ? { bottom: `${slot.copy.bottom}%` } : { top: `${slot.copy.top}%` }),
                width: `${slot.copy.w}%`,
                zIndex: n(copy.z, 30),
                transform: shift(copy.dx, copy.dy),
                textAlign: copy.align,
                alignItems: copy.align === "center" ? "center" : copy.align === "end" ? "flex-end" : "flex-start",
                fontFamily: fam(copy.font, fonts),
              }}
              data-selected={sel({ kind: "copy" }) || undefined}
              onPointerDown={(e) => down(e, { kind: "copy" }, { kind: "copy", a: n(copy.dx), b: n(copy.dy) })}
            >
              <div style={{ fontSize: (slot.copy.title * W) / 100, lineHeight: 1.05, fontWeight: 500 }}>
                <div style={{ color: safeColour(copy.color) ?? tone.ink }}>{first}</div>
                {rest.map((line, i) => (
                  <div key={i} style={{ color: safeColour(copy.mutedColor) ?? tone.muted }}>
                    {line}
                  </div>
                ))}
              </div>
              <p style={{ fontSize: (slot.copy.lead * W) / 100, color: safeColour(copy.leadColor) ?? tone.lead, maxWidth: `${n(copy.leadWidth, device === "mobile" ? 70 : 64)}%`, margin: 0 }}>{L(slide.copy?.lead, locale)}</p>
              {!ctas.hidden && ctas.place !== "top" && (
                <div className="ss-ctas" style={{ transform: shift(ctas.dx, ctas.dy) }} data-selected={sel({ kind: "ctas" }) || undefined} onPointerDown={(e) => down(e, { kind: "ctas" }, { kind: "ctas", a: n(ctas.dx), b: n(ctas.dy) })}>
                  <span>{locale === "fa" ? "درخواست استعلام قیمت" : "Request a quote"}</span>
                  {ctas.secondary !== false && <span className="ghost">{locale === "fa" ? "داستان ما" : "Our story"}</span>}
                </div>
              )}
            </div>
          )}
          {!ctas.hidden && ctas.place === "top" && (
            <div className="ss-ctas" style={{ position: "absolute", insetInlineStart: "5.75%", top: "28%", zIndex: 31, transform: shift(ctas.dx, ctas.dy) }} data-selected={sel({ kind: "ctas" }) || undefined} onPointerDown={(e) => down(e, { kind: "ctas" }, { kind: "ctas", a: n(ctas.dx), b: n(ctas.dy) })}>
              <span>{locale === "fa" ? "درخواست استعلام قیمت" : "Request a quote"}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export type { Layer };
