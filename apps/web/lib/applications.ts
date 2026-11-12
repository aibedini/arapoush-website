import raw from "@/content/applications.json";
import type { Applications } from "@/lib/applicationsText";
import { entry } from "@/lib/content";

export * from "@/lib/applicationsText";

/** Applications page content (OPEX `page.applications`, or content/applications.json without OPEX). */
export function getApplications(): Applications {
  const content = structuredClone(entry<Record<string, unknown>>("page.applications") ?? raw) as Record<string, unknown>;
  delete content.$comment;
  return content as unknown as Applications;
}
