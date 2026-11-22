"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ANCHORS, BUILTIN_FONTS, LAYER_ANIMATIONS, newLayer, newSlide, SLIDE_TRANSITIONS, SLIDER_DEFAULTS, sliderOf, type Device, type FontSettings, type Layer, type LayerKind, type Slide, type Slider } from "@arapoush/schema";
import {
  ArrowCounterClockwise,
  ArrowClockwise,
  ArrowDown,
  ArrowUp,
  Copy as CopyIcon,
  Desktop,
  DeviceMobile,
  DeviceTablet,
  Eye,
  EyeSlash,
  Image as ImageIcon,
  Play,
  Plus,
  Rectangle,
  Square,
  TextT,
  Trash,
} from "@phosphor-icons/react";
import { previewSrc } from "@/lib/api";
import { Colour, MediaField, Num, Pick, Row, Seg, Texts, Toggle } from "./fields";
import { clone, DEVICE_LABEL, L, overridden, read, reset, uniqueKey, updateLayer, updateSlide, write, type Target } from "./model";
import { Stage } from "./Stage";

const TRANSITION_LABEL: Record<string, string> = { inherit: "مثل تنظیمات اسلایدر", wipe: "پرده‌ای (طراحی فعلی)", fade: "محو شدن", slide: "کشویی", zoom: "زوم", circle: "دایره‌ای", curtain: "باز شدن از وسط", none: "بدون ترنزیشن" };
const ANIM_LABEL: Record<string, string> = { none: "بدون انیمیشن", fade: "محو", up: "از پایین", down: "از بالا", start: "از ابتدا (کنار متن)", end: "از انتها", zoom: "زوم", mask: "آشکار شدن" };
const KIND_LABEL: Record<LayerKind, string> = { text: "متن", image: "تصویر", button: "دکمه", shape: "شکل" };
const KIND_ICON: Record<LayerKind, React.ReactNode> = { text: <TextT size={16} />, image: <ImageIcon size={16} />, button: <Rectangle size={16} />, shape: <Square size={16} /> };
const ANCHOR_ARROW = ["↖", "↑", "↗", "←", "•", "→", "↙", "↓", "↘"];

type Props = {
  /** The whole `page.home.hero` entry data; the studio writes `slider` into it. */
  data: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
  canEdit: boolean;
  fonts?: FontSettings;
};

/**
 * Slider builder: slides and layers on the start side, a live stage per device in the middle,
 * and the selected element's settings on the end side. Every value can differ per device
 * (desktop → tablet → mobile cascade); a dot marks what this device changes.
 */
export function SliderStudio({ data, onChange, canEdit, fonts }: Props) {
  const stored = !!(data.slider as Slider | undefined)?.slides?.length;
  const slider = useMemo(() => sliderOf(data as Parameters<typeof sliderOf>[0]), [data]);
  const slides = useMemo(() => slider.slides ?? [], [slider]);
  const settings = { ...SLIDER_DEFAULTS, ...(slider.settings ?? {}) };
  const [slideKey, setSlideKey] = useState(slides[0]?.key ?? "");
  const [target, setTarget] = useState<Target>({ kind: "copy" });
  const [device, setDevice] = useState<Device>("desktop");
  const [locale, setLocale] = useState<"fa" | "en" | "tr">("fa");
  const [play, setPlay] = useState(0);
  const past = useRef<Slider[]>([]);
  const future = useRef<Slider[]>([]);
  const [, bump] = useState(0);

  const slide = slides.find((s) => s.key === slideKey) ?? slides[0];
  const slideIndex = slide ? slides.indexOf(slide) : -1;
  useEffect(() => {
    if (!slide && slides[0]) setSlideKey(slides[0].key);
  }, [slide, slides]);

  const fontMap = useMemo(() => {
    const m: Record<string, string> = { sans: "var(--font)", ui: "Inter, var(--font)", mark: "ui-monospace, monospace" };
    for (const f of fonts?.families ?? []) m[f.key] = `"opex-${f.key}", var(--font)`;
    return m;
  }, [fonts]);
  const fontOptions = useMemo(() => [...Object.entries(BUILTIN_FONTS), ...(fonts?.families ?? []).map((f) => [f.key, f.name] as const)] as [string, string][], [fonts]);
  useUploadedFonts(fonts);

  /** Every edit goes through here (one undo step, or merged into the current one while dragging). */
  const commit = useCallback(
    (next: Slider, merge = false) => {
      if (!merge) {
        past.current = [...past.current.slice(-80), slider];
        future.current = [];
      }
      onChange({ ...data, slider: next });
      bump((x) => x + 1);
    },
    [data, onChange, slider],
  );
  const startGesture = useCallback(() => {
    past.current = [...past.current.slice(-80), slider];
    future.current = [];
  }, [slider]);
  const undo = useCallback(() => {
    const p = past.current.pop();
    if (!p) return;
    future.current.push(slider);
    onChange({ ...data, slider: p });
    bump((x) => x + 1);
  }, [data, onChange, slider]);
  const redo = useCallback(() => {
    const f = future.current.pop();
    if (!f) return;
    past.current.push(slider);
    onChange({ ...data, slider: f });
    bump((x) => x + 1);
  }, [data, onChange, slider]);

  const setSlide = (s: Slide, merge = false) => commit(updateSlide(slider, s.key, () => s), merge);
  const setLayer = (key: string, fn: (l: Layer) => Layer | null) => slide && setSlide(updateLayer(slide, key, fn));
  const layer = target.kind === "layer" ? slide?.layers?.find((l) => l.key === target.key) : undefined;

  // Keyboard: undo/redo, nudge, delete, duplicate.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") return e.preventDefault(), e.shiftKey ? redo() : undo();
      if (mod && e.key.toLowerCase() === "y") return e.preventDefault(), redo();
      if (!canEdit || !slide) return;
      if (layer && (e.key === "Delete" || e.key === "Backspace")) return e.preventDefault(), setLayer(layer.key, () => null), setTarget({ kind: "slide" });
      if (layer && mod && e.key.toLowerCase() === "d") return e.preventDefault(), duplicateLayer(layer);
      const step = e.shiftKey ? 5 : 0.5;
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const mv = arrows[e.key];
      if (!mv) return;
      const physical = locale === "fa" ? -mv[0] : mv[0];
      if (layer) {
        e.preventDefault();
        setLayer(layer.key, (l) => write(l, device, { x: Math.round(((read(l, device, "x") as number) ?? 0) * 10 + physical * 10) / 10, y: Math.round(((read(l, device, "y") as number) ?? 0) * 10 + mv[1] * 10) / 10 }));
      } else if (target.kind === "copy" || target.kind === "product" || target.kind === "ctas") {
        e.preventDefault();
        const o = slide[target.kind];
        setSlide({ ...slide, [target.kind]: write(o, device, { dx: ((read(o, device, "dx") as number) ?? 0) + physical, dy: ((read(o, device, "dy") as number) ?? 0) + mv[1] }) });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const addSlide = () => {
    const s = newSlide(uniqueKey("slide", slides.map((x) => x.key)));
    commit({ ...slider, slides: [...slides, s] });
    setSlideKey(s.key);
    setTarget({ kind: "copy" });
  };
  const duplicateSlide = (s: Slide) => {
    const c = { ...clone(s), key: uniqueKey(`${s.key}-copy`, slides.map((x) => x.key)), name: `${s.name ?? s.key} (کپی)` };
    const list = [...slides];
    list.splice(slides.indexOf(s) + 1, 0, c);
    commit({ ...slider, slides: list });
    setSlideKey(c.key);
  };
  const moveSlide = (s: Slide, by: number) => {
    const i = slides.indexOf(s);
    const j = i + by;
    if (j < 0 || j >= slides.length) return;
    const list = [...slides];
    [list[i], list[j]] = [list[j]!, list[i]!];
    commit({ ...slider, slides: list });
  };
  const removeSlide = (s: Slide) => {
    if (slides.length < 2 || !confirm(`اسلاید «${s.name ?? s.key}» حذف شود؟`)) return;
    commit({ ...slider, slides: slides.filter((x) => x !== s) });
  };
  const addLayer = (kind: LayerKind) => {
    if (!slide) return;
    const l = newLayer(kind, uniqueKey(kind, (slide.layers ?? []).map((x) => x.key)));
    setSlide({ ...slide, layers: [...(slide.layers ?? []), l] });
    setTarget({ kind: "layer", key: l.key });
  };
  const duplicateLayer = (l: Layer) => {
    if (!slide) return;
    const c = { ...clone(l), key: uniqueKey(l.kind, (slide.layers ?? []).map((x) => x.key)), x: ((l.x as number) ?? 0) + 3, y: ((l.y as number) ?? 0) + 3 };
    setSlide({ ...slide, layers: [...(slide.layers ?? []), c] });
    setTarget({ kind: "layer", key: c.key });
  };
  /** Layer order = stacking order (z). Moving up the list brings it to the front. */
  const restack = (l: Layer, by: 1 | -1) => {
    if (!slide) return;
    const z = (read(l, device, "z") as number) ?? 50;
    setLayer(l.key, (x) => write(x, device, { z: Math.max(0, Math.min(100, z + by * 5)) }));
  };

  if (!slide) {
    return (
      <div className="card">
        <div className="card-body stack">
          <p>اسلایدی وجود ندارد.</p>
          {canEdit && (
            <button type="button" className="btn primary" onClick={addSlide}>
              <Plus size={16} aria-hidden /> اسلاید تازه
            </button>
          )}
        </div>
      </div>
    );
  }

  /** A responsive field of the selected object: reads/writes the current device. */
  const field = <T extends object>(obj: T | undefined, set: (o: T) => void) => ({
    v: (k: string) => read(obj, device, k),
    over: (k: string) => overridden(obj, device, k),
    set: (k: string, val: unknown) => set(write(obj, device, { [k]: val }) as T),
    reset: (k: string) => set(reset(obj, device, k) as T),
  });
  const R = (label: string, f: ReturnType<typeof field>, k: string, children: React.ReactNode, wide = false) => (
    <Row label={label} device={device} over={f.over(k)} onReset={() => f.reset(k)} wide={wide}>
      {children}
    </Row>
  );
  const dis = !canEdit;
  const fontPick = (f: ReturnType<typeof field>, k = "font") => <Pick value={f.v(k)} options={fontOptions} empty="فونت بخش (پیش‌فرض)" onChange={(x) => f.set(k, x)} disabled={dis} />;
  const slotCommon = (f: ReturnType<typeof field>) => (
    <>
      {R("پنهان در این دستگاه", f, "hidden", <Toggle label="پنهان" value={f.v("hidden")} onChange={(x) => f.set("hidden", x || undefined)} disabled={dis} />)}
      {R("جابه‌جایی افقی (٪ عرض)", f, "dx", <Num value={f.v("dx")} min={-100} max={100} step={0.5} onChange={(x) => f.set("dx", x)} disabled={dis} />)}
      {R("جابه‌جایی عمودی (٪ عرض)", f, "dy", <Num value={f.v("dy")} min={-100} max={100} step={0.5} onChange={(x) => f.set("dy", x)} disabled={dis} />)}
    </>
  );

  let inspector: React.ReactNode = null;
  let title = "";
  if (target.kind === "settings") {
    title = "تنظیمات کل اسلایدر";
    const s = settings;
    const set = (k: string, v: unknown) => commit({ ...slider, settings: { ...s, [k]: v } });
    inspector = (
      <>
        <Row label="ترنزیشن پیش‌فرض">
          <Pick value={s.transition} options={SLIDE_TRANSITIONS.map((t) => [t, TRANSITION_LABEL[t]!] as const)} onChange={(x) => set("transition", x ?? "wipe")} disabled={dis} />
        </Row>
        <Row label="مدت ترنزیشن (ثانیه)">
          <Num value={s.duration} min={0.2} max={4} step={0.05} onChange={(x) => set("duration", x ?? 1.25)} disabled={dis} />
        </Row>
        <Row label="پخش خودکار">
          <Toggle label="روشن" value={s.autoplay} onChange={(x) => set("autoplay", x)} disabled={dis} />
        </Row>
        <Row label="زمان هر اسلاید (ثانیه)">
          <Num value={s.interval} min={2} max={60} step={0.5} onChange={(x) => set("interval", x ?? 7)} disabled={dis} />
        </Row>
        <Row label="توقف با رفتن ماوس روی اسلایدر">
          <Toggle label="روشن" value={s.pauseOnHover} onChange={(x) => set("pauseOnHover", x)} disabled={dis} />
        </Row>
        <Row label="فلش‌های قبلی/بعدی">
          <Toggle label="نمایش" value={s.arrows} onChange={(x) => set("arrows", x)} disabled={dis} />
        </Row>
        <Row label="شمارهٔ اسلایدها و نوار پیشرفت">
          <Toggle label="نمایش" value={s.numbers} onChange={(x) => set("numbers", x)} disabled={dis} />
        </Row>
      </>
    );
  } else if (target.kind === "slide") {
    title = "اسلاید";
    const set = (k: string, v: unknown) => setSlide({ ...slide, [k]: v });
    inspector = (
      <>
        <Row label="نام (فقط در کنسول)">
          <input value={slide.name ?? ""} placeholder={slide.key} disabled={dis} onChange={(e) => set("name", e.target.value || undefined)} />
        </Row>
        <Row label="نمایش روی سایت">
          <Toggle label="نمایش داده شود" value={slide.enabled !== false} onChange={(x) => set("enabled", x)} disabled={dis} />
        </Row>
        <Row label="رنگ‌بندی پایه">
          <Seg value={slide.tone ?? "light"} options={[["light", "روشن"], ["dark", "تیره"]] as const} onChange={(x) => set("tone", x)} disabled={dis} />
        </Row>
        <Row label="ترنزیشن ورود به این اسلاید">
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <Pick value={slide.transition ?? "inherit"} options={(["inherit", ...SLIDE_TRANSITIONS] as const).map((t) => [t, TRANSITION_LABEL[t]!] as const)} onChange={(x) => set("transition", x)} disabled={dis} />
            <button type="button" className="btn sm" onClick={() => setPlay((p) => p + 1)} title="پیش‌نمایش ترنزیشن">
              <Play size={14} aria-hidden /> پخش
            </button>
          </div>
        </Row>
        <Row label="زمان این اسلاید (ثانیه، ۰ = پیش‌فرض)">
          <Num value={slide.interval ?? 0} min={0} max={60} step={0.5} onChange={(x) => set("interval", x || undefined)} disabled={dis} />
        </Row>
      </>
    );
  } else if (target.kind === "background") {
    title = "پس‌زمینه";
    const b = slide.background ?? {};
    const f = field(b, (o) => setSlide({ ...slide, background: o }));
    const setFixed = (k: string, v: unknown) => setSlide({ ...slide, background: { ...b, [k]: v } });
    inspector = (
      <>
        {R(device === "desktop" ? "تصویر" : `تصویر ${DEVICE_LABEL[device]}`, f, "image", <MediaField value={f.v("image")} onChange={(x) => f.set("image", x)} disabled={dis} />, true)}
        {device === "desktop" && (
          <Row label="تصویر نسخهٔ فارسی (راست‌به‌چپ)" wide>
            <MediaField value={b.imageRtl} onChange={(x) => setFixed("imageRtl", x)} disabled={dis} />
          </Row>
        )}
        {R("ویدیو (MP4/WebM)", f, "video", <MediaField kind="video" value={f.v("video")} onChange={(x) => f.set("video", x)} disabled={dis} />, true)}
        {R("ویدیو در این دستگاه", f, "noVideo", <Toggle label="خاموش (تصویر نشان داده شود)" value={f.v("noVideo")} onChange={(x) => f.set("noVideo", x || undefined)} disabled={dis} />)}
        {R("نقطهٔ کانونی افقی (٪)", f, "focusX", <Num value={f.v("focusX")} min={0} max={100} onChange={(x) => f.set("focusX", x)} disabled={dis} />)}
        {R("نقطهٔ کانونی عمودی (٪)", f, "focusY", <Num value={f.v("focusY")} min={0} max={100} onChange={(x) => f.set("focusY", x)} disabled={dis} />)}
        <p className="small muted">برای تعیین نقطهٔ کانونی روی پیش‌نمایش کلیک کنید؛ در برش‌های دیگر همان نقطه در کادر می‌ماند.</p>
        {R("رنگ روی تصویر", f, "overlay", <Colour value={f.v("overlay")} onChange={(x) => f.set("overlay", x)} disabled={dis} />)}
        {R("سایهٔ پشت متن (تبلت و موبایل)", f, "wash", <Pick value={f.v("wash") ?? "auto"} options={[["auto", "خودکار (طبق رنگ‌بندی)"], ["light", "روشن"], ["dark", "تیره"], ["none", "بدون سایه"]] as const} onChange={(x) => f.set("wash", x)} disabled={dis} />)}
        {device === "desktop" && (
          <>
            <Row label="رنگ پس‌زمینه">
              <Colour value={b.color} onChange={(x) => setFixed("color", x)} disabled={dis} />
            </Row>
            <Row label="قرینه در نسخهٔ فارسی">
              <Toggle label="تصویر در راست‌به‌چپ قرینه شود" value={b.mirrorRtl !== false} onChange={(x) => setFixed("mirrorRtl", x)} disabled={dis} />
            </Row>
            <Row label="زوم آرام (Ken Burns)">
              <Toggle label="روشن" value={b.kenBurns} onChange={(x) => setFixed("kenBurns", x || undefined)} disabled={dis} />
            </Row>
          </>
        )}
      </>
    );
  } else if (target.kind === "copy") {
    title = "متن اصلی اسلاید";
    const c = slide.copy ?? {};
    const f = field(c, (o) => setSlide({ ...slide, copy: o }));
    inspector = (
      <>
        <Row label="عنوان (خط دوم کم‌رنگ‌تر)" wide>
          <Texts multiline value={c.title} onChange={(x) => setSlide({ ...slide, copy: { ...c, title: x } })} disabled={dis} />
        </Row>
        <Row label="متن زیر عنوان" wide>
          <Texts multiline value={c.lead} onChange={(x) => setSlide({ ...slide, copy: { ...c, lead: x } })} disabled={dis} />
        </Row>
        {R("رنگ عنوان", f, "color", <Colour value={f.v("color")} onChange={(x) => f.set("color", x)} disabled={dis} />)}
        {R("رنگ خط دوم", f, "mutedColor", <Colour value={f.v("mutedColor")} onChange={(x) => f.set("mutedColor", x)} disabled={dis} />)}
        {R("رنگ متن زیر عنوان", f, "leadColor", <Colour value={f.v("leadColor")} onChange={(x) => f.set("leadColor", x)} disabled={dis} />)}
        {R("چینش", f, "align", <Seg value={f.v("align") ?? "start"} options={[["start", "ابتدا"], ["center", "وسط"], ["end", "انتها"]] as const} onChange={(x) => f.set("align", x === "start" ? undefined : x)} disabled={dis} />)}
        {R("عرض متن زیر عنوان (٪)", f, "leadWidth", <Num value={f.v("leadWidth")} min={10} max={100} onChange={(x) => f.set("leadWidth", x)} disabled={dis} />)}
        {R("فونت", f, "font", fontPick(f))}
        {slotCommon(f)}
        {R("ترتیب لایه (بالاتر = جلوتر، پیش‌فرض ۳۰)", f, "z", <Num value={f.v("z")} min={0} max={100} onChange={(x) => f.set("z", x)} disabled={dis} />)}
      </>
    );
  } else if (target.kind === "product") {
    title = "تصویر محصول";
    const p = slide.product ?? {};
    const f = field(p, (o) => setSlide({ ...slide, product: o }));
    inspector = (
      <>
        {R(device === "desktop" ? "تصویر (PNG شفاف یا WebP)" : `تصویر ${DEVICE_LABEL[device]}`, f, "image", <MediaField value={f.v("image")} onChange={(x) => f.set("image", x)} disabled={dis} />, true)}
        <Row label="توضیح تصویر (alt)" wide>
          <Texts value={p.alt} onChange={(x) => setSlide({ ...slide, product: { ...p, alt: x } })} disabled={dis} />
        </Row>
        {R("اندازه (×)", f, "scale", <Num value={f.v("scale")} min={0.2} max={3} step={0.05} onChange={(x) => f.set("scale", x)} disabled={dis} />)}
        {slotCommon(f)}
        {R("ترتیب لایه (پیش‌فرض ۲۰؛ بالاتر از ۳۰ = روی متن)", f, "z", <Num value={f.v("z")} min={0} max={100} onChange={(x) => f.set("z", x)} disabled={dis} />)}
      </>
    );
  } else if (target.kind === "ctas") {
    title = "دکمه‌ها";
    const f = field(slide.ctas ?? {}, (o) => setSlide({ ...slide, ctas: o }));
    inspector = (
      <>
        {R("دکمهٔ دوم («داستان ما»)", f, "secondary", <Toggle label="نمایش" value={f.v("secondary") !== false} onChange={(x) => f.set("secondary", x ? undefined : false)} disabled={dis} />)}
        {R("جایگاه", f, "place", <Seg value={f.v("place") ?? "below"} options={[["below", "زیر متن"], ["top", "بالا"]] as const} onChange={(x) => f.set("place", x === "below" ? undefined : x)} disabled={dis} />)}
        {slotCommon(f)}
        <p className="small muted">متن دکمه‌ها در «محتوا ← اسلایدر بالای صفحه» (quote، story) برای هر سه زبان است.</p>
      </>
    );
  } else if (target.kind === "mark") {
    title = "نشان ARAPOUSH";
    const f = field(slide.mark ?? {}, (o) => setSlide({ ...slide, mark: o }));
    inspector = R("پنهان در این اسلاید", f, "hidden", <Toggle label="پنهان" value={f.v("hidden")} onChange={(x) => f.set("hidden", x || undefined)} disabled={dis} />);
  } else if (layer) {
    title = `لایهٔ ${KIND_LABEL[layer.kind]}`;
    const f = field(layer, (o) => setLayer(layer.key, () => o as Layer));
    const setFixed = (k: string, v: unknown) => setLayer(layer.key, (l) => ({ ...l, [k]: v }));
    const anim = layer.animation ?? {};
    const anchor = (f.v("anchor") as string) ?? "top-start";
    inspector = (
      <>
        <Row label="نام لایه">
          <input value={layer.name ?? ""} placeholder={layer.key} disabled={dis} onChange={(e) => setFixed("name", e.target.value || undefined)} />
        </Row>
        {(layer.kind === "text" || layer.kind === "button") && (
          <Row label={layer.kind === "button" ? "متن دکمه" : "متن"} wide>
            <Texts multiline={layer.kind === "text"} value={layer.text} onChange={(x) => setFixed("text", x)} disabled={dis} />
          </Row>
        )}
        {layer.kind === "text" && (
          <Row label="نوع متن (برای سئو)">
            <Pick value={layer.tag ?? "p"} options={[["p", "پاراگراف"], ["h2", "عنوان H2"], ["h3", "عنوان H3"], ["span", "متن ساده"]] as const} onChange={(x) => setFixed("tag", x)} disabled={dis} />
          </Row>
        )}
        {layer.kind === "image" && R(device === "desktop" ? "تصویر (هر فرمتی، PNG شفاف هم)" : `تصویر ${DEVICE_LABEL[device]}`, f, "image", <MediaField value={f.v("image")} onChange={(x) => f.set("image", x)} disabled={dis} />, true)}
        {layer.kind === "image" && (
          <Row label="توضیح تصویر (alt)" wide>
            <Texts value={layer.alt} onChange={(x) => setFixed("alt", x)} disabled={dis} />
          </Row>
        )}
        {layer.kind !== "shape" && (
          <Row label="لینک (اختیاری)">
            <input dir="ltr" value={layer.href ?? ""} placeholder="/fa/products یا #contact" disabled={dis} onChange={(e) => setFixed("href", e.target.value || undefined)} />
          </Row>
        )}
        <h4 className="ss-h">جایگاه و اندازه · {DEVICE_LABEL[device]}</h4>
        {R("نقطهٔ اتصال", f, "anchor", (
          <div className="ss-anchor" role="group" aria-label="نقطهٔ اتصال">
            {ANCHORS.map((a, i) => (
              <button key={a} type="button" aria-pressed={anchor === a} disabled={dis} onClick={() => f.set("anchor", a)} title={a}>
                {ANCHOR_ARROW[i]}
              </button>
            ))}
          </div>
        ))}
        {R("افقی (٪ از ابتدا)", f, "x", <Num value={f.v("x")} min={-50} max={150} step={0.5} onChange={(x) => f.set("x", x)} disabled={dis} />)}
        {R("عمودی (٪ از بالا)", f, "y", <Num value={f.v("y")} min={-50} max={150} step={0.5} onChange={(x) => f.set("y", x)} disabled={dis} />)}
        {R("عرض (٪ اسلاید، ۰ = خودکار)", f, "width", <Num value={f.v("width")} min={0} max={200} step={0.5} onChange={(x) => f.set("width", x)} disabled={dis} />)}
        {R("ترتیب لایه (z؛ متن اصلی ۳۰، محصول ۲۰)", f, "z", <Num value={f.v("z")} min={0} max={100} onChange={(x) => f.set("z", x)} disabled={dis} />)}
        {R("چرخش (درجه)", f, "rotate", <Num value={f.v("rotate")} min={-180} max={180} onChange={(x) => f.set("rotate", x)} disabled={dis} />)}
        {R("شفافیت", f, "opacity", <Num value={f.v("opacity")} min={0} max={1} step={0.05} onChange={(x) => f.set("opacity", x)} disabled={dis} />)}
        {R("پنهان در این دستگاه", f, "hidden", <Toggle label="پنهان" value={f.v("hidden")} onChange={(x) => f.set("hidden", x || undefined)} disabled={dis} />)}
        <h4 className="ss-h">ظاهر · {DEVICE_LABEL[device]}</h4>
        {layer.kind !== "image" && layer.kind !== "shape" && (
          <>
            {R("رنگ متن", f, "color", <Colour value={f.v("color")} onChange={(x) => f.set("color", x)} disabled={dis} />)}
            {R("اندازهٔ متن (px)", f, "fontSize", <Num value={f.v("fontSize")} min={6} max={400} onChange={(x) => f.set("fontSize", x)} disabled={dis} />)}
            {R("ضخامت", f, "fontWeight", <Pick value={f.v("fontWeight") ? String(f.v("fontWeight")) : ""} options={["300", "400", "500", "600", "700", "800", "900"].map((w) => [w, w] as const)} empty="پیش‌فرض" onChange={(x) => f.set("fontWeight", x ? Number(x) : undefined)} disabled={dis} />)}
            {R("فاصلهٔ خطوط", f, "lineHeight", <Num value={f.v("lineHeight")} min={0.6} max={3} step={0.05} onChange={(x) => f.set("lineHeight", x)} disabled={dis} />)}
            {R("چینش متن", f, "align", <Seg value={f.v("align") ?? "start"} options={[["start", "ابتدا"], ["center", "وسط"], ["end", "انتها"]] as const} onChange={(x) => f.set("align", x)} disabled={dis} />)}
            {R("فونت", f, "font", fontPick(f))}
          </>
        )}
        {layer.kind !== "image" && R(layer.kind === "text" ? "رنگ زمینه (اختیاری)" : "رنگ", f, "background", <Colour value={f.v("background")} onChange={(x) => f.set("background", x)} disabled={dis} />)}
        {R("گردی گوشه‌ها (px)", f, "radius", <Num value={f.v("radius")} min={0} max={999} onChange={(x) => f.set("radius", x)} disabled={dis} />)}
        {layer.kind !== "shape" && R("فاصلهٔ داخلی (px)", f, "padding", <Num value={f.v("padding")} min={0} max={200} onChange={(x) => f.set("padding", x)} disabled={dis} />)}
        <h4 className="ss-h">انیمیشن ورود (همهٔ دستگاه‌ها)</h4>
        <Row label="نوع">
          <Pick value={anim.type ?? "fade"} options={LAYER_ANIMATIONS.map((a) => [a, ANIM_LABEL[a]!] as const)} onChange={(x) => setFixed("animation", { ...anim, type: x })} disabled={dis} />
        </Row>
        <Row label="تأخیر (ثانیه)">
          <Num value={anim.delay ?? 0} min={0} max={10} step={0.05} onChange={(x) => setFixed("animation", { ...anim, delay: x })} disabled={dis} />
        </Row>
        <Row label="مدت (ثانیه)">
          <Num value={anim.duration ?? 0.8} min={0.1} max={5} step={0.05} onChange={(x) => setFixed("animation", { ...anim, duration: x })} disabled={dis} />
        </Row>
      </>
    );
  }

  const prevSlide = slides[(slideIndex - 1 + slides.length) % slides.length];
  const transition = slide.transition && slide.transition !== "inherit" ? slide.transition : settings.transition;
  const builtin: [Target, string, boolean][] = [
    [{ kind: "copy" }, "متن اصلی", !!read(slide.copy, device, "hidden")],
    [{ kind: "product" }, "تصویر محصول", !!read(slide.product, device, "hidden") || !read(slide.product, device, "image")],
    [{ kind: "ctas" }, "دکمه‌ها", !!read(slide.ctas, device, "hidden")],
    [{ kind: "mark" }, "نشان ARAPOUSH", !!read(slide.mark, device, "hidden")],
    [{ kind: "background" }, "پس‌زمینه", false],
  ];
  const isSel = (t: Target) => JSON.stringify(t) === JSON.stringify(target);
  const layersByZ = [...(slide.layers ?? [])].sort((a, b) => ((read(b, device, "z") as number) ?? 50) - ((read(a, device, "z") as number) ?? 50));

  return (
    <div className="ss">
      {!stored && (
        <div className="note" role="status">
          این اسلایدها از طراحی فعلی سایت خوانده شده‌اند. با اولین تغییر، در ساختار تازهٔ اسلایدساز ذخیره می‌شوند و سایت تا وقتی منتشر نکنید همان‌طور می‌ماند.
        </div>
      )}
      <div className="ss-top">
        <span className="seg" role="group" aria-label="دستگاه">
          {(
            [
              ["desktop", <Desktop key="d" size={18} />],
              ["tablet", <DeviceTablet key="t" size={18} />],
              ["mobile", <DeviceMobile key="m" size={18} />],
            ] as const
          ).map(([d, icon]) => (
            <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)} style={{ paddingInline: 12, gap: 6, display: "inline-flex", alignItems: "center" }}>
              {icon} {DEVICE_LABEL[d]}
            </button>
          ))}
        </span>
        <span className="seg" role="group" aria-label="زبان پیش‌نمایش">
          {(["fa", "en", "tr"] as const).map((l) => (
            <button key={l} type="button" aria-pressed={locale === l} onClick={() => setLocale(l)} style={{ paddingInline: 10 }}>
              {l.toUpperCase()}
            </button>
          ))}
        </span>
        <span className="row" style={{ marginInlineStart: "auto" }}>
          <button type="button" className="btn sm" onClick={() => setPlay((p) => p + 1)}>
            <Play size={14} aria-hidden /> پخش ترنزیشن
          </button>
          <button type="button" className="btn sm ghost" onClick={undo} disabled={!past.current.length} title="واگرد (Ctrl+Z)">
            <ArrowCounterClockwise size={16} aria-hidden /> <span className="sr-only">واگرد</span>
          </button>
          <button type="button" className="btn sm ghost" onClick={redo} disabled={!future.current.length} title="انجام دوباره (Ctrl+Shift+Z)">
            <ArrowClockwise size={16} aria-hidden /> <span className="sr-only">انجام دوباره</span>
          </button>
          <button type="button" className="btn sm" aria-pressed={target.kind === "settings"} onClick={() => setTarget({ kind: "settings" })}>
            تنظیمات اسلایدر
          </button>
        </span>
      </div>
      {device !== "desktop" && (
        <p className="small ss-device-note">
          در حالت {DEVICE_LABEL[device]} هر تغییری فقط برای همین دستگاه ذخیره می‌شود{device === "mobile" ? " (موبایل از تبلت و دسکتاپ ارث می‌برد)" : " (تبلت از دسکتاپ ارث می‌برد)"}. فیلدهای تغییرکرده نقطهٔ رنگی دارند.
        </p>
      )}

      <div className="ss-grid">
        <aside className="ss-panel" aria-label="اسلایدها و لایه‌ها">
          <div className="ss-panel-head">
            <h3>اسلایدها</h3>
            {canEdit && (
              <button type="button" className="btn sm" onClick={addSlide}>
                <Plus size={14} aria-hidden /> اسلاید
              </button>
            )}
          </div>
          <ol className="ss-slides">
            {slides.map((s, i) => {
              const bg = s.background?.image?.src;
              return (
                <li key={s.key} aria-current={s === slide || undefined} data-off={s.enabled === false || undefined}>
                  <button type="button" className="ss-thumb" onClick={() => (setSlideKey(s.key), setTarget({ kind: "slide" }))} style={{ background: s.background?.color }}>
                    {bg && <img src={previewSrc(bg)} alt="" />}
                    <span>
                      {String(i + 1).padStart(2, "0")} · {s.name ?? (L(s.copy?.title, "fa").split("\n")[0] || s.key)}
                    </span>
                  </button>
                  {canEdit && (
                    <span className="ss-tools">
                      <button type="button" onClick={() => moveSlide(s, -1)} disabled={i === 0} aria-label="بالاتر">
                        <ArrowUp size={13} />
                      </button>
                      <button type="button" onClick={() => moveSlide(s, 1)} disabled={i === slides.length - 1} aria-label="پایین‌تر">
                        <ArrowDown size={13} />
                      </button>
                      <button type="button" onClick={() => setSlide({ ...s, enabled: s.enabled === false })} aria-label={s.enabled === false ? "نمایش" : "پنهان"}>
                        {s.enabled === false ? <EyeSlash size={13} /> : <Eye size={13} />}
                      </button>
                      <button type="button" onClick={() => duplicateSlide(s)} aria-label="کپی">
                        <CopyIcon size={13} />
                      </button>
                      <button type="button" onClick={() => removeSlide(s)} disabled={slides.length < 2} aria-label="حذف">
                        <Trash size={13} />
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="ss-panel-head">
            <h3>لایه‌های این اسلاید</h3>
          </div>
          {canEdit && (
            <div className="ss-add">
              {(["text", "image", "button", "shape"] as const).map((k) => (
                <button key={k} type="button" className="btn sm" onClick={() => addLayer(k)}>
                  {KIND_ICON[k]} {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          )}
          <ul className="ss-layers">
            {layersByZ.map((l) => {
              const hidden = !!read(l, device, "hidden");
              return (
                <li key={l.key} aria-current={isSel({ kind: "layer", key: l.key }) || undefined}>
                  <button type="button" className="ss-layer-name" onClick={() => setTarget({ kind: "layer", key: l.key })} data-hidden={hidden || undefined}>
                    {KIND_ICON[l.kind]} {l.name ?? (L(l.text, "fa").slice(0, 24) || KIND_LABEL[l.kind])}
                    <span className="ss-z">z {(read(l, device, "z") as number) ?? 50}</span>
                  </button>
                  {canEdit && (
                    <span className="ss-tools">
                      <button type="button" onClick={() => restack(l, 1)} aria-label="جلوتر">
                        <ArrowUp size={13} />
                      </button>
                      <button type="button" onClick={() => restack(l, -1)} aria-label="عقب‌تر">
                        <ArrowDown size={13} />
                      </button>
                      <button type="button" onClick={() => setLayer(l.key, (x) => write(x, device, { hidden: hidden ? undefined : true }))} aria-label={hidden ? "نمایش" : "پنهان"}>
                        {hidden ? <EyeSlash size={13} /> : <Eye size={13} />}
                      </button>
                      <button type="button" onClick={() => duplicateLayer(l)} aria-label="کپی">
                        <CopyIcon size={13} />
                      </button>
                      <button type="button" onClick={() => (setLayer(l.key, () => null), setTarget({ kind: "slide" }))} aria-label="حذف">
                        <Trash size={13} />
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
            {builtin.map(([t, label, hidden]) => (
              <li key={t.kind} aria-current={isSel(t) || undefined} className="ss-builtin">
                <button type="button" className="ss-layer-name" onClick={() => setTarget(t)} data-hidden={hidden || undefined}>
                  {label}
                </button>
              </li>
            ))}
          </ul>
          <p className="small muted">بالاتر در فهرست = جلوتر. برای بردن متن زیر یک عکس، ترتیب عکس را از متن بیشتر کنید.</p>
        </aside>

        <div className="ss-center">
          <Stage
            slide={slide}
            prev={prevSlide}
            device={device}
            locale={locale}
            target={target}
            onSelect={setTarget}
            onChange={setSlide}
            onStart={startGesture}
            fonts={fontMap}
            play={play}
            transition={transition}
            duration={settings.duration}
            canEdit={canEdit}
          />
          <p className="small muted">
            پیش‌نمایش تقریبی است: لایه‌ها را بکشید، با کلیدهای جهت جابه‌جا کنید (Shift برای گام بزرگ‌تر)، Delete برای حذف و Ctrl+D برای کپی. نمای دقیق: ذخیره، سپس «پیش‌نمایش روی سایت».
          </p>
        </div>

        <aside className="ss-panel ss-inspector" aria-label="تنظیمات">
          <div className="ss-panel-head">
            <h3>{title}</h3>
            {target.kind !== "settings" && target.kind !== "slide" && <span className="badge accent">{DEVICE_LABEL[device]}</span>}
          </div>
          <div className="ss-fields">{inspector}</div>
        </aside>
      </div>
    </div>
  );
}

/** Loads uploaded font files into the console so the stage shows them. */
function useUploadedFonts(fonts?: FontSettings) {
  useEffect(() => {
    if (typeof FontFace === "undefined") return;
    for (const f of fonts?.families ?? [])
      for (const file of f.files ?? []) {
        if (!file.src) continue;
        const face = new FontFace(`opex-${f.key}`, `url(${previewSrc(file.src)})`, { weight: String(file.weight ?? 400), style: file.style ?? "normal" });
        face.load().then((x) => document.fonts.add(x), () => {});
      }
  }, [fonts]);
}
