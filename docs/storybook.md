# Component catalogue (Storybook)

Storybook documents the shared UI of the site (`apps/web`) and the OPEX console (`apps/opex-console`).
Each story is a live example and a test: it must render, its `play` steps must pass, and axe must
find no accessibility violation (`a11y.test: "error"`).

The scope is narrow on purpose (docs/DOCS-PLAN.md, decision 2). Full-page sections with GSAP and
Three.js are checked with Lighthouse on the production build, not here.

## Run it

```bash
pnpm storybook
```

Site catalogue at http://127.0.0.1:6006.

```bash
pnpm storybook:console
```

Console catalogue at http://127.0.0.1:6007.

```bash
pnpm docs:stories
```

Runs every story as a test in headless Chromium, for both apps. CI runs the same in the `storybook`
job and keeps the built catalogues as an artifact.

Locally the tests use the installed Chrome. In CI they use Playwright's Chromium.

## What is covered

| App | Story file | States |
|---|---|---|
| site | `components/forms/OpexForm.stories.tsx` | empty (fa), English, validation errors, conditional field, sent, rate limited |
| site | `components/sections/blocks/Block.stories.tsx` | rich text, image + text, dark call to action, FAQ, spacer |
| site | `components/ui/RollText.stories.tsx` | primary, ghost, light on dark, Persian |
| site | `components/configurator/ChipGroup.stories.tsx` | default, RTL keyboard, English |
| site | `components/layout/Header.stories.tsx` | desktop, English, mobile menu |
| site | `components/about/Honours.stories.tsx` | wall (fa), filter and viewer (en), list |
| site | `components/about/FactoryGallery.stories.tsx` | filmstrip, next arrow (en), mosaic |
| site | `components/contact/Directory.stories.tsx` | tabs (fa), grid, keyboard tabs (en), mobile links |
| site | `components/contact/Locations.stories.tsx` | split (fa), stacked, with coordinates (en) |
| site | `components/contact/Faq.stories.tsx` | groups (fa), open answer (en) |
| console | `components/ui.stories.tsx` | page heading, modal dialog, error notes, loading |
| console | `components/FieldEditor.stories.tsx` | localized text, all languages, list of items, choice |

## Conventions

- **Locale.** The site's toolbar has a `locale` switch (fa, en, tr). The decorator sets `lang`, `dir`
  and the fonts as the real layout does, so check RTL and LTR. The console is Persian only, with a
  `role` switch for the signed-in operator.
- **Viewports.** Viewports are mobile 390, tablet 768 and desktop 1440.
- **Content.**
  - Copy comes from the real dictionaries: `dict(locale)` in `apps/web/.storybook/fixtures.ts`.
  - Do not invent strings that the site would never show.
- **Network.**
  - Stories never call the API.
  - Use `mockFetch(status, body)` from the fixtures, and restore it in the story's cleanup.
- **Interaction tests.**
  - Query by role and accessible name, as a screen-reader user would.
  - A test that needs `getByTestId` usually means the control has no proper name.
- **Fonts.** Fonts live in each app's `app/fonts.ts`, so the layout and Storybook load the same
  files.

## Adding a story

1. Create `Component.stories.tsx` next to the component. Give the meta a `title` such as
   `Layout/Header` or `Console/FieldEditor`.
2. Add one story per state a user can reach: empty, filled, error, success and loading, in Persian
   and in English.
3. Add a `play` function for any behaviour, such as keyboard use, opening, submitting or moving.
4. Run `pnpm docs:stories`. Fix any accessibility violation in the component, not in the story.
5. A changed story counts as documentation for the commit-msg rule
   (`scripts/docs/impact.mjs`).
