import Image from "next/image";
import { pickL, type BlockKind, type BlockProps } from "@arapoush/schema";
import type { Dictionary, Locale } from "@/lib/i18n";
import { getForm } from "@/lib/content/forms";
import OpexForm from "@/components/forms/LazyOpexForm";
import RollText from "@/components/ui/RollText";
import MaybeLink from "@/components/ui/MaybeLink";
import { findPart } from "@/lib/parts";
import PartViewer from "./PartViewer";
import styles from "./Block.module.css";

type Props = { kind: BlockKind; id: string; props: BlockProps; t: Dictionary; locale: Locale };

/** Text with blank-line paragraphs. */
function Paragraphs({ text, className }: { text: string; className?: string }) {
  if (!text) return null;
  return (
    <>
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i} className={className}>
          {p}
        </p>
      ))}
    </>
  );
}

/**
 * Page-builder blocks (P12): sections operators add, order and fill in the visual editor. Server
 * components (no client JS except the form), in the site's own type and spacing.
 */
export default function Block({ kind, id, props: p, t, locale }: Props) {
  const L = (l: Parameters<typeof pickL>[0]) => pickL(l, locale);
  const tone = p.tone === "dark" ? styles.dark : "";
  const titleId = `${id}-title`;
  const eyebrow = L(p.eyebrow);
  const title = L(p.title);
  const head = (
    <>
      {eyebrow && (
        <p className="eyebrow" data-reveal>
          {eyebrow}
        </p>
      )}
      {title && (
        <h2 id={titleId} className={styles.h2} data-reveal>
          {title}
        </h2>
      )}
    </>
  );
  const button = p.button?.href && L(p.button.label) && (
    <div data-reveal>
      <MaybeLink href={p.button.href} className={`btn ${p.tone === "dark" ? "btn--light" : ""}`}>
        <RollText text={L(p.button.label)} />
      </MaybeLink>
    </div>
  );

  switch (kind) {
    case "spacer":
      return <div aria-hidden="true" className={styles.spacer} data-size={p.size ?? "m"} />;
    case "richText":
      return (
        <section id={id} className={`${styles.block} ${tone}`} aria-labelledby={title ? titleId : undefined}>
          <div className={`${styles.inner} ${styles.narrow}`}>
            {head}
            <div className={styles.prose} data-reveal>
              <Paragraphs text={L(p.body)} />
            </div>
          </div>
        </section>
      );
    case "imageText":
      return (
        <section id={id} className={`${styles.block} ${tone}`} aria-labelledby={title ? titleId : undefined}>
          <div className={`${styles.inner} ${styles.split}`} data-side={p.imageSide ?? "end"}>
            <div className={styles.copy}>
              {head}
              <div className={styles.prose} data-reveal>
                <Paragraphs text={L(p.body)} />
              </div>
              {button}
            </div>
            {p.image?.src && (
              <div className={styles.media} data-reveal>
                <Image src={p.image.src} alt={L(p.image.alt)} width={p.image.width ?? 1200} height={p.image.height ?? 900} sizes="(max-width: 900px) 100vw, 50vw" />
              </div>
            )}
          </div>
        </section>
      );
    case "cta":
      return (
        <section id={id} className={`${styles.block} ${styles.cta} ${tone}`} aria-labelledby={title ? titleId : undefined}>
          <div className={`${styles.inner} ${styles.narrow} ${styles.center}`}>
            {head}
            <Paragraphs text={L(p.body)} className={styles.lead} />
            {button}
          </div>
        </section>
      );
    case "faq":
      return (
        <section id={id} className={`${styles.block} ${tone}`} aria-labelledby={title ? titleId : undefined}>
          <div className={`${styles.inner} ${styles.narrow}`}>
            {head}
            <div className={styles.faq} data-reveal>
              {(p.items ?? []).map((it, i) =>
                L(it.q) ? (
                  <details key={i} className={styles.qa}>
                    <summary>{L(it.q)}</summary>
                    <div className={styles.prose}>
                      <Paragraphs text={L(it.a)} />
                    </div>
                  </details>
                ) : null,
              )}
            </div>
          </div>
        </section>
      );
    case "product3d": {
      // The 3D studio's approved parts; without them (or with "photo") the photo stands alone.
      const bodyPart = findPart(p.bodyPart);
      const closurePart = findPart(p.closurePart);
      const has3d = p.display !== "photo" && !!(bodyPart || closurePart);
      const photo = p.display !== "model" && p.image?.src;
      if (!has3d && !photo) return null;
      const name = L(bodyPart?.name) || L(closurePart?.name) || title;
      const mount = (x: typeof bodyPart) => (x ? { src: x.src, axis: x.axis, anchorMm: x.anchorMm, ...(x.look ? { look: x.look } : {}) } : null);
      const viewer = has3d && <PartViewer body={mount(bodyPart)} closure={mount(closurePart)} label={t.common.model3d.replace("{name}", name)} hint={t.common.model3dHint} />;
      const image = photo && (
        <div className={styles.media}>
          <Image src={p.image!.src} alt={L(p.image!.alt) || name} width={p.image!.width ?? 1200} height={p.image!.height ?? 1200} sizes={has3d ? "(max-width: 600px) 100vw, (max-width: 900px) 50vw, 25vw" : "(max-width: 900px) 100vw, 50vw"} />
        </div>
      );
      return (
        <section id={id} className={`${styles.block} ${tone}`} aria-labelledby={title ? titleId : undefined}>
          <div className={`${styles.inner} ${styles.split}`} data-side={p.imageSide ?? "end"}>
            <div className={styles.copy}>
              {head}
              <div className={styles.prose} data-reveal>
                <Paragraphs text={L(p.body)} />
              </div>
              {button}
            </div>
            <div className={`${styles.media} ${viewer && image ? styles.pair : ""}`} data-reveal>
              {viewer}
              {image}
            </div>
          </div>
        </section>
      );
    }
    case "form": {
      const form = p.form ? getForm(p.form) : undefined;
      if (!form) return null;
      return (
        <section id={id} className={`${styles.block} ${tone}`} aria-labelledby={title ? titleId : undefined}>
          <div className={`${styles.inner} ${styles.formGrid}`}>
            <div className={styles.copy}>
              {head}
              <div className={styles.prose} data-reveal>
                <Paragraphs text={L(p.body) || L(form.intro)} />
              </div>
            </div>
            <div className={styles.formCard}>
              <OpexForm form={form} t={t.forms} locale={locale} page={`/${locale}#${id}`} />
            </div>
          </div>
        </section>
      );
    }
  }
}
