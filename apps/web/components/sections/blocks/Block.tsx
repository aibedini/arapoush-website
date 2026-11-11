import Image from "next/image";
import { pickL, type BlockKind, type BlockProps } from "@arapoush/schema";
import type { Dictionary, Locale } from "@/lib/i18n";
import { getForm } from "@/lib/content/forms";
import OpexForm from "@/components/forms/OpexForm";
import RollText from "@/components/ui/RollText";
import MaybeLink from "@/components/ui/MaybeLink";
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
