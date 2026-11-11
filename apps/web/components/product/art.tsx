// Line icons for the product page.

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

