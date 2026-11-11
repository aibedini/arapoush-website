import { entry, entriesWithPrefix } from "@/lib/content";
import type { PublicForm } from "@/lib/forms";

/** A published (or previewed) form; undefined when OPEX is off or the form is not published. */
export const getForm = (slug: string) => entry<PublicForm>(`form.${slug}`);
/** Forms with their own page (/{locale}/forms/{slug}). */
export const pageForms = () => entriesWithPrefix<PublicForm>("form.").map(([, f]) => f).filter((f) => f.page?.enabled);
