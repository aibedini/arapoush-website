import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CustomEase } from "gsap/CustomEase";

let registered = false;

export function registerGsap() {
  if (registered || typeof window === "undefined") return;
  gsap.registerPlugin(ScrollTrigger, CustomEase);
  // One family of curves: a long, soft editorial settle and a firmer UI ease.
  CustomEase.create("ara.settle", "M0,0 C0.16,0.84 0.3,1 1,1");
  CustomEase.create("ara.inOut", "M0,0 C0.7,0 0.2,1 1,1");
  gsap.defaults({ ease: "power3.out" });
  // Dev-only handle for inspecting timelines from the console.
  if (process.env.NODE_ENV !== "production") (window as unknown as { gsap: typeof gsap }).gsap = gsap;
  registered = true;
}

export const ease = {
  settle: "ara.settle", // hero zoom-out, large reveals
  out: "power3.out", // section entrances, text masks
  inOut: "ara.inOut", // loader wipe, carousels
  ui: "power2.out", // hover / micro feedback
} as const;

// Seconds. Mirrors the timing table in the brief.
export const dur = {
  hover: 0.24,
  icon: 0.3,
  card: 0.45,
  section: 0.8,
  mask: 0.95,
  heroZoom: 1.8,
  page: 0.6,
} as const;

export function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export { gsap, ScrollTrigger };
