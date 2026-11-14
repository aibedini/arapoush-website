# Arapoush blog: architecture and plan

Status: implemented in the commit that adds this file. Sections marked *later* are follow-ups.

## 1. Payload CMS or OPEX?

Payload 3 does multilingual content well: field-level localization with fallback, drafts, versions,
live preview and scheduling. But it is a **whole second CMS** with:

- its own admin panel (`/admin`);
- its own users, roles and sessions;
- its own media library and database tables.

Next to OPEX that means:

| Concern | Payload next to OPEX | Blog inside OPEX (chosen) |
|---|---|---|
| Admin panels | two (OPEX + Payload `/admin`) | one |
| Users, MFA, permissions, audit | two systems to keep in step | the existing ones (S1 permissions, MFA, hash-chained audit) |
| Media | second library, no ClamAV scan | same library, scanned, public only on publish |
| Backups, restore | Payload DB outside the OPEX backup | included in the OPEX backup |
| Preview, publish webhook, revalidation | rebuilt for Payload | same mechanisms |
| Running cost | one more Node app and DB in RAM | nothing new |

Payload's strengths that matter here are rebuilt in OPEX:

- per-locale content and fallback;
- immutable revisions with history and restore;
- draft, review and scheduled states;
- signed preview links.

So the blog is an **OPEX module**, edited in the OPEX console, and the website renders it.

## 2. Content model

One post holds up to three translations (fa, en, tr). A translation goes live only when it is
*enabled* and has a title, slug and body, so a post can be Persian-only for a while. Translations
link to each other automatically (hreflang).

```
post
├─ status: draft | review | scheduled | published | archived
├─ category, tags[], author, reviewer (E-E-A-T "reviewed by"), cover image, featured
├─ related products (tube, effervescent, printing, applications), related posts
└─ translations.{fa,en,tr}
   ├─ enabled, title, slug, excerpt
   ├─ body: blocks (paragraph, heading, list, image, quote, callout, table, video, CTA)
   ├─ keyTakeaways[] (TL;DR, GEO), faq[] (FAQPage), sources[] (citations)
   └─ seo: title, description, focus keyphrase, canonical, noindex, OG image
```

- **The body is structured blocks, not HTML.** No raw HTML reaches the site, so there is no XSS
  path. The website renders clean semantic markup, and the table of contents, reading time, word
  count and FAQ schema are computed from the blocks.
- **Inline formatting is a small, safe subset:**
  - `**bold**` and `*italic*`;
  - links (link text in square brackets, then the address in round brackets): internal paths, or external links that get `rel="noopener"`.

Tables:

| Table | What it holds |
|---|---|
| `blog_posts` | The post, its state and pointers to its draft and published revisions |
| `blog_revisions` | Immutable snapshots of every save, used for history, diff and restore |
| `blog_slugs` | Every slug a translation ever had. The current one is live; old ones answer with a **301** redirect, so a renamed slug keeps its ranking |
| `blog_categories` | Localized name, slug and description, plus an order |
| `blog_tags` | Localized name and slug |
| `blog_authors` | Name, role, bio, photo, expertise and `sameAs` links (E-E-A-T), optionally tied to an operator account |

## 3. Permissions

Each blog permission is checked by the API, like every other console function:

| Permission | Allows |
|---|---|
| `blog.read` | See posts and their history |
| `blog.write` | Edit any draft |
| `blog.write_own` | Create posts and edit only one's own |
| `blog.publish` | Publish, schedule, unpublish, restore a revision (sensitive) |
| `blog.manage` | Categories, tags, authors (sensitive) |
| `blog.delete` | Archive posts (sensitive) |

- **New built-in role `blog_author`.** It can write and preview its own posts and upload media. It
  sends posts to review but cannot publish, so a freelance writer can be hired safely.
- **Existing roles.** `operator` gets every blog permission except `blog.delete`; `viewer` gets
  `blog.read`.
- **Custom roles** can mix these permissions like any other (for example "blog editor").

## 4. Workflow

Draft → *Send for review* (authors) → an editor publishes now or at a date → published.

- **Saving.** Every save is a revision, and an edit made on an old base is refused (412), as with
  page content.
- **Scheduled posts** are published by the scheduler within 30 seconds of their time.
- **Publishing:**
  - checks that the referenced media are scanned clean, then makes them public;
  - records the current slugs;
  - sends the signed webhook, so the website refreshes the post, the lists, the sitemap, the RSS
    feeds and `llms.txt`.
- **Unpublish** takes the post off the site. Its URLs then answer 404, and the post stays in OPEX.
- **Preview** is a 30-minute signed link to the real article page, `noindex` and never cached.

## 5. SEO and GEO, built in

On the website:

- **Pages:**
  - `/{locale}/blog`, with pages `/{locale}/blog/page/{n}`;
  - `/{locale}/blog/{slug}`;
  - `/{locale}/blog/category/{slug}`;
  - `/{locale}/blog/author/{slug}`.
- **Tags** filter the list but have no indexable pages, which would be thin content.
- **Metadata on every page:**
  - title, description and canonical;
  - hreflang only to translations that really exist, plus `x-default`;
  - Open Graph `article` (published and modified times, section, tags) and a Twitter card;
  - robots, with `noindex` per translation when set.
- **JSON-LD:**
  - `BlogPosting` with headline, description, image, `datePublished` and `dateModified`,
    `inLanguage`, `wordCount`, `keywords`, `articleSection`, author `Person` (url, jobTitle,
    sameAs, knowsAbout) and `reviewedBy`;
  - publisher: the site `Organization` (`@id`), with `mainEntityOfPage` and `citation` (sources);
  - `BreadcrumbList` and `FAQPage` (from the FAQ);
  - `Blog` / `CollectionPage` with an `ItemList` on lists, and `ProfilePage` + `Person` on author
    pages.
- **Sitemap:** every live translation with its real `lastmod`, hreflang alternates and images.
  Category and author pages are included too.
- **RSS:** `/{locale}/blog/feed.xml`, advertised with `<link rel="alternate">`.
- **llms.txt / llms-full.txt:** posts listed with their summary and key takeaways, so AI engines
  can quote them.
- **GEO for AI answers.** An answer-first excerpt, a "Key takeaways" box, FAQ, cited sources,
  author credentials, visible dates and reading time. The table of contents gives every heading an
  anchor, so a passage can be linked.
- **Speed:** server components only (no client JS for an article), `next/image` with real `sizes`,
  and only the cover image loads eagerly.

In the console, a live **SEO and GEO checklist** runs per translation:

- title length (30 to 60), description length (70 to 160) and slug;
- the focus keyphrase in the title, slug, description and first paragraph;
- one H1 (the title) and H2 before H3;
- every image has alt text;
- internal links to product pages; at least 600 words;
- excerpt, key takeaways, FAQ and sources present;
- author and cover set; other translations present.

It also shows a Google result preview.

## 6. Arapoush-specific features

- **Related products** block at the end of an article: multi-layer tubes, effervescent tubes,
  printing, applications. A **"Request a quote" CTA block** inside the body links to the contact
  page.
- **The home page "Insights" section** shows the newest real posts once there are three to fill
  the row (until then its built-in teasers). Its "View all" link goes to the journal.
- **The site menu** gets "Journal" automatically when the OPEX menu lacks it (OPEX content replaces
  the whole list), and the footer's "Insights & Journals" link opens the journal.
- Persian-safe slugs (Persian letters kept, ZWNJ → hyphen), RTL-aware rendering and Persian digits
  in dates.

## 7. API

- **Console** (`/v1/manage/blog/...`):
  - posts: list, create, read, save draft, submit for review, publish, schedule, unpublish,
    archive, revisions, restore, preview;
  - categories, tags, authors: full create, read, update and delete;
  - every route has a contract and an audit action.
- **Delivery** (`/v1/delivery/blog/...`, website only, bearer token):
  - list (locale, page, category, tag, author);
  - one post by locale and slug, with a redirect answer for an old slug;
  - taxonomy; sitemap feed; preview of one post.

## 8. Later

- Comments (needs moderation and spam control).
- A newsletter.
- AI-assisted translation drafts in the editor.
- Search on the blog index.
- Related-post suggestions by content similarity.
