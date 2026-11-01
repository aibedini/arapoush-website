import Image from "next/image";
import RollText from "@/components/ui/RollText";
import { contact, links, productPaths, social } from "@/lib/site";
import type { Dictionary } from "@/lib/i18n";
import MaybeLink from "@/components/ui/MaybeLink";
import { Call, Instagram, LinkedIn, Location, Mail, PaperDownload } from "@/components/ui/icons";
import BackToTop from "./BackToTop";
import styles from "./Footer.module.css";

const exploreHrefs = ["#applications", "/about", "#insights", "#certifications"];

export default function Footer({ t, locale }: { t: Dictionary; locale: string }) {
  const home = `/${locale}`;
  // Absolute links so the footer is identical (and correct) on every page.
  const productHrefs = [`${home}${productPaths.tube}`, `${home}#products`];
  const f = t.footer;

  return (
    <footer className={styles.footer}>
      <div className={styles.brand} data-reveal>
        <Image src="/images/logo-white.png" alt={t.common.brand} width={266} height={96} className={styles.logo} sizes="200px" data-no-mirror style={{ height: "auto" }} />
        <p className={styles.tagline}>
          {f.tagline[0]}
          <br />
          {f.tagline[1]}
        </p>
        <div className={styles.social}>
          <MaybeLink href={social.instagram} className={styles.ig} aria-label="Instagram" target="_blank" rel="noopener noreferrer">
            <Instagram />
          </MaybeLink>
          <MaybeLink href={social.linkedin} className={styles.li} aria-label="LinkedIn" target="_blank" rel="noopener noreferrer">
            <LinkedIn />
          </MaybeLink>
        </div>
      </div>

      <nav className={styles.col} aria-labelledby="f-products" data-reveal>
        <h2 id="f-products" className={styles.heading}>
          {f.products}
        </h2>
        <ul>
          {f.productLinks.map((label, i) => (
            <li key={label}>
              <a href={productHrefs[i] ?? `${home}#products`}>
                <RollText text={label} />
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <nav className={styles.col} aria-labelledby="f-explore" data-reveal>
        <h2 id="f-explore" className={styles.heading}>
          {f.explore}
        </h2>
        <ul>
          {f.exploreLinks.map((label, i) => (
            <li key={label}>
              <a href={(exploreHrefs[i] ?? "").startsWith("#") ? `${home}${exploreHrefs[i]}` : (exploreHrefs[i] ?? home)}>
                <RollText text={label} />
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className={`${styles.col} ${styles.colContact}`} data-reveal>
        <h2 className={styles.heading}>{f.contact}</h2>
        <address className={styles.contact}>
          <div className={styles.row}>
            <Location className={styles.ico} />
            <p>
              <strong>{f.office}</strong>
              {f.address[0]}
              <br />
              {f.address[1]}
            </p>
          </div>
          <a className={styles.row} href={contact.phoneHref}>
            <Call className={styles.ico} />
            <span className="u-link ltr">{contact.phone}</span>
          </a>
          <a className={styles.row} href={`mailto:${contact.email}`}>
            <Mail className={styles.ico} />
            <span className="u-link ltr">{contact.email}</span>
          </a>
          <MaybeLink href={links.brochure} className={`${styles.row} ${styles.brochure}`} download="arapoush-catalog.pdf" type="application/pdf">
            <PaperDownload className={styles.ico} />
            <span>{f.brochure}</span>
          </MaybeLink>
        </address>
      </div>

      <div className={styles.bottom}>
        <p className={styles.copy}>
          © {new Date().getFullYear()} <span className={styles.upper}>{f.company}</span> {f.rights}
        </p>
        <BackToTop label={f.backToTop} className={styles.top} iconClassName={styles.topIcon} />
      </div>
    </footer>
  );
}
