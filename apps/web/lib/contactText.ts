/** Contact page types and helpers, safe for client components (no file system, no content store). */
import type raw from "@/content/contact.json";

export type L = Record<string, string>;
export const t = (text: L | null | undefined, locale: string) => (text ? (text[locale] ?? text.en ?? "") : "");

export type HeroStyle = "split" | "banner";
export type DirectoryStyle = "tabs" | "grid";
export type LocationsStyle = "split" | "stacked";
export type DeptIcon = "cart" | "palette" | "flask" | "shield" | "briefcase" | "chat" | "truck" | "user";

export type Person = { name: L; role: L; exts: string[]; mobiles?: string[] };
export type Department = { id: string; icon: DeptIcon; name: L; summary: L; phones: string[]; email: string; hours: L[]; people: Person[] };
export type Place = {
  id: string;
  name: L;
  address: L;
  query: string;
  postalCode: string;
  phones: string[];
  fax: string;
  telegram: string;
  geo: { lat: number | null; lng: number | null };
  maps: { google: string | null; neshan: string | null; balad: string | null };
};

type Raw = typeof raw;
export type Contact = Omit<Raw, "$comment" | "hero" | "directory" | "locations"> & {
  hero: Omit<Raw["hero"], "style"> & { style: HeroStyle };
  directory: Omit<Raw["directory"], "style" | "departments"> & { style: DirectoryStyle; departments: Department[] };
  locations: Omit<Raw["locations"], "style" | "places"> & { style: LocationsStyle; places: Place[] };
};

/**
 * `tel:` link for an Iranian number as written on the page ("021-26420120", "0912-775-0625").
 * A range such as "028-32848035-9" dials its first number.
 */
export function telHref(display: string) {
  const parts = display.split("-").map((p) => p.replace(/\D/g, ""));
  if (parts.length > 2 && parts.at(-1)!.length <= 2 && parts.at(-2)!.length >= 6) parts.pop();
  const digits = parts.join("");
  return `tel:${digits.startsWith("0") ? `+98${digits.slice(1)}` : digits}`;
}

export type MapLink = { id: "google" | "neshan" | "balad"; name: string; href: string };

/**
 * Directions in Google Maps, Neshan and Balad. A pasted link wins; otherwise coordinates build all
 * three. Without either, Google Maps searches the address and the Iranian apps are not offered.
 */
export function mapLinks(p: Place, locale: string): MapLink[] {
  const fa = locale === "fa";
  const { lat, lng } = p.geo;
  const at = typeof lat === "number" && typeof lng === "number";
  const links: (MapLink | null)[] = [
    { id: "google", name: fa ? "گوگل‌مپ" : "Google Maps", href: p.maps.google ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(at ? `${lat},${lng}` : p.query)}` },
    p.maps.neshan || at ? { id: "neshan", name: fa ? "نشان" : "Neshan", href: p.maps.neshan ?? `https://neshan.org/maps/@${lat},${lng},16z,0p` } : null,
    p.maps.balad || at ? { id: "balad", name: fa ? "بلد" : "Balad", href: p.maps.balad ?? `https://balad.ir/location?latitude=${lat}&longitude=${lng}&zoom=16` } : null,
  ];
  return links.filter((l): l is MapLink => !!l);
}
