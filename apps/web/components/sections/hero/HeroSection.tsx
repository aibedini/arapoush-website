import type { SectionProps } from "@/lib/sections";
import Hero from "../Hero";
import styles from "../Hero.module.css";
import { sliderCss } from "./sliderCss";

/** The hero slider. Its per-slide CSS is generated here on the server, so the CSS builder never ships to the browser. */
export default function HeroSection(props: SectionProps) {
  const { slides } = props.t.media.slider;
  if (!slides.length) return null;
  return <Hero {...props} css={sliderCss(slides, props.t.media.fonts, styles.hero!)} />;
}
