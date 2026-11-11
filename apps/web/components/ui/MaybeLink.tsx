import type { AnchorHTMLAttributes, ReactNode } from "react";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string | null; children: ReactNode };

/** Renders an anchor when a destination exists, otherwise a plain element with the same styling. */
export default function MaybeLink({ href, children, ...rest }: Props) {
  if (href) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  }
  const { className, style } = rest;
  return (
    <span className={className} style={style}>
      {children}
    </span>
  );
}
