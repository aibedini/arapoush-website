# Arapoush Gostar — website

Marketing site for **Arapoush Gostar (آراپوش گستر)**, maker of multi-layer plastic tubes and effervescent
tablet tubes. Persian (default, RTL), English and Turkish. Next.js 15, GSAP and animate-ui.

## Install on a Linux server — one line

```bash
curl -fsSL https://raw.githubusercontent.com/aibedini/arapoush-website/main/install.sh | sudo bash
```

With your domain and automatic HTTPS (point the domain's DNS `A` record to the server first):

```bash
curl -fsSL https://raw.githubusercontent.com/aibedini/arapoush-website/main/install.sh | sudo DOMAIN=arapoush.com bash
```

### Update to the latest release

```bash
sudo arapoush update
```

The installer adds an `arapoush` command. Updates reuse the settings of the first install (domain, port, …, saved in
`/etc/arapoush.conf`). The new version is built next to the running one, so the site stays up while it builds.
If the build fails or the new version doesn't start, the site keeps running, or goes back to the previous version.

| Command | What it does |
|---|---|
| `sudo arapoush update` | Install the newest release (`v*` tag) |
| `sudo arapoush update v1.1.0` | Install that release (also for going back) · `update main` = latest commit |
| `arapoush check` | Is a newer release out? |
| `arapoush version` | Running version, commit and build date |
| `sudo arapoush rollback` | Switch back to the previous build instantly |
| `arapoush logs` / `sudo arapoush restart` | Follow logs / restart |

Automatic nightly updates: install once with `AUTO_UPDATE=1` (systemd).

The installer works on Ubuntu, Debian, Rocky, AlmaLinux, CentOS Stream, Fedora, openSUSE, Arch and Alpine,
on x86-64 and ARM servers. It:

1. installs git and Node.js 22 LTS (official build, checksum-verified) if they are missing,
2. adds a swap file on servers with less than 2 GB RAM so the build doesn't run out of memory,
3. downloads the newest release to `/opt/arapoush/releases/<version>`, builds the site and runs it as a service (systemd or OpenRC) that restarts on reboot or crash,
4. with `DOMAIN`, puts [Caddy](https://caddyserver.com) in front for a free, auto-renewing HTTPS certificate,
5. opens the needed ports in ufw/firewalld and checks the site is answering.

| Option | Default | Meaning |
|---|---|---|
| `DOMAIN` | – | Serve on 80/443 with HTTPS for this domain |
| `WWW=1` | off | Also answer on `www.DOMAIN` and redirect it |
| `PORT` | `80` | Public port when no `DOMAIN` is set |
| `SITE_URL` | `https://DOMAIN` or `http://SERVER-IP` | Canonical URL used for SEO tags, sitemap and structured data |
| `VERSION` | `latest` | `latest` = newest release, or a tag (`v1.0.0`) or branch (`main`) |
| `AUTO_UPDATE=1` | off | Install new releases automatically every night |
| `FORCE=1` | off | Rebuild even if that version is already running |
| `BRANCH` | `main` | Branch used while there are no releases |
| `APP_DIR` | `/opt/arapoush` | Install location |
| `NODE_MIRROR` | `https://nodejs.org/dist` | Node.js download mirror |
| `NPM_REGISTRY` | npmjs.org | npm registry mirror, for servers with slow access to npm |
| `NO_SWAP=1` | off | Don't add a swap file |
| `UNINSTALL=1` | off | Remove the service, Caddy config and `/opt/arapoush` |

Example with options: `curl -fsSL …/install.sh | sudo DOMAIN=arapoush.com WWW=1 bash`

Logs: `arapoush logs` · Restart: `sudo arapoush restart`

### With Docker instead

```bash
git clone https://github.com/aibedini/arapoush-website.git && cd arapoush-website
SITE_URL=https://arapoush.com docker compose up -d --build
```

---

## نصب روی سرور لینوکس با یک دستور

```bash
curl -fsSL https://raw.githubusercontent.com/aibedini/arapoush-website/main/install.sh | sudo bash
```

با دامنه و HTTPS خودکار (اول رکورد `A` دامنه را به IP سرور وصل کنید):

```bash
curl -fsSL https://raw.githubusercontent.com/aibedini/arapoush-website/main/install.sh | sudo DOMAIN=arapoush.com bash
```

برای **به‌روزرسانی به آخرین نسخه**:

```bash
sudo arapoush update
```

تنظیمات نصب اول (دامنه، پورت و…) حفظ می‌شود. نسخه جدید کنار نسخه فعلی ساخته می‌شود و سایت در این مدت از دسترس خارج نمی‌شود.
اگر ساخت خطا بدهد یا نسخه جدید بالا نیاید، سایت روی نسخه قبلی می‌ماند یا به آن برمی‌گردد.
بررسی نسخه جدید: `arapoush check` · نسخه فعلی: `arapoush version` · بازگشت به نسخه قبل: `sudo arapoush rollback` ·
نسخه مشخص: `sudo arapoush update v1.0.0` · به‌روزرسانی خودکار شبانه: یک بار با `AUTO_UPDATE=1` نصب کنید. اگر سرور به npm یا nodejs.org دسترسی کندی دارد،
با `NPM_REGISTRY` و `NODE_MIRROR` یک میرور بدهید.

---

## Development

Monorepo (pnpm workspaces + Turborepo). Node 22 LTS and pnpm (`corepack enable`; the version is pinned in
`package.json`).

```bash
pnpm install
pnpm dev             # the website: http://localhost:3000 → /fa
pnpm build && pnpm start
pnpm test            # configurator catalogue rules + quote flow (node --test)
pnpm check           # everything CI runs: typecheck, lint, test, build
```

OPEX locally (API on :4000, console on :3300):

```bash
pnpm --filter @arapoush/opex-api dev        # migrates and imports the site's content on first start
OPEX_NEW_PASSWORD='…' pnpm --filter @arapoush/opex-api cli create-operator you@example.com "Your Name" super_admin
pnpm --filter @arapoush/opex-console dev    # sign in, then set up the authenticator app
```

The console reads `OPEX_API_URL` (default `http://127.0.0.1:4000`) and `SITE_URL` for site image previews.

The website reads its content from OPEX when these are set (otherwise it renders from its own files, as
before):

| Variable | What |
|---|---|
| `OPEX_DELIVERY_URL` | OPEX API origin, e.g. `http://127.0.0.1:4000`; `/media/*` is proxied there |
| `OPEX_DELIVERY_TOKEN` | Same value as the API's `DELIVERY_TOKEN` |
| `OPEX_WEBHOOK_SECRET` | Same value as the API's `SITE_WEBHOOK_SECRET`; OPEX posts to `/api/opex/revalidate` after a publish |

If OPEX is down, the site keeps the last content it loaded, or falls back to the snapshot
(`packages/schema/src/generated/seed.json`). Previews open through `/api/opex/preview`, a link
OPEX signs (30 minutes). After changing the dictionaries or `content/*.json`, regenerate the
snapshot with `pnpm --filter @arapoush/schema generate`.

| Folder | What |
|---|---|
| `apps/web` | The website (Next.js). Paths below are relative to it. |
| `apps/opex-api` | OPEX core API (Fastify; PGlite in dev, Postgres in production): content, identity, audit, media, Delivery API |
| `apps/opex-console` | OPEX operator console (Next.js, Persian RTL) on port 3300; it reaches the API through same-origin rewrites |
| `packages/schema` | Content types, validation and field paths shared by the site, the API and the console |
| `packages/config` | Shared TypeScript and ESLint presets |
| `docs/opex` | OPEX content platform plan (admin, API, audit) |
| `.github/workflows/ci.yml` | CI: checks, Lighthouse budgets, Docker image, installer upgrade and rollback test |

- Section order of the home page: `content/home-layout.json` (backend drag-and-drop writes this list).
- Text for every language: `lib/i18n/dictionaries/`.
- Contact details, social links, catalog PDF path: `lib/site.ts`. Put the catalog at `public/files/arapoush-catalog.pdf`.
- SEO and AI indexing: `lib/seo.ts`, `app/sitemap.ts`, `app/robots.ts`, `/llms.txt`, `/llms-full.txt`.
- Tube product content (admin panel / backend): `content/products/multi-layer-tube.json` — hero and layer images per text direction, tube shapes with their diameters, lengths and nominal volumes, closures with compatibility, wall structures and their layers, and product samples. Add or remove any of them there (or serve the same shape from the backend in `lib/products.ts`); the configurator, samples, 3D model, URL validation, JSON-LD and `/llms.txt` all follow. Rules: `lib/configurator/model.ts`. 3D scene: `components/configurator/TubeScene.ts` (Three.js, bundled, loaded on intent).
- Quality bar (Lighthouse, accessibility, motion and RTL rules): see `CLAUDE.md`.

Fonts: Helvetica Neue (licensed, supplied by Arapoush), Vazirmatn, Inter and JetBrains Mono (SIL OFL).
