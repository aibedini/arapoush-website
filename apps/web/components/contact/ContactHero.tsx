import Image from "next/image";
import RollText from "@/components/ui/RollText";
import p from "@/components/printing/Printing.module.css";
import type { Img } from "@/lib/content/media";
import { t, telHref, type Contact } from "@/lib/contactText";
import { ArrowIcon, PhoneIcon } from "./ContactIcons";
import s from "./Contact.module.css";

/**
 * Contact hero: the Arapoush building with the page title and two actions.
 * `split` puts the photo in a rounded panel beside the copy; `banner` runs it full-bleed behind it.
 */
export default function ContactHero({ c, locale, image }: { c: Contact["hero"]; locale: string; image: Img }) {
  const banner = c.style === "banner";
  return (
    <section className={`${s.hero} ${banner ? s.heroBanner : s.heroSplit}`} aria-labelledby="contact-title">
      <div className={`${p.inner} ${s.heroGrid}`}>
        <div className={s.heroCopy}>
          <span className={p.kicker}>{t(c.kicker, locale)}</span>
          <h1 id="contact-title" className={s.h1}>
            {t(c.title, locale)}
          </h1>
          <p className={s.heroLead}>{t(c.lead, locale)}</p>
          <div className={s.actions}>
            <a href="#contact" className="btn">
              <RollText text={t(c.primary, locale)} />
              <ArrowIcon className={p.arrow} />
            </a>
            <a href={telHref(c.phone)} className={`btn ${p.ghost}`}>
              <PhoneIcon className={p.arrow} />
              <RollText text={t(c.secondary, locale)} />
            </a>
          </div>
        </div>
        <div className={s.heroMedia}>
          <Image
            src={image.src}
            width={image.width}
            height={image.height}
            alt={t(c.imageAlt, locale)}
            priority
            fetchPriority="high"
            sizes={banner ? "100vw" : "(max-width: 900px) 100vw, 55vw"}
            data-no-mirror
          />
        </div>
      </div>
    </section>
  );
}
