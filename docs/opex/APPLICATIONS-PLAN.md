# Applications by industry (`/applications`)

One page replaces the five old industry pages (cosmetic, hygiene, pharmaceutical, food and industrial)
and their English versions. The product pages say what Arapoush makes. This page shows what each
product solves in each industry, and turns that into a B2B request.

## Content (OPEX `page.applications`)

- Source: `apps/web/content/applications.json`, typed in `apps/web/lib/applicationsText.ts`, loaded
  by `lib/applications.ts`. It is edited in OPEX like the other pages, and the visual editor sees it
  through `EditScope entry="page.applications"`.
- The schema is inferred, plus `applicationsPage()` in `packages/schema/scripts/generate.ts`. That
  function sets the industry ids and tags as enums, the configurator query and accent colour as plain
  text, and the hotspot positions as numbers.
- Text came from the old pages. The Persian ones were the source of record; the English ones were
  thinner. Facts kept:
  - the 2006 consumer survey;
  - ABL and PBL barrier tubes;
  - the silica-gel caps with a spring;
  - 11-colour print;
  - silk ink up to 20 µm and dry offset at 4–5 µm;
  - masterbatch colouring.

  Nothing promises compatibility. Pharmaceutical, food and chemical compatibility is "reviewed case by
  case".
- Images are the site's own photos. Operators can swap any of them in OPEX.

## Sections

1. **Hero:** five industry photo cards fanned out, the title, and a chip row. Every card and chip
   links to `#{industry}`.
2. **Industry showcase:**
   - one panel per industry: photo, needs, the Arapoush answer, typical products, a link to the
     configurator preset (`configure` query) and a quote button;
   - each panel also holds the long merged text from the old page;
   - all five panels are server-rendered, and `IndustryTabs` only chooses which one shows, so every
     industry's text is in the HTML;
   - `#cosmetics`, `#hygiene`, `#pharma`, `#food` and `#industrial` open their panel.
3. **Solution finder:** industry, contents and priority give a suggested structure, closures from
   the catalogue, print methods and what to send. It never promises compatibility.
4. **Engineering:** the opened-up layers image with five hotspots (layers, barrier, closures, sizes,
   print), each linking to the product or printing page.
5. **Sample projects:** filtered by industry, with a lightbox. These are sample designs only; no
   customer names are used without permission.
6. **Quality:** the four steps every order takes, plus a link to the certificates (About → honours).
7. **Quote:** the OPEX system form `applications-quote`.
   - The industry is preselected from the tab or the finder.
   - Storage and moisture questions show for pharmaceutical and food.
   - A hazard question shows for industrial.
   - The request becomes a sales ticket with a tracking number.
8. **FAQ:** filtered by industry, and also published as FAQPage JSON-LD.

## Old URLs

`next.config.ts` → `redirects()` sends each old page, Persian slug or `/tubes-*`, permanently to its
panel, for example `/tubes-food` → `/en/applications#food`.

## SEO

- `generateMetadata` and `applicationsJsonLd`: the industries as Services in an ItemList, FAQPage
  and BreadcrumbList.
- The sitemap entry includes the industry and project images, and llms.txt and llms-full.txt carry
  the full industry facts.
- The header's «کاربردها», the footer and the search now point to `/applications`. The home
  application cards link to their panel.

## Progress

- P1: content, schema, hero, industry showcase, SEO, redirects and links.
