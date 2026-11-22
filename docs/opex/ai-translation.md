# AI translation (OPEX console)

Operators write in one language (usually Persian) and let Claude fill the others. Everything the
translator writes goes into a **draft**; nothing reaches the website until it is published.

## Where it is

| Place | What it translates |
|---|---|
| **Console → ترجمه با هوش مصنوعی** (`/translate`) | Any mix of pages and globals, blog posts and the blog lists (categories, tags, authors), or all of them. Shows per language how many values are empty, runs the chosen items one by one, then offers to publish what changed. |
| **Content editor** (`/content/<type>`) → «ترجمه با هوش مصنوعی» | The whole entry. Unsaved edits are saved first. |
| **Visual editor** (`/visual`) → «ترجمه» in the inspector | The selected section: a page-builder block is translated on its own (`scope = /sections[id=…]`), a built-in section translates the entry its copy lives in. |
| **Blog editor** (`/blog/<id>`) → «ترجمه به چند زبان» | The post into several languages at once (saved). The older per-language "draft from …" buttons still fill one language in the form without saving. |

Every control takes a source language, **one or more target languages**, and a mode:

- **فقط جاهای خالی** (`missing`, default): only values that are empty in a target are filled.
  Hand-written translations are never touched.
- **همه را دوباره ترجمه کن** (`all`): every value is translated again and replaces the target text.

An optional note goes to the translator ("formal tone", "keep the word X").

## What is translated

The API walks the entry's schema (`packages/schema/src/translate.ts`): every localized text field and
image alt text. Locked fields (3D geometry, sizes), URLs, numbers and media are left alone. Field
length limits are passed to the model; a translation that is still too long is dropped rather than
breaking the save. Inline markup (bold, italic, links: the link text is translated, never the address) and placeholders are kept.

For blog posts a missing language gets a complete translation (title, slug made from the translated
title, excerpt, body blocks, takeaways, FAQ, SEO title/description/keyphrase, keywords; sources and
the OG image are copied) and is switched on in the draft. With `missing`, an existing translation only
gets its empty parts.

Edits made while the AI works are safe: a value is written only if its source text is still the one
that was translated.

## API

`GET /v1/manage/translate` (coverage), `POST /v1/manage/translate/entries/:type`,
`POST /v1/manage/translate/blog/:id`, `POST /v1/manage/translate/blog-taxonomy`. Contracts:
`apps/opex-api/src/translate/contract.ts`; every call accepts `dryRun: true` to count without calling
the AI. Permissions: `content.write`, `blog.write`, `blog.manage`. Audit: `content.translate`,
`blog.post.translate`, `blog.taxonomy.translate`.

## Setup

Set `ANTHROPIC_API_KEY` in the opex-api environment (`infra/.env`), then restart the service:

```bash
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env up -d opex-api
```

Without the key the console shows a notice and the buttons answer `AI_OFF`. Requests run three at
a time in chunks of about 6,000 characters; a full-site run of a few dozen pages takes a few minutes.

## Adding a language

The translator, coverage counts and console pickers read the language list from
`packages/schema/src/fields.ts` (`LOCALES`, `FALLBACK`) and `LOCALE_INFO` in
`packages/schema/src/translate.ts`. To add, say, Arabic:

1. Add `"ar"` to `LOCALES`, a `FALLBACK` row and a `LOCALE_INFO` row (name, native name, `rtl`).
2. Add the locale to the website: `apps/web/lib/i18n/config.ts`, a dictionary in
   `apps/web/lib/i18n/dictionaries/`, fonts, `hreflang`/sitemap, and the places that still list
   `fa | en | tr` by hand (`grep -rn '"fa", "en", "tr"' apps packages`).
3. Regenerate the schema (`pnpm --filter @arapoush/schema generate`) and the API docs (`pnpm docs:api`).
4. Open **ترجمه با هوش مصنوعی**, choose Persian → Arabic, «همه», and run: every page, post and list is
   drafted in the new language. Review, then publish.
