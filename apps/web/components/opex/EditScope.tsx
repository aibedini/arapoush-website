/**
 * Marks the content an entry renders, for the visual editor (P12). Outside edit mode it renders
 * nothing extra; in edit mode a `display: contents` wrapper leaves the layout untouched.
 */
export default function EditScope({ on, entry, label, section, base, children }: { on: boolean; entry: string; label: string; section?: string; base?: string; children: React.ReactNode }) {
  if (!on) return <>{children}</>;
  return (
    <div data-opex-entry={entry} data-opex-label={label} data-opex-section={section} data-opex-base={base} style={{ display: "contents" }}>
      {children}
    </div>
  );
}
