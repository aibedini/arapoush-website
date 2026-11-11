/**
 * OPEX visual editor (P12): edit mode is draft mode plus the `opex_edit` cookie set by
 * /api/opex/preview?edit=1. Cookies are read only once draft mode is on, so normal pages stay static.
 */
export async function editMode(): Promise<boolean> {
  try {
    const { draftMode, cookies } = await import("next/headers");
    if (!(await draftMode()).isEnabled) return false;
    return (await cookies()).get("opex_edit")?.value === "1";
  } catch {
    return false; // outside a request (static generation)
  }
}
