/**
 * Hover roll for link and button labels: the label slides up and a copy rolls in from below.
 * Same feel as animate-ui's SlidingText, but pure CSS (see `.roll` in globals.css), so it
 * renders on the server and costs nothing at hydration — it appears on almost every link.
 */
export default function RollText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={`roll${className ? ` ${className}` : ""}`}>
      <span className="roll-track">
        <span>{text}</span>
        <span aria-hidden="true">{text}</span>
      </span>
    </span>
  );
}
