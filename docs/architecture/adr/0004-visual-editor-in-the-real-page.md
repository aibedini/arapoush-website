# ADR 0004: The visual editor edits the real site page

Status: accepted · 2026-11-12

## Context

- Operators asked for on-page editing, in the style of Elementor.
- A separate mock renderer in the console would be a second copy of the site. It would drift from the
  GSAP, Three.js and RTL behaviour visitors actually see.

## Decision

- The console's `/visual` page frames the **real website** in draft mode with an `opex_edit` cookie.
- Only in that mode does the site load `components/opex/EditBridge`.
- Sections declare their entry with `EditScope` (`data-opex-entry`). The bridge matches each element
  whose whole text equals a content string, and each image whose source equals a content image.
- Changes go to the console by `postMessage` and are saved as normal drafts, with the same guards,
  locks and audit.
- Page-builder blocks are content (`page.home.layout`). A new block kind needs all three: its schema
  (`blocks.ts`), its renderer (`Block.tsx`) and its console label.

## Consequences

- Visitors never download editor code. The bridge is a dynamic import behind draft mode.
- Text that is assembled in code, rather than taken whole from content, is not editable in place. It
  stays editable in the form editor.
- A new section must wrap itself in `EditScope`, or it is invisible to the visual editor. CLAUDE.md
  states it.
