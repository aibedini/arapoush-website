import Image from "next/image";
import p from "@/components/printing/Printing.module.css";
import type { Img } from "@/lib/content/media";
import { mapLinks, t, telHref, type Contact, type Place } from "@/lib/contactText";
import { FaxIcon, PhoneIcon, PinIcon, SendIcon } from "./ContactIcons";
import s from "./Contact.module.css";

type Labels = Contact["locations"]["labels"];

/**
 * Head office and factory: a photo and a location map side by side, the address and lines, and
 * directions in Google Maps, Neshan and Balad. The map is a drawn plan (no third-party embed, no
 * cookies, nothing to load); the buttons open the real map apps.
 * `split` places the two sites side by side; `stacked` gives each the full width.
 */
export default function Locations({ c, locale, images }: { c: Contact["locations"]; locale: string; images: { id: string; image: Img }[] }) {
  return (
    <section id="locations" className={s.section} aria-labelledby="locations-title">
      <div className={p.inner}>
        <header className={s.head} data-reveal>
          <span className={p.kicker}>{t(c.kicker, locale)}</span>
          <h2 id="locations-title" className={p.h2}>
            {t(c.title, locale)}
          </h2>
          <p className={p.lead}>{t(c.lead, locale)}</p>
        </header>
        <div className={c.style === "stacked" ? s.placesStacked : s.places}>
          {c.places.map((place) => (
            <PlaceCard key={place.id} place={place} l={c.labels} locale={locale} image={images.find((i) => i.id === place.id)?.image} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PlaceCard({ place, l, locale, image }: { place: Place; l: Labels; locale: string; image?: Img }) {
  const links = mapLinks(place, locale);
  const name = t(place.name, locale);
  return (
    <article className={s.place} data-reveal aria-labelledby={`place-${place.id}`}>
      <div className={`${s.placeMedia} ${image ? "" : s.placeMediaMapOnly}`}>
        {image && (
          <div className={s.placePhoto}>
            <Image src={image.src} width={image.width} height={image.height} alt={name} sizes="(max-width: 700px) 50vw, 25vw" loading="lazy" data-no-mirror />
          </div>
        )}
        <a className={s.map} href={links[0]!.href} target="_blank" rel="noopener noreferrer" aria-label={`${t(l.map, locale)}: ${name} (${links[0]!.name})`}>
          <MapArt />
          <span className={s.mapPin} aria-hidden="true">
            <PinIcon />
          </span>
        </a>
      </div>
      <div className={s.placeBody}>
        <h3 id={`place-${place.id}`} className={s.h3}>
          <PinIcon className={s.h3Icon} />
          {name}
        </h3>
        <address className={s.address}>
          {t(place.address, locale)}
          {place.postalCode && (
            <span className={s.line}>
              {t(l.postalCode, locale)}: <span dir="ltr">{place.postalCode}</span>
            </span>
          )}
        </address>
        <dl className={s.facts}>
          {place.phones.length > 0 && (
            <div className={s.fact}>
              <dt>
                <PhoneIcon className={s.factIcon} />
                {t(l.phones, locale)}
              </dt>
              <dd className={s.chips}>
                {place.phones.map((n) => (
                  <a key={n} href={telHref(n)} className={s.chip} dir="ltr">
                    {n}
                  </a>
                ))}
              </dd>
            </div>
          )}
          {place.fax && (
            <div className={s.fact}>
              <dt>
                <FaxIcon className={s.factIcon} />
                {t(l.fax, locale)}
              </dt>
              <dd>
                <span dir="ltr" className={s.ltr}>
                  {place.fax}
                </span>
              </dd>
            </div>
          )}
          {place.telegram && (
            <div className={s.fact}>
              <dt>
                <SendIcon className={s.factIcon} />
                {t(l.telegram, locale)}
              </dt>
              <dd>
                <a href={`https://t.me/+98${place.telegram.replace(/\D/g, "").slice(1)}`} className={`u-link ${s.ltr}`} dir="ltr" target="_blank" rel="noopener noreferrer">
                  {place.telegram}
                </a>
              </dd>
            </div>
          )}
        </dl>
        <div className={s.mapLinks}>
          <span className={s.mapLinksLabel}>{t(l.openIn, locale)}</span>
          {links.map((m) => (
            <a key={m.id} href={m.href} className={s.mapBtn} data-app={m.id} target="_blank" rel="noopener noreferrer">
              <span className={s.mapDot} aria-hidden="true" />
              {m.name}
            </a>
          ))}
        </div>
      </div>
    </article>
  );
}

/** A quiet drawn street plan: blocks, a main road, a park and water. Decorative. */
function MapArt() {
  return (
    <svg className={s.mapArt} viewBox="0 0 320 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect width="320" height="220" fill="#eef3f8" />
      <path d="M-10 160 C 60 140, 110 190, 180 170 S 290 120, 340 140 L 340 230 L -10 230 Z" fill="#d6e6f2" />
      <rect x="208" y="22" width="78" height="54" rx="8" fill="#dcebdc" />
      <g fill="#ffffff" stroke="#dbe3ec" strokeWidth="1">
        <rect x="18" y="18" width="70" height="42" rx="5" />
        <rect x="100" y="18" width="92" height="42" rx="5" />
        <rect x="18" y="74" width="54" height="56" rx="5" />
        <rect x="84" y="74" width="108" height="56" rx="5" />
        <rect x="208" y="90" width="92" height="40" rx="5" />
      </g>
      <g stroke="#ffffff" strokeLinecap="round">
        <path d="M-10 66 H 340" strokeWidth="9" />
        <path d="M196 -10 V 240" strokeWidth="9" />
        <path d="M78 64 V 140" strokeWidth="5" />
      </g>
      <g stroke="#f4c98f" strokeLinecap="round" fill="none">
        <path d="M-10 142 C 80 136, 150 104, 200 66 S 300 20, 340 12" strokeWidth="6" />
      </g>
    </svg>
  );
}
