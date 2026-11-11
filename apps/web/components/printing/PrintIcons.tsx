/** Line icons for the printing page (24px grid, currentColor stroke, decorative). */

type P = { className?: string };

const Svg = ({ className, children }: P & { children: React.ReactNode }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const LayersIcon = ({ className }: P) => (
  <Svg className={className}>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12.5 9 5 9-5" />
    <path d="m3 16.5 9 5 9-5" />
  </Svg>
);
export const PaletteIcon = ({ className }: P) => (
  <Svg className={className}>
    <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.5-1.2-.3-.4-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5C21 6.5 17 3 12 3Z" />
    <circle cx="7.5" cy="11" r="1.1" />
    <circle cx="10" cy="7" r="1.1" />
    <circle cx="15" cy="7" r="1.1" />
  </Svg>
);
/** A tube's shoulder: the neck stepping out to the body. */
export const ShoulderIcon = ({ className }: P) => (
  <Svg className={className}>
    <path d="M9.5 3h5v3l4 3v12h-13V9l4-3V3Z" />
    <path d="M5.5 9h13" />
  </Svg>
);
export const FileIcon = ({ className }: P) => (
  <Svg className={className}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3v5h5" />
    <path d="m9 14 2 2 4-4" />
  </Svg>
);
export const ArrowIcon = ({ className }: P) => (
  <Svg className={className}>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </Svg>
);
export const ChevronIcon = ({ className }: P) => (
  <Svg className={className}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);
export const DownloadIcon = ({ className }: P) => (
  <Svg className={className}>
    <path d="M12 4v11" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 20h14" />
  </Svg>
);
export const EyeIcon = ({ className }: P) => (
  <Svg className={className}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);
export const MailIcon = ({ className }: P) => (
  <Svg className={className}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </Svg>
);
export const PhoneIcon = ({ className }: P) => (
  <Svg className={className}>
    <path d="M6.5 3.5h3l1.5 4-2 1.2a11 11 0 0 0 6.3 6.3l1.2-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2Z" />
  </Svg>
);
export const ZoomInIcon = ({ className }: P) => (
  <Svg className={className}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4" />
    <path d="M11 8v6M8 11h6" />
  </Svg>
);
export const ZoomOutIcon = ({ className }: P) => (
  <Svg className={className}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4" />
    <path d="M8 11h6" />
  </Svg>
);
export const CloseIcon = ({ className }: P) => (
  <Svg className={className}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
export const CheckIcon = ({ className }: P) => (
  <Svg className={className}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);
export const AskIcon = ({ className }: P) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.8" />
    <path d="M12 17h.01" />
  </Svg>
);
export const CrossIcon = ({ className }: P) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="m9 9 6 6M15 9l-6 6" />
  </Svg>
);
