import next from "@arapoush/config/eslint/next";

// Previews are private, cookie-authenticated files the image optimiser cannot fetch: plain <img>.
const config = [...next, { rules: { "@next/next/no-img-element": "off" } }];

export default config;
