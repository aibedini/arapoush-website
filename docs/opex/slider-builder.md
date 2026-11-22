# Slider builder and site fonts

The home hero is a layered slider edited in the console at **/slider**. Fonts are managed at
**/fonts**. Both are stored in normal content entries, so draft, preview, publish, history and
rollback work as for any other entry.

## Where the data lives

| Entry | Field | Schema |
|---|---|---|
| `page.home.hero` | `slider` | `SLIDER_FIELD` in `packages/schema/src/slider.ts` |
| `global.site` | `fonts` | `FONTS_FIELD` in `packages/schema/src/fonts.ts` |

Lists use a `key` field, not `id`, because every `*/id` path is locked for non-super-admins.

When `slider.slides` is empty, `sliderOf()` builds the slider from the legacy `hero.slides` and
`images.slides` fields, so the site looks the same until someone saves in the builder. The first save
writes the converted slider; the legacy fields are then ignored.

## The slide model

A slide has a background (image, optional RTL image, optional video, colour, overlay, focal point,
Ken Burns), the built-in copy, product, buttons and wordmark, and up to 40 free layers (text, image,
button, shape). The slider has global settings (transition, duration, autoplay interval, pause on
hover, arrows, numbers); a slide may override the transition and interval.

Transitions: `wipe` (the original), `fade`, `slide`, `zoom`, `circle`, `curtain`, `none`. Reduced
motion always uses `none`.

### Devices

Every visual field is responsive. The top-level value is the desktop value; `tablet` and `mobile`
sub-objects override it (`atDevice()` merges desktop → tablet → mobile). Breakpoints match the
site: tablet `(max-width: 1099px)`, mobile `(max-width: 767px)`.

### Position and stacking

Offsets and layer positions are percentages of the slider width (`cqw`, the hero is a size
container), so a design scales with the screen. In RTL, horizontal offsets are mirrored. The z
scale: background 0, wordmark 10, product 20, copy 30, controls 40, free layers 50 by default. A
text layer with z 15 sits under the product image, whatever the image format.

### How it renders

`components/sections/hero/HeroSection.tsx` (server) turns the slides into one `<style>` block with
`sliderCss()`. Only validated values reach CSS: colours pass `safeColour`, font ids `safeFontId`,
numbers are clamped. The client `Hero.tsx` runs the transitions and layer animations (GSAP,
transform, opacity and clip-path only). Only the first slide's media load with the page; videos never
preload.

## Image compression

Uploads take `?compress=original|standard|balanced|max` (`apps/opex-api/src/media/contract.ts`).
The media library remembers the uploader's choice and defaults to `original` (highest quality, no
resizing below 8192 px). Videos (mp4, webm) and fonts (woff2, woff, ttf, otf) are stored as
uploaded.

## Fonts

- Upload a family at /fonts (several files: weights and italic). Only `/media/ast_…` font URLs are
  emitted as `@font-face`, with `font-display: swap`.
- Per language: body and heading font (`:root:lang(xx)` sets `--font-sans` and `--font-ui`).
- Per section: header, footer and each home section (`[data-font-scope]`).
- Slider layers and copy have their own font choice per device.

A browser downloads a font file only when text on the page uses it.

## Using the slider elsewhere

The data model is page-agnostic (`SLIDER_FIELD`, `sliderOf`, `sliderCss`). To add a slider to
another page: add the field to that page's entry in `generate.ts`, regenerate the schema, and render
`HeroSection` with that entry's slider. The console studio takes the entry key, so a second studio
route is a few lines.
