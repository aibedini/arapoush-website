# P11–P13: form builder, ticketing, visual editor, editor UX

Decisions (2026-11-12, with the client owner):
- Visual editor is **section-level**: inline text and image editing on the real page, a section
  library, drag to reorder, per-section variants. Layout, CSS and motion stay locked (protects
  design, RTL and the Lighthouse 100 rule).
- Ticket replies are **two-way email**: replies leave from the ticket, and customer answers thread
  back into it (IMAP mailbox).
- Routing uses **teams + rules** with round-robin auto-assign and SLA timers.

Build order: P11 forms + tickets, then P12 visual editor (which places forms as sections), then
P13 content-editor UX. One commit per phase.

## P11 — Form builder and ticketing

### Forms (API: `src/forms/`)
- `forms`: slug, status (`draft|published|archived`), `draft` and `published` definitions, and
  `version`. Every publish writes a `form_versions` row, and each submission keeps the version it
  used, so labels stay correct after later edits.
- A definition holds:
  - `title`, `intro`, `submitLabel`, `success` (localized fa/en/tr);
  - `fields[]`;
  - `settings`:
    - routing: team, priority, rules;
    - `notify` (operator emails);
    - `confirmation` (localized email to the submitter);
    - `page` (standalone page and indexable or not);
    - `retentionDays` and `perIpLimit`.
- **Field types:**
  - inputs: `text`, `textarea`, `email`, `phone`, `number`, `select`, `radio`, `checkbox`,
    `checkboxes`, `date`, `file`;
  - `consent`;
  - layout: `heading` and `paragraph`;
  - `hidden`: page, UTM.
- **Each field has:**
  - `id`, a localized `label`, `help` and `placeholder`;
  - `required` and `width` (full or half);
  - `options` (localized);
  - `min`/`max`/`pattern`;
  - `showIf` (field, op, value);
  - `role` (`name`, `email` or `phone`), which marks the requester's identity fields for threading.
- **Validation** is one zod builder made from the definition (`buildValidator`) and used on both
  sides: the API rejects anything the definition doesn't allow, and the site validates the same
  rules client-side.
- **Delivery API:**
  - `GET /v1/delivery/forms/:slug` returns the published definition;
  - `POST /v1/delivery/forms/:slug` accepts a submission, plus multipart for file fields (ClamAV,
    10 MB, at most 3 files).
  - Spam controls from P8 still apply: honeypot, minimum fill time, Turnstile and a per-IP limit.
- **Migration:** `quote` and `contact` become seeded system forms, and existing inquiries become
  tickets. The old endpoint keeps working (it maps the P8 shape onto the new form).

### Tickets (API: `src/tickets/`)
- **`tickets` table:**
  - `number` (#1001…, per tenant), form, form version, channel (`form|email`), subject;
  - status: `new → open → pending (waiting on customer) → on_hold → resolved → closed`, plus `spam`;
  - priority (`low|normal|high|urgent`), team, assignee, tags;
  - requester fields `requester_enc` and `requester_hash` (HMAC of the email, used for matching);
  - SLA timestamps (`first_response_due`, `resolve_due`, `first_response_at`).
- **`ticket_events`**, an append-only timeline:
  - kinds: `created`, `viewed`, `assigned`, `transferred` (refer, with a message), `team`,
    `status`, `priority`, `tags`, `note` (internal, with @mentions), `reply_out`, `reply_in`,
    `merged`, `spam`;
  - bodies are encrypted (`body_enc`).
- **`ticket_reads`** (principal and last read event) drive unread state and show "seen by …" per
  event.
- **Who opened it and who read it:**
  - every opening writes a `viewed` event, debounced to one per operator per 10 minutes;
  - it is also audited (`ticket.read`);
  - the timeline shows the first opener and the readers of each message.
- **Assignment:**
  - assign to a person or a team, or "refer to …" with a required message;
  - the target gets a notification, and the event shows in the timeline;
  - round-robin auto-assign within a team (members marked available, least open tickets first);
  - "send internally" is a referral to a colleague with a note, and it does not change the owner
    unless that is ticked.
- **Teams:** `teams` and `team_members` (role `agent|lead`).
  - Operators see tickets of their teams and those assigned to them; super admins see all.
  - Viewers and auditors have read-only access.
- **Rules** (per form, evaluated in order): `field op value → team / priority / tags / assignee`.
- **SLA** per team and priority: first response and resolution targets in business minutes
  (24/7 for now). A worker flags breaches and notifies the team leads.
- **Notifications:** an in-console notification center (`notifications` table, bell with unread
  count); email to the operator is optional per user.
- **Saved replies:** per team, localized, with `{{name}}` and `{{number}}` placeholders.
- **Email:**
  - **Outbound:** the reply is sent from `SUPPORT_FROM`.
    - `Message-ID: <tkt.{id}.{event}@{domain}>`;
    - `References` keeps the thread together;
    - the subject carries `[#1042]`;
    - each send goes through `email_outbox` (generalized: `kind`, `ticket_id`, `event_id`).
  - **Inbound:** an IMAP poller (`imapflow` + `mailparser`, `IMAP_URL`) reads new mail.
    - Matching: `In-Reply-To`/`References` to our Message-ID, then `[#n]` plus the sender hash,
      otherwise a new email-channel ticket.
    - Quoted history and signatures are trimmed (best effort), and the full raw message is kept
      encrypted.
    - Auto-replies (`Auto-Submitted`, `Precedence: bulk`) are ignored.
- **Merge** keeps one ticket and moves the events. **Spam** hides the ticket and blocks the
  sender hash for 30 days.
- **Retention:** per-form `retentionDays` (default 730), and closed tickets are purged after it.
  Erasure: super admin with step-up.

### Console
- **Forms:**
  - a list page;
  - a **builder** with three panes: field palette, canvas with drag reorder plus move-up/down
    buttons and keyboard support, and a field inspector;
  - a live preview in all three locales;
  - a settings tab (routing, notify, confirmation, page);
  - publish/draft controls and version history.
- **Tickets inbox** (three panes):
  - **Views:** mine, unassigned, my teams, all, overdue SLA, waiting, closed, spam; filters and
    search.
  - **List:** bulk actions; unread rows in bold; badges for SLA, priority and channel.
  - **Conversation timeline:** customer messages, replies, internal notes (tinted), and
    system events.
  - **Composer:** tabs "reply to customer / internal note", saved replies, @mention.
  - **Details sidebar:** status, priority, team, assignee, tags, requester, submitted fields,
    who has seen it, SLA clocks.
  - **Keyboard:** `j/k` move, `a` assign, `r` reply, `n` note, `e` resolve, `?` help.
- **Settings:** teams and members, availability, SLA targets, saved replies, mailbox status.

### Site
- `components/forms/OpexForm`: a server-rendered form from the definition, with a small client
  island for validation, `showIf`, file upload and submit. Logical properties, RTL, and AA
  contrast.
- Pages:
  - `/[locale]/forms/[slug]` for forms with `page.enabled`;
  - added to the sitemap and `llms.txt` only when `page.indexable`.
- The quote sheet and contact keep their UI and post through the generic route.

## P12 — Visual on-page editor

- **Layouts become per page:**
  - `page.home.layout` sections gain `variant` and `props`;
  - new **blocks** with their own data: `form`, `richText`, `imageText`, `cta`, `faq`, `spacer`;
  - built-in sections stay singletons.
- **Custom pages:** `page.custom` entries hold a slug, SEO fields and a block list, served at
  `/[locale]/p/[slug]`, with sitemap, hreflang, `llms.txt` and JSON-LD.
- **Edit mode:** draft mode plus `?edit=1`, inside the console iframe.
  - Sections render with `data-opex-section` / `data-opex-entry` wrappers (`display: contents`).
  - A lazily loaded overlay script maps text nodes and images to content paths, using the draft
    values within each section's entry.
  - It talks to the console over `postMessage`, with the origin checked against
    `OPEX_CONSOLE_ORIGIN`.
  - Production visitors never load it.
- **Console visual editor** (`/visual`):
  - **Top bar:** page, locale, width (390/768/1440), undo/redo, save draft, preview, publish or
    send for review.
  - **Left panel:** the section tree (drag, move up/down, hide, duplicate, delete) and an
    "Add section" library.
  - **Center:** the live page iframe; click text to edit it inline, click an image to replace it.
  - **Right panel:** an inspector for the selected section, built from the same field editor.

## P13 — Content editor UX

- Locale tabs instead of three stacked inputs, with a side-by-side compare toggle.
- Collapsible groups with summaries, list items with titles and drag plus buttons, and inline
  validation.
- A sticky save bar with dirty state, an autosaved local draft, field search, and "Show on page"
  (jumps to the visual editor).
- An icon set (Phosphor), a refined token scale, a Swiss-minimal dense style, and full dark mode.
