// Contact page glyphs, drawn in the site's Iconly style (24px grid, 1.5 stroke, round caps) so
// they sit with components/ui/icons.tsx. Decorative: every icon is aria-hidden next to visible text.
import type { DeptIcon } from "@/lib/contactText";

type P = { className?: string };
const S = ({ className, children }: P & { children: React.ReactNode }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const PhoneIcon = (p: P) => (
  <S {...p}>
    <path d="M5.4 3.6h2.7l1.5 4-2 1.3a10.6 10.6 0 0 0 5.6 5.6l1.3-2 4 1.5v2.7c0 1.2-1 2.1-2.2 2A16.5 16.5 0 0 1 3.4 5.8c-.1-1.2.8-2.2 2-2.2Z" />
  </S>
);
export const MobileIcon = (p: P) => (
  <S {...p}>
    <rect x="6.5" y="2.75" width="11" height="18.5" rx="2.5" />
    <path d="M10.5 18h3" />
  </S>
);
export const HashIcon = (p: P) => (
  <S {...p}>
    <path d="M9.5 4 8 20M16 4l-1.5 16M4.5 9h15M4 15h15" />
  </S>
);
export const MailIcon = (p: P) => (
  <S {...p}>
    <rect x="2.75" y="4.75" width="18.5" height="14.5" rx="3" />
    <path d="m6.5 9 5.5 4 5.5-4" />
  </S>
);
export const ClockIcon = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9.25" />
    <path d="M12 7.5V12l3 2" />
  </S>
);
export const PinIcon = (p: P) => (
  <S {...p}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.4" />
  </S>
);
export const FaxIcon = (p: P) => (
  <S {...p}>
    <path d="M7 8V3.75h7.5L17 6.2V8" />
    <rect x="3.75" y="8" width="16.5" height="9.5" rx="2.5" />
    <path d="M7 14.5h10V20.25H7z" />
  </S>
);
export const SendIcon = (p: P) => (
  <S {...p}>
    <path d="M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4 17-6.5Z" />
  </S>
);
export const UserIcon = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="7.75" r="4" />
    <path d="M4.75 20.25c.8-3.6 3.7-5.5 7.25-5.5s6.45 1.9 7.25 5.5" />
  </S>
);
export const ArrowIcon = ({ className }: P) => (
  <svg data-flip="" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4.5 12h15M13.5 6l6 6-6 6" />
  </svg>
);
export const PlusIcon = (p: P) => (
  <S {...p}>
    <path d="M12 5v14M5 12h14" />
  </S>
);

const dept: Record<DeptIcon, React.ReactNode> = {
  cart: (
    <>
      <path d="M2.75 3.75h2.1l2.3 11h10.6l2.1-7.5H6.1" />
      <circle cx="9" cy="19.25" r="1.25" />
      <circle cx="16.5" cy="19.25" r="1.25" />
    </>
  ),
  palette: (
    <>
      <path d="M12 2.75a9.25 9.25 0 0 0 0 18.5c1.4 0 1.9-1 1.4-2.1-.6-1.3.3-2.7 1.8-2.7h2c2.3 0 4-1.7 4-4.1 0-5.2-4.2-9.6-9.2-9.6Z" />
      <circle cx="7.5" cy="11" r="1" />
      <circle cx="10.5" cy="7" r="1" />
      <circle cx="15" cy="7.5" r="1" />
    </>
  ),
  flask: (
    <>
      <path d="M9.5 3.25h5M10.25 3.25v5.6l-5 8.9a2.3 2.3 0 0 0 2 3.5h9.5a2.3 2.3 0 0 0 2-3.5l-5-8.9v-5.6" />
      <path d="M7.4 14.5h9.2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 2.75 4.75 5.5v5.7c0 4.6 3 8.3 7.25 10 4.25-1.7 7.25-5.4 7.25-10V5.5L12 2.75Z" />
      <path d="m8.8 12 2.2 2.2 4.2-4.4" />
    </>
  ),
  briefcase: (
    <>
      <rect x="2.75" y="7" width="18.5" height="13" rx="2.5" />
      <path d="M8.5 7V5.25c0-1.1.9-2 2-2h3c1.1 0 2 .9 2 2V7M2.75 12.5h18.5" />
    </>
  ),
  chat: (
    <>
      <path d="M20.25 11.6c0 4.4-3.7 7.65-8.25 7.65-1.2 0-2.3-.2-3.3-.6l-4.95 1.6 1.4-4.1a7.3 7.3 0 0 1-1.4-4.55C3.75 7.2 7.45 3.75 12 3.75s8.25 3.45 8.25 7.85Z" />
      <path d="M8.5 11.75h.01M12 11.75h.01M15.5 11.75h.01" />
    </>
  ),
  truck: (
    <>
      <path d="M2.75 5.75h11v10.5h-11zM13.75 9.25h4l3.5 3.5v3.5h-7.5" />
      <circle cx="6.75" cy="17.75" r="1.75" />
      <circle cx="17.25" cy="17.75" r="1.75" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="7.75" r="4" />
      <path d="M4.75 20.25c.8-3.6 3.7-5.5 7.25-5.5s6.45 1.9 7.25 5.5" />
    </>
  ),
};

export const DeptGlyph = ({ icon, className }: P & { icon: DeptIcon }) => <S className={className}>{dept[icon] ?? dept.user}</S>;
