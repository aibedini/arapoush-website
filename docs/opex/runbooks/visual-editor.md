# Visual editor (P12)

Console: **Visual editor**. Pick a page, a language and a width.

- **Text:**
  - click any text on the page and type;
  - Enter, or clicking elsewhere, keeps it; Esc cancels;
  - each change saves as a **draft** after a pause.
- **Images:** click an image to replace it from the media library.
- **Sections:**
  - the blue label on a section, or its row in the list, opens its fields on the side;
  - on the home page, sections can be added, dragged (or moved with the arrows), hidden, duplicated
    and removed.
  - Built-in sections can only be hidden or moved. Added blocks can also be duplicated and removed.
- **Blocks:** text, image + text, call to action, FAQ (also published as FAQPage structured data),
  a form built in **Forms**, and spacing.
- **Undo / redo:** Ctrl+Z / Ctrl+Y.
- **Publish:** publishes every draft of the page at once. Change requests and policies still apply
  to AraCMS, as before.

Layout, styles and motion are not editable on purpose: they keep the design, RTL and the Lighthouse
scores intact.

**How it works:**

- The console asks OPEX for a signed preview link with `edit=1`. The site then turns on draft mode
  and loads its small editing bridge; visitors never get it.
- The bridge matches page text and images to the draft content and reports edits back with exact
  field paths. Messages are origin-checked both ways (`OPEX_CONSOLE_ORIGIN`, `SITE_URL`).
