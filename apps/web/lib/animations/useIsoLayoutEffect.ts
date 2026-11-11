import { useEffect, useLayoutEffect } from "react";

// Initial animation states must be applied before first paint on the client.
export const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
