"use client";

import { ScrollProgress, ScrollProgressProvider } from "@animate-ui/react/primitives/scroll-progress";

/** animate-ui scroll progress: a hairline under the header that tracks the page. */
export default function ScrollProgressBar({ label }: { label: string }) {
  return (
    <ScrollProgressProvider global>
      <ScrollProgress
        mode="scaleX"
        aria-hidden="true"
        title={label}
        style={{
          position: "absolute",
          insetInline: 0,
          bottom: 0,
          height: 2,
          background: "linear-gradient(90deg, #0e2b46, #92b6dd)",
          transformOrigin: "var(--progress-origin, left) center",
        }}
      />
    </ScrollProgressProvider>
  );
}
