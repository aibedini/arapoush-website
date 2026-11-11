// SVGs exported from the Figma file (Iconly Pro set + custom glyphs).
// Chevrons carry the `chev` class so hover states can move them on their own.

type P = { className?: string; color?: string };

export function ArrowRightCircle({ className, color = "currentColor" }: P) {
  return (
    <svg data-flip="" className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3.657 16C3.076 14.789 2.75 13.433 2.75 12 2.75 6.892 6.892 2.75 12 2.75S21.25 6.892 21.25 12 17.108 21.25 12 21.25c-2.022 0-3.893-.649-5.415-1.75"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="chev"
        d="M10.558 15.471 14.044 12l-3.486-3.471"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PlayCircle({ className, color = "#031D2F" }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M11.112 3.124C4.955 3.269 2.88 5.557 2.88 11.996c0 6.66 2.22 8.88 8.88 8.88s8.88-2.22 8.88-8.88c0-5.801-1.685-8.234-6.523-8.765"
        stroke={color}
        strokeWidth="1.44"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="chev"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M15.04 11.858c0-.868-4.401-3.644-4.9-3.145-.498.5-.547 5.744 0 6.29.548.549 4.9-2.277 4.9-3.145Z"
        stroke={color}
        strokeWidth="1.44"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Search({ className }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3.082 10.837c0-4.262 3.455-7.717 7.717-7.717 4.261 0 7.716 3.455 7.716 7.717 0 4.263-3.455 7.718-7.716 7.718-2.797 0-5.246-1.487-6.6-3.713"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="square"
      />
      <path d="m18.129 18.582 2.31 2.298" stroke="currentColor" strokeWidth="0.96" strokeLinecap="square" />
    </svg>
  );
}

export function Globe({ className }: P) {
  const s = { stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        {...s}
        d="M21.25 12c0 2.32-.86 4.46-2.28 6.07a9.18 9.18 0 0 1-5.64 3.07c-.43.07-.87.1-1.33.1-.46 0-.89-.03-1.33-.1a9.18 9.18 0 0 1-5.64-3.07A9.18 9.18 0 0 1 2.75 12c0-2.32.86-4.46 2.28-6.07a9.18 9.18 0 0 1 5.64-3.07c.43-.07.87-.1 1.33-.1.46 0 .89.03 1.33.1a9.18 9.18 0 0 1 5.64 3.07A9.18 9.18 0 0 1 21.25 12Z"
      />
      <path {...s} d="M11.67 21.15C11.03 20.48 8 17.17 8 12s3.03-8.48 3.67-9.15" />
      <path {...s} d="M12.33 21.15c.64-.67 3.67-3.98 3.67-9.15s-3.03-8.48-3.67-9.15" />
      <path {...s} d="M2.75 12h18.5" />
    </svg>
  );
}

export function ChevronDown({ className }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        className="chev"
        d="M8.528 10.558s2.393 3.486 3.472 3.486c1.08 0 3.47-3.486 3.47-3.486"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronRightSoft({ className }: P) {
  return (
    <svg data-flip="" className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        className="chev"
        d="M10.558 15.471s3.486-2.392 3.486-3.472-3.486-3.47-3.486-3.47"
        stroke="currentColor"
        strokeOpacity="0.8"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Large / small circular arrow used on product + application cards. */
export function CircleArrow({ className, color = "#222222", weight = 3 }: P & { weight?: number }) {
  return (
    <svg data-flip="" className={className} viewBox="0 0 57 57" fill="none" aria-hidden="true">
      <path
        className="ring"
        d="M12.315 37A18.43 18.43 0 0 1 10.5 29c0-10.216 8.284-18.5 18.5-18.5S47.5 18.784 47.5 29 39.216 47.5 29 47.5c-4.044 0-7.786-1.298-10.83-3.5"
        stroke={color}
        strokeWidth={weight}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="chev"
        d="M26.115 35.942 33.087 29l-6.972-6.942"
        stroke={color}
        strokeWidth={weight}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronLeftBold({ className }: P) {
  return (
    <svg data-flip="" className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path className="chev" d="M27.5 31 20.5 24l7-7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronRightBold({ className }: P) {
  return (
    <svg data-flip="" className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path className="chev" d="m20.5 17 7 7-7 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowRight({ className, color = "#54677C" }: P) {
  return (
    <svg data-flip="" className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g className="chev">
        <path d="M18.384 12H4.56" stroke={color} strokeWidth="1.44" strokeLinecap="square" />
        <path d="m13.152 6.216 5.808 5.783-5.808 5.784" stroke={color} strokeWidth="1.44" strokeLinecap="square" />
      </g>
    </svg>
  );
}

export function ShieldCheck({ className }: P) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path
        fill="#3B5872"
        d="m50.82 14.18-18-8a2 2 0 0 0-1.64 0l-18 8A2 2 0 0 0 12 16v17.12A18.1 18.1 0 0 0 17.82 46l12.86 11.42a2 2 0 0 0 2.64 0L46.18 46A18.1 18.1 0 0 0 52 33.12V16a2 2 0 0 0-1.18-1.82ZM48 33.12a14 14 0 0 1-4.48 10L32 53.32l-11.52-10.24a14 14 0 0 1-4.48-10V17.3l16-7.12 16 7.12v15.82Z"
      />
      <path
        fill="#3B5872"
        d="M26 28.58a2.01 2.01 0 0 0-2.84 2.84l5 5a2 2 0 0 0 2.84 0l10-10a2.01 2.01 0 0 0-2.92-2.84l-8.66 8.6-3.42-3.6Z"
      />
    </svg>
  );
}

export function Leaf({ className }: P) {
  const s = { stroke: "#3B5872", strokeWidth: 5.333, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path {...s} d="M21.333 48c31.879 0 34.447-27.122 34.65-40.009.023-1.472-1.21-2.66-2.682-2.633C8 6.19 8 28.152 8 48v10.667" />
      <path {...s} d="M8 48s0-16 21.333-18.667" />
    </svg>
  );
}

export function Layers({ className }: P) {
  const s = { stroke: "#3B5872", strokeWidth: 4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg className={className} viewBox="0 0 88 76" fill="none" aria-hidden="true">
      <path
        {...s}
        d="m46.693 13.787 15.734 6.987c4.533 2 4.533 5.306 0 7.306l-15.734 6.987c-1.786.8-4.72.8-6.506 0l-15.734-6.987c-4.533-2-4.533-5.306 0-7.306l15.734-6.987c1.786-.8 4.72-.8 6.506 0Z"
      />
      <path {...s} d="M20 35.333c0 2.24 1.68 4.827 3.733 5.734l18.107 8.053a5.3 5.3 0 0 0 4.32 0l18.107-8.053C66.32 40.16 68 37.573 68 35.333" />
      <path {...s} d="M20 48.667c0 2.48 1.467 4.72 3.733 5.733l18.107 8.053a5.3 5.3 0 0 0 4.32 0L64.267 54.4C66.533 53.387 68 51.147 68 48.667" />
    </svg>
  );
}

export function Location({ className }: P) {
  const s = { stroke: "#B2C7DE", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path {...s} fillRule="evenodd" d="M14.5 10.5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z" />
      <path {...s} fillRule="evenodd" d="M12 21c-1.2 0-7.5-5.1-7.5-10.437C4.5 6.387 7.857 3 12 3s7.5 3.387 7.5 7.563C19.5 15.898 13.198 21 12 21Z" />
    </svg>
  );
}

export function Call({ className }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        fill="#B2C7DE"
        fillRule="evenodd"
        d="M4.36 5.06c0 0-.05.05-.11.115-.242.235-.743.724-.748 1.747-.008 1.43.933 4.088 5.464 8.618 4.51 4.508 7.163 5.46 8.597 5.46h.021c1.023-.005 1.511-.507 1.747-.748.072-.074.13-.128.17-.162.997-1.002 1.507-1.748 1.502-2.226-.007-.488-.614-1.065-1.453-1.863-.267-.254-.557-.53-.863-.836-.793-.791-1.186-.656-2.05-.352-1.195.419-2.835.989-5.383-1.56C8.701 10.703 9.272 9.065 9.69 7.87c.302-.864.44-1.258-.354-2.052-.311-.31-.59-.604-.847-.874C7.696 4.11 7.124 3.507 6.639 3.5h-.008c-.479 0-1.223.512-2.276 1.565l.005-.005ZM17.563 22.5c-2.492 0-5.741-1.984-9.658-5.9C3.973 12.67 1.986 9.411 2 6.914c.01-1.65.875-2.495 1.2-2.812.017-.021.075-.078.095-.098C4.729 2.569 5.696 1.989 6.658 2c1.117.015 1.912.851 2.918 1.91.249.262.519.547.82.847 1.46 1.46 1.044 2.651.71 3.607-.364 1.043-.679 1.943 1.207 3.829 1.888 1.886 2.788 1.571 3.827 1.204.957-.334 2.145-.752 3.607.708.296.296.577.563.836.81 1.064 1.011 1.904 1.81 1.918 2.93.012.955-.568 1.928-2 3.361l-.634-.43.536.524c-.317.325-1.161 1.191-2.812 1.2h-.028Z"
      />
    </svg>
  );
}

export function Mail({ className }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        fill="#B2C7DE"
        fillRule="evenodd"
        d="M16.659 2C19.989 2 22.5 4.717 22.5 8.32v6.868c0 1.844-.652 3.51-1.837 4.692-1.063 1.059-2.442 1.62-3.988 1.62H6.822c-1.543 0-2.921-.56-3.985-1.62C1.652 18.698 1 17.032 1 15.188V8.32C1 4.717 3.511 2 6.841 2h9.818Zm0 1.5H6.841C4.326 3.5 2.5 5.527 2.5 8.32v6.868c0 1.443.496 2.732 1.396 3.629.776.775 1.789 1.183 2.929 1.183h9.85c1.141 0 2.153-.408 2.929-1.183.901-.897 1.396-2.186 1.396-3.629V8.32c0-2.793-1.826-4.82-4.341-4.82Zm1.576 4.629a.75.75 0 0 1-.109 1.055l-4.444 3.612a3.072 3.072 0 0 1-3.799.006L5.398 9.186a.75.75 0 1 1 .941-1.168l4.481 3.612a1.57 1.57 0 0 0 1.923-.004l4.436-3.606a.75.75 0 0 1 1.056.109Z"
      />
    </svg>
  );
}

export function PaperDownload({ className }: P) {
  const s = { strokeWidth: 1.44, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        {...s}
        stroke="#B2C7DE"
        fillRule="evenodd"
        d="m19.594 8.448-5.444-5.184c-.7-.096-1.488-.144-2.352-.144-6.038 0-8.054 2.227-8.054 8.88 0 6.663 2.016 8.88 8.054 8.88 6.048 0 8.064-2.217 8.064-8.88 0-1.363-.086-2.544-.268-3.552Z"
      />
      <path {...s} stroke="#F5F4F4" opacity="0.4" d="M13.617 3.2v2.554a3.228 3.228 0 0 0 3.229 3.228h2.833" />
      <path {...s} stroke="#F5F4F4" opacity="0.4" d="M11.434 15.857v-5.8m2.25 3.539-2.25 2.26-2.252-2.26" />
    </svg>
  );
}

export function Instagram({ className }: P) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="#B2C7DE" aria-hidden="true">
      <path d="M33.45 12.6c-1.2 0-2.1.9-2.1 2.1s.9 2.1 2.1 2.1 2.1-.9 2.1-2.1-.9-2.1-2.1-2.1Z" />
      <path d="M24 15.3c-4.95 0-8.85 4.05-8.85 8.85S19.2 33 24 33s8.85-4.05 8.85-8.85S28.95 15.3 24 15.3Zm0 14.55c-3.15 0-5.7-2.55-5.7-5.7s2.55-5.7 5.7-5.7 5.7 2.55 5.7 5.7-2.55 5.7-5.7 5.7Z" />
      <path d="M31.2 6H16.95C10.8 6 6 10.8 6 16.8v14.25c0 6 4.8 10.8 10.8 10.8h14.25c6 0 10.8-4.8 10.8-10.8V16.8C42 10.8 37.2 6 31.2 6Zm7.35 25.2c0 4.05-3.3 7.5-7.5 7.5H16.8c-4.05 0-7.5-3.3-7.5-7.5V16.95c0-4.05 3.3-7.5 7.5-7.5h14.25c4.05 0 7.5 3.3 7.5 7.5V31.2Z" />
    </svg>
  );
}

export function LinkedIn({ className }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="#B2C7DE" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M24 24h-4.8v-8.399c0-2.304-1.016-3.59-2.839-3.59-1.984 0-3.161 1.34-3.161 3.59V24H8.4V8.4h4.8v1.754s1.506-2.642 4.9-2.642C21.494 7.512 24 9.583 24 13.87V24ZM2.93 5.905C1.312 5.905 0 4.583 0 2.952 0 1.322 1.312 0 2.93 0c1.618 0 2.93 1.322 2.93 2.952.001 1.631-1.312 2.953-2.93 2.953ZM0 24h6V8.4H0V24Z"
      />
    </svg>
  );
}

export function ArrowUp({ className }: P) {
  return (
    <svg className={className} viewBox="0 0 14 17" fill="none" aria-hidden="true">
      <g className="chev">
        <path d="M6.774.75v15" stroke="#F5F4F4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M.75 6.8 6.774.75l6.025 6.05" stroke="#F5F4F4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
