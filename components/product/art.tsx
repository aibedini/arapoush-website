// Line icons and schematic illustrations for the product page. They are drawings, not photos:
// swap them for product photography when the client supplies it.

type P = { className?: string };
const line = { stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };

export function Recycle({ className }: P) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <path {...line} d="M12.6 6.4 14.9 2.7a1.3 1.3 0 0 1 2.2 0l3.7 6.1M18 9.3l2.8-.5.6-2.9" />
      <path {...line} d="m25.4 14.6 3.4 5.8a1.3 1.3 0 0 1-1.1 2H21m2.3-2.3L21 22.4l2.3 2.1" />
      <path {...line} d="M10.6 22.4H4.3a1.3 1.3 0 0 1-1.1-2l3.2-5.4m.2 3.3-.2-3.3-3.1-.7" />
    </svg>
  );
}

export function Flask({ className }: P) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <path {...line} d="M12.5 4h7M13.5 4v8.2L6.4 24.6A2.3 2.3 0 0 0 8.4 28h15.2a2.3 2.3 0 0 0 2-3.4l-7.1-12.4V4" />
      <path {...line} d="M9.6 19.5c2.6-1.2 4.6 1.2 7.2 0s4.6-1.2 5.8-.3" />
    </svg>
  );
}

export function CalcIcon({ className }: P) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <rect {...line} x="7" y="4" width="18" height="24" rx="3.5" />
      <rect {...line} x="10.5" y="7.5" width="11" height="5" rx="1.2" />
      <path {...line} strokeWidth={2.2} d="M11.5 17h.01M16 17h.01M20.5 17h.01M11.5 21.5h.01M16 21.5h.01M20.5 21.5h.01" />
    </svg>
  );
}

/** Small cross-section glyphs for the shape selector. */
export function ShapeGlyph({ shape, className }: P & { shape: "circular" | "oval" | "eyeNozzle" }) {
  return (
    <svg className={className} viewBox="0 0 48 32" aria-hidden="true">
      {shape === "circular" && <circle {...line} cx="24" cy="16" r="11" />}
      {shape === "oval" && <ellipse {...line} cx="24" cy="16" rx="16" ry="8.5" />}
      {shape === "eyeNozzle" && (
        <>
          <path {...line} d="M6 13.5h22l6 1.6v1.8l-6 1.6H6a2.5 2.5 0 0 1 0-5Z" />
          <path {...line} d="M34 15.1h6.5l2 .9-2 .9H34" />
        </>
      )}
    </svg>
  );
}
