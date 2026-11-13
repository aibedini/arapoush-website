import { notFound } from "next/navigation";

/** Unknown paths inside a locale get the localized 404 (and a real 404 status). */
export default function CatchAll() {
  notFound();
}
