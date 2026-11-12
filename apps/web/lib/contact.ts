import raw from "@/content/contact.json";
import { entry } from "@/lib/content";
import { getForm } from "@/lib/content/forms";
import { systemPublicForm } from "@arapoush/schema";
import type { PublicForm } from "@/lib/forms";

export * from "@/lib/contactText";
import type { Contact } from "@/lib/contactText";

/** Contact page content (OPEX `page.contact`, or content/contact.json without OPEX). */
export function getContactPage(): Contact {
  const fromOpex = entry<Record<string, unknown>>("page.contact");
  const content = structuredClone(fromOpex ?? raw) as Record<string, unknown>;
  delete content.images; // page images are read through getDictionary().media
  delete content.$comment;
  return content as unknown as Contact;
}

/**
 * A form the page shows: the version published in OPEX, else the built-in definition, so the page
 * always renders its forms. Without OPEX a submission answers "fallback" and the form says so.
 */
export const pageForm = (slug: string): PublicForm | undefined => getForm(slug) ?? (systemPublicForm(slug) as PublicForm | undefined);
