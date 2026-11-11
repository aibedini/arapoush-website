/** Soft colour glow at a Figma coordinate (499px ellipse + 300px layer blur in the file). */
export default function Glow({ x, y, color, opacity = 1 }: { x: number; y: number; color: string; opacity?: number }) {
  return (
    <span
      className="glow"
      aria-hidden="true"
      style={{ insetInlineStart: `calc(${x} * var(--u))`, top: `calc(${y} * var(--u))`, "--c": color, "--o": opacity } as React.CSSProperties}
    />
  );
}
