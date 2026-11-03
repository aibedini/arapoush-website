/** Line icons for the cap-system section (24px grid, currentColor stroke, decorative). */

type P = { className?: string };

const Svg = ({ className, children }: P & { children: React.ReactNode }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

/** A closed cap: a flat disc. */
export const CapIcon = ({ className }: P) => (
  <Svg className={className}>
    <ellipse cx="12" cy="8" rx="8" ry="3" />
    <path d="M4 8v6c0 1.66 3.58 3 8 3s8-1.34 8-3V8" />
  </Svg>
);

/** Stacked rings: the spiral / retaining structure. */
export const CoilIcon = ({ className }: P) => (
  <Svg className={className}>
    <ellipse cx="12" cy="6" rx="8" ry="2.6" />
    <path d="M4 6v3c0 1.44 3.58 2.6 8 2.6S20 10.44 20 9V6" />
    <path d="M4 12v3c0 1.44 3.58 2.6 8 2.6s8-1.16 8-2.6v-3" />
    <path d="M4 15v3c0 1.44 3.58 2.6 8 2.6s8-1.16 8-2.6v-3" />
  </Svg>
);

/** A drop struck through: moisture kept out. */
export const DryIcon = ({ className }: P) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 6.5s-3.5 4-3.5 6.5a3.5 3.5 0 0 0 7 0c0-2.5-3.5-6.5-3.5-6.5Z" />
    <path d="M6 18 18 6" />
  </Svg>
);

/** The tube's open mouth: a stack of rims. */
export const MouthIcon = ({ className }: P) => (
  <Svg className={className}>
    <ellipse cx="12" cy="7" rx="8" ry="2.8" />
    <path d="M4 7v10c0 1.55 3.58 2.8 8 2.8s8-1.25 8-2.8V7" />
    <path d="M4 11c0 1.55 3.58 2.8 8 2.8s8-1.25 8-2.8" />
  </Svg>
);

export const ShieldIcon = ({ className }: P) => (
  <Svg className={className}>
    <path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.1 7.5 9.5 4.4-1.4 7.5-5.1 7.5-9.5V6L12 3Z" />
    <path d="m8.8 12.2 2.2 2.2 4.3-4.6" />
  </Svg>
);

export const AirIcon = ({ className }: P) => (
  <Svg className={className}>
    <path d="M3 9h11a3 3 0 1 0-3-3" />
    <path d="M3 13h15a3 3 0 1 1-3 3" />
    <path d="M3 17h7" />
  </Svg>
);

export const ClockIcon = ({ className }: P) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </Svg>
);

/** A tablet with bubbles rising off it. */
export const FizzIcon = ({ className }: P) => (
  <Svg className={className}>
    <ellipse cx="11" cy="17.5" rx="6.5" ry="3" />
    <path d="M4.5 17.5v1.2c0 1.66 2.91 3 6.5 3s6.5-1.34 6.5-3v-1.2" />
    <circle cx="13" cy="10" r="1.2" />
    <circle cx="9.5" cy="6.5" r="0.9" />
    <circle cx="15.5" cy="5" r="0.8" />
    <circle cx="16.5" cy="9.5" r="0.7" />
    <circle cx="12" cy="3" r="0.6" />
  </Svg>
);

/** A wrapped chocolate or gum block. */
export const ChocolateIcon = ({ className }: P) => (
  <Svg className={className}>
    <path d="M3 13.5 12 8l9 5.5-9 5.5-9-5.5Z" />
    <path d="M3 13.5V16l9 5.5 9-5.5v-2.5" />
    <path d="M7.5 10.8 16.5 16" />
  </Svg>
);

/** A print roll feeding an image. */
export const PrintIcon = ({ className }: P) => (
  <Svg className={className}>
    <path d="M7 4h11a2 2 0 0 1 2 2v12H9" />
    <ellipse cx="6" cy="6" rx="2.5" ry="2" />
    <path d="M3.5 6v12c0 1.1 1.12 2 2.5 2h3V8" />
    <path d="m11 16 2.5-3 2 2 1.5-1.5 2 2.5" />
    <circle cx="16" cy="9" r="1.2" />
  </Svg>
);

export const LayersIcon = ({ className }: P) => (
  <Svg className={className}>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 13 9 5 9-5" />
  </Svg>
);
