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

/** Larger tube illustrations for the "available variants" cards. */
export function VariantArt({ shape, className }: P & { shape: "circular" | "oval" | "eyeNozzle" }) {
  const id = `v-${shape}`;
  // Half-height of the body as seen from the side: an oval tube is flatter in one axis.
  const hh = shape === "oval" ? 14 : 22;
  return (
    <svg className={className} viewBox="0 0 160 110" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".55" stopColor="#e9edf2" />
          <stop offset="1" stopColor="#c9d1db" />
        </linearGradient>
        <radialGradient id={`${id}-in`} cx=".45" cy=".4" r=".7">
          <stop offset="0" stopColor="#b9c3cf" />
          <stop offset="1" stopColor="#eef1f5" />
        </radialGradient>
      </defs>
      <g transform="rotate(-18 80 55)">
        <path d={`M40 ${55 - hh} H128 a8 ${hh} 0 0 1 0 ${hh * 2} H40 Z`} fill={`url(#${id}-body)`} stroke="#c5cdd8" strokeWidth=".8" />
        {shape === "eyeNozzle" ? (
          <>
            <ellipse cx="40" cy="55" rx="9" ry={hh} fill="#dfe5ec" stroke="#c5cdd8" strokeWidth=".8" />
            <path d="M40 46 L18 51 V59 L40 64 Z" fill="#eef1f5" stroke="#c5cdd8" strokeWidth=".8" />
            <ellipse cx="18" cy="55" rx="2.2" ry="4" fill="#b9c3cf" />
          </>
        ) : (
          <>
            <ellipse cx="40" cy="55" rx={shape === "oval" ? 14 : 9} ry={hh} fill="#dfe5ec" stroke="#c5cdd8" strokeWidth=".8" />
            <ellipse cx="40" cy="55" rx={shape === "oval" ? 11 : 6.5} ry={hh - 3.5} fill={`url(#${id}-in)`} />
          </>
        )}
      </g>
    </svg>
  );
}

const capStroke = { stroke: "#b8c1cc", strokeWidth: 0.8 };

/** Closure silhouettes (flip-top, screw, nozzle, stand-up). */
export function ClosureArt({ index, className }: P & { index: number }) {
  return (
    <svg className={className} viewBox="0 0 80 80" aria-hidden="true">
      <defs>
        <linearGradient id={`cap-${index}`} x1="0" x2="1">
          <stop offset="0" stopColor="#d9dfe6" />
          <stop offset=".45" stopColor="#ffffff" />
          <stop offset="1" stopColor="#cfd6de" />
        </linearGradient>
      </defs>
      {index === 0 && (
        <>
          <rect x="18" y="40" width="44" height="24" rx="5" fill={`url(#cap-${index})`} {...capStroke} />
          <path d="M18 42c0-10 8-22 22-24 8-1 14 3 16 8l-28 16Z" fill={`url(#cap-${index})`} {...capStroke} />
          <ellipse cx="40" cy="40" rx="22" ry="4" fill="#eef1f5" {...capStroke} />
        </>
      )}
      {index === 1 && (
        <>
          <rect x="18" y="24" width="44" height="40" rx="5" fill={`url(#cap-${index})`} {...capStroke} />
          {Array.from({ length: 9 }, (_, i) => (
            <line key={i} x1={23 + i * 4.3} y1="28" x2={23 + i * 4.3} y2="60" stroke="#c7cfd9" strokeWidth=".9" />
          ))}
          <ellipse cx="40" cy="24" rx="22" ry="4" fill="#f4f6f8" {...capStroke} />
        </>
      )}
      {index === 2 && (
        <>
          <rect x="22" y="50" width="36" height="16" rx="4" fill={`url(#cap-${index})`} {...capStroke} />
          <path d="M28 50 L37 16 h6 L52 50 Z" fill={`url(#cap-${index})`} {...capStroke} />
          <ellipse cx="40" cy="16" rx="3" ry="1.2" fill="#c7cfd9" />
        </>
      )}
      {index === 3 && (
        <>
          <path d="M20 66 V40 a20 12 0 0 1 40 0 V66 Z" fill={`url(#cap-${index})`} {...capStroke} />
          <rect x="29" y="18" width="22" height="18" rx="4" fill={`url(#cap-${index})`} {...capStroke} />
          <ellipse cx="40" cy="66" rx="20" ry="3.5" fill="#e7ebf0" {...capStroke} />
        </>
      )}
    </svg>
  );
}
