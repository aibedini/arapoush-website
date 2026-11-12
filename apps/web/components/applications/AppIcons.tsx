/** Line icons for the applications page (24px grid, currentColor stroke), same style as PrintIcons. */
type P = { className?: string };
const svg = (className: string | undefined, children: React.ReactNode) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const CosmeticsIcon = ({ className }: P) =>
  svg(
    className,
    <>
      <path d="M9 3h6v3H9zM8 6h8l1 3v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9l1-3Z" />
      <path d="M12 12.5c1.3 1.4 2 2.3 2 3.1a2 2 0 0 1-4 0c0-.8.7-1.7 2-3.1Z" />
    </>,
  );
export const HygieneIcon = ({ className }: P) =>
  svg(
    className,
    <>
      <path d="M10 2h4M12 2v3M8 5h6l1 2M9 9h6a1 1 0 0 1 1 1v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V10a1 1 0 0 1 1-1Z" />
      <path d="M10 14h4M10 17h4" />
    </>,
  );
export const PharmaIcon = ({ className }: P) =>
  svg(
    className,
    <>
      <rect x="3.5" y="8.5" width="17" height="7" rx="3.5" transform="rotate(-35 12 12)" />
      <path d="m9.6 8.6 4.8 6.8" />
    </>,
  );
export const FoodIcon = ({ className }: P) =>
  svg(
    className,
    <>
      <path d="M5 3v7a2 2 0 0 0 2 2v9M9 3v7a2 2 0 0 1-2 2M7 3v6" />
      <path d="M17 21V3c-2 1.3-3 4-3 7 0 1.7.9 3 3 3" />
    </>,
  );
export const IndustrialIcon = ({ className }: P) =>
  svg(
    className,
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
      <circle cx="12" cy="12" r="6.6" />
    </>,
  );
export const INDUSTRY_ICONS = { cosmetics: CosmeticsIcon, hygiene: HygieneIcon, pharma: PharmaIcon, food: FoodIcon, industrial: IndustrialIcon } as const;

export const CheckIcon = ({ className }: P) => svg(className, <path d="m5 12.5 4.2 4L19 7" />);
export const ArrowIcon = ({ className }: P) => svg(className, <path d="M5 12h14M13 6l6 6-6 6" />);
export const PlusIcon = ({ className }: P) => svg(className, <path d="M12 5v14M5 12h14" />);
export const CloseIcon = ({ className }: P) => svg(className, <path d="M6 6l12 12M18 6 6 18" />);
export const ChevronIcon = ({ className }: P) => svg(className, <path d="m9 6 6 6-6 6" />);
export const ShieldIcon = ({ className }: P) =>
  svg(
    className,
    <>
      <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>,
  );
