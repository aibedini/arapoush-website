"use client";

import { Click } from "@animate-ui/react/primitives/effects/click";

/** animate-ui's click ring at the touch point: visible feedback where there is no hover. */
export default function TapRipple() {
  return <Click variant="ring" color="rgba(110, 156, 205, 0.55)" size={72} duration={450} />;
}
