import Image, { getImageProps } from "next/image";
import { atDevice, DEVICE_MEDIA, type ImageValue, type Layer } from "@arapoush/schema";
import styles from "../Hero.module.css";

const text = (v: unknown) => (typeof v === "string" ? v : "");
/** SVG and GIF are served as uploaded (the optimiser would rasterise them or drop the animation). */
const raw = (src: string) => /\.(svg|gif)$/i.test(src);
const ok = (img: ImageValue | undefined): img is ImageValue => !!img && typeof img.src === "string" && /^\/(images|media)\//.test(img.src);

type Common = { sizes: string; quality: number; priority?: boolean; alt?: string; className?: string };

/**
 * One image with per-device art direction: the phone and tablet images (when set) become <source>s,
 * each optimised by next/image at its own sizes.
 */
export function Picture({ desktop, tablet, mobile, fill, ...o }: Common & { desktop?: ImageValue; tablet?: ImageValue; mobile?: ImageValue; fill?: boolean }) {
  const main = ok(desktop) ? desktop : ok(tablet) ? tablet : ok(mobile) ? mobile : undefined;
  if (!main) return null;
  const dims = (img: ImageValue) => (fill ? { fill: true as const } : { width: img.width || 1600, height: img.height || 1000 });
  const source = (img: ImageValue | undefined, media: string) => {
    if (!ok(img) || img.src === main.src) return null;
    const { props } = getImageProps({ src: img.src, alt: "", sizes: o.sizes, quality: o.quality, unoptimized: raw(img.src), ...dims(img) });
    return <source media={media} srcSet={props.srcSet ?? props.src} sizes={props.sizes} />;
  };
  return (
    <picture>
      {source(mobile, DEVICE_MEDIA.mobile)}
      {source(tablet && tablet.src !== desktop?.src ? tablet : undefined, DEVICE_MEDIA.tablet)}
      <Image
        src={main.src}
        alt={o.alt ?? ""}
        {...dims(main)}
        sizes={o.sizes}
        quality={o.quality}
        priority={o.priority}
        fetchPriority={o.priority ? "high" : "low"}
        data-critical={o.priority ? "" : undefined}
        unoptimized={raw(main.src)}
        className={o.className}
        data-no-mirror
      />
    </picture>
  );
}

/** A free layer: positioned box (CSS from sliderCss) › animated wrapper (GSAP) › content. */
export function SlideLayer({ layer, slide, index }: { layer: Layer; slide: number; index: number }) {
  const anim = layer.animation ?? {};
  const label = text(layer.text);
  let content: React.ReactNode = null;
  if (layer.kind === "image") {
    const d = atDevice(layer, "desktop").image;
    const width = typeof layer.width === "number" && layer.width > 0 ? layer.width : 30;
    content = (
      <span data-lc className={styles.layerImg}>
        <Picture desktop={d} tablet={atDevice(layer, "tablet").image} mobile={atDevice(layer, "mobile").image} sizes={`(max-width: 767px) ${Math.min(100, (atDevice(layer, "mobile").width as number) || width * 2)}vw, ${Math.min(100, width)}vw`} quality={75} alt={text(layer.alt)} />
      </span>
    );
    if (layer.href) content = <a href={layer.href} className={styles.layerLink}>{content}</a>;
  } else if (layer.kind === "button") {
    content = (
      <a data-lc href={layer.href || "#contact"} className={styles.layerBtn}>
        {label}
      </a>
    );
  } else if (layer.kind === "shape") {
    content = <span data-lc className={styles.layerShape} aria-hidden="true" />;
  } else {
    const Tag = layer.tag === "h2" || layer.tag === "h3" || layer.tag === "span" ? layer.tag : "p";
    content = (
      <Tag data-lc className={styles.layerText}>
        {label}
      </Tag>
    );
    if (layer.href) content = <a href={layer.href} className={styles.layerLink}>{content}</a>;
  }
  return (
    <div className={styles.layer} data-layer={`${slide}-${index}`}>
      <div data-anim={anim.type ?? "fade"} data-delay={anim.delay ?? 0} data-duration={anim.duration ?? 0.8}>
        {content}
      </div>
    </div>
  );
}
